"""Train a shared linear projection on the frozen v4 encoder; usable standalone in Colab."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np

V4_SHA = "76cbab6ba7b27672b1f3b5e0b48260b5a4bc0d5d942d4ccaeb625948ab2e5600"


def digest(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def vectors(folder, queries, passages):
    from fastembed import TextEmbedding
    from fastembed.common.model_description import ModelSource, PoolingType

    name = "tesda-track/" + folder.name
    if not any(m["model"] == name for m in TextEmbedding.list_supported_models()):
        TextEmbedding.add_custom_model(model=name, pooling=PoolingType.MEAN, normalization=True,
                                       sources=ModelSource(hf=name), dim=384, model_file="onnx/model.onnx")
    encoder = TextEmbedding(name, specific_model_path=str(folder), threads=4)

    def encode(prefix, texts):
        return np.stack(list(encoder.embed([prefix + t for t in texts], batch_size=8))).astype(np.float32)

    return encode("query: ", queries), encode("passage: ", passages)


def unit(x):
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-12)


def fit(q, p, targets, counts):
    import torch
    from torch.nn import functional as F

    torch.set_num_threads(2)
    # Small full-batch problem even on CPU. Identity preserves v4 exactly at step zero.
    q, p, targets = map(torch.from_numpy, (q, p, targets))
    weights = torch.tensor(1 + np.minimum(np.log1p(counts), 3), dtype=q.dtype)
    identity = torch.eye(p.shape[1])
    delta = torch.zeros_like(identity, requires_grad=True)
    opt = torch.optim.SGD([delta], lr=0.12)
    history = []
    for step in range(41):
        scores = 30 * F.normalize(q @ (identity + delta)) @ F.normalize(p @ (identity + delta)).T
        # Give each catalog owner positive mass, including when a title has several owners.
        ce = -(targets * scores.log_softmax(dim=1)).sum(dim=1)
        loss = (ce * weights).sum() / weights.sum()
        history.append(loss.item())
        if step < 40:
            opt.zero_grad()
            (loss + 0.04 * delta.square().sum()).backward()
            opt.step()
    return (identity + delta.detach()).numpy(), history


def export(base, output, matrix):
    import onnx
    from onnx import helper, numpy_helper

    model = onnx.load(base / "onnx/model.onnx")
    graph = model.graph
    assert len(graph.output) == 1
    hidden = graph.output[0].name
    graph.initializer.append(numpy_helper.from_array(matrix, "v5_projection"))
    # Linear projection commutes with fastembed's masked mean. L2 normalization happens last.
    graph.node.append(helper.make_node("MatMul", [hidden, "v5_projection"], ["v5_hidden"]))
    graph.output[0].name = "v5_hidden"
    (output / "onnx").mkdir(parents=True)
    onnx.save(model, output / "onnx/model.onnx")
    onnx.checker.check_model(str(output / "onnx/model.onnx"))
    for name in ("config.json", "tokenizer.json", "tokenizer_config.json", "calibration.json"):
        shutil.copyfile(base / name, output / name)


def rank_report(q, p, mask):
    rank = np.argsort(-(unit(q) @ unit(p).T), axis=1, kind="stable")
    correct = np.take_along_axis(mask, rank, axis=1)
    pos = np.argmax(correct, axis=1) + 1
    return {"titles": len(pos), "top1_hits": int(sum(pos == 1)), "top3_hits": int(sum(pos <= 3)),
            "mrr": float(np.mean(1 / pos))}


def train(base, output, data_path):
    if output.exists():
        raise FileExistsError(f"Choose a new output folder: {output}")
    if digest(base / "onnx/model.onnx") != V4_SHA:
        raise ValueError("Wrong v4 parent ONNX")
    data = json.loads(data_path.read_text(encoding="utf-8"))
    rows, catalog = data["rows"], data["catalog"]
    queries = [r["title"] for r in rows]
    texts = [c["passage"] for c in catalog]
    train_idx = np.array([r["split"] == "train" for r in rows])
    assert set(r["group"] for r in rows if r["split"] == "train").isdisjoint(
        r["group"] for r in rows if r["split"] == "held")
    labels = np.array([[c["name"] in r["labels"] for c in catalog] for r in rows])
    assert labels.any(axis=1).all() and train_idx.any() and (~train_idx).any()
    profile = data.get("profile", "v5-demand")
    print(f"Encoding {len(texts)} catalog passages and {len(queries)} queries for {profile}", flush=True)
    q, p = vectors(base, queries, texts)
    positives = labels[train_idx].astype(np.float32)
    counts = np.array([r["sources"].get("postings", 0) for r in rows])[train_idx]
    targets = positives / positives.sum(axis=1, keepdims=True)
    if profile == "v5-mvp":
        demand = np.array(["lang" not in r for r in rows])[train_idx]
        prior, _ = fit(q[train_idx][demand], p, targets[demand], counts[demand])
        # Reconstruct the original v5 without a second model download. Projection before
        # pooling is linear, so the two learned matrices can be exported as one.
        revised, history = fit(unit(q[train_idx] @ prior), unit(p @ prior), targets, counts)
        matrix = prior @ revised
    else:
        matrix, history = fit(q[train_idx], p, targets, counts)
    export(base, output, matrix)
    # Verify actual serving vectors in both modes, with unequal passage lengths.
    actual_q, actual_p = vectors(output, queries[:5], texts[:5])
    parity = float(min((a * unit(b @ matrix)).sum(axis=1).min()
                       for a, b in [(actual_q, q[:5]), (actual_p, p[:5])]))
    if not np.isfinite(parity) or parity < 0.999:
        raise ValueError(f"Export parity failed: {parity}")
    held = ~train_idx
    report = {"profile": profile, "parent_sha256": V4_SHA, "dataset_sha256": digest(data_path),
              "data": data["audit"], "train_titles": int(train_idx.sum()), "steps": len(history) - 1,
              "train_loss": [history[0], history[-1]], "parity_cosine": parity,
              "held_v4": rank_report(q[held], p, labels[held]),
              "held_v5": rank_report(q[held] @ matrix, p @ matrix, labels[held])}
    if profile == "v5-mvp":
        report["warm_start"] = {"profile": "v5-demand", "steps": 40, "train_titles": int(demand.sum()),
                                "held": rank_report(q[held] @ prior, p @ prior, labels[held])}
    (output / "training.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("base", "output", "data"):
        parser.add_argument("--" + arg, required=True, type=Path)
    args = parser.parse_args()
    train(args.base, args.output, args.data)
