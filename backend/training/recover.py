"""Recover a trainable sentence-transformers folder from a finished model's ONNX export.

Earlier rounds kept only the serving files (onnx/model.onnx, tokenizer, config), not model.safetensors. The ONNX
graph still holds every weight: named initializers keep their PyTorch names, and the unnamed MatMul weights are
found through the bias added right after them. The recovered model must reproduce the ONNX output, or nothing is saved.

Run from backend/ inside .venv-train:
    python -m training.recover --onnx-folder models/tesda-e5-small-v4 --output models/_torch-v4
"""
import argparse
from pathlib import Path

import numpy as np

BASE_MODEL = "intfloat/multilingual-e5-small"
PREFIX = "model."
CHECK_TEXTS = ["query: gusto kong maging welder", "query: cook",
               "passage: Cookery NC II. Prepare appetizers, salads, soups and sauces for hotel and restaurant kitchens.",
               "query: marunong akong mag-ayos ng sirang aircon at ref", "passage: Plumbing NC I"]


def onnx_state_dict(path: Path) -> dict[str, np.ndarray]:
    """PyTorch parameter name -> array, from the initializers of the TorchScript ONNX export."""
    import onnx
    from onnx import numpy_helper

    graph = onnx.load(str(path)).graph
    values = {t.name: numpy_helper.to_array(t) for t in graph.initializer}
    consumers: dict[str, list] = {}
    for node in graph.node:
        for name in node.input:
            consumers.setdefault(name, []).append(node)
    state = {}
    for name, array in values.items():
        if not name.startswith("onnx::"):
            state[name] = array
            continue
        matmuls = [n for n in consumers.get(name, []) if n.op_type == "MatMul"]
        if len(matmuls) != 1:
            raise ValueError(f"{name}: expected one MatMul consumer, found {len(matmuls)}")
        adds = [n for n in consumers.get(matmuls[0].output[0], []) if n.op_type == "Add"]
        biases = [i for n in adds for i in n.input if i.endswith(".bias") and i in values]
        if len(biases) != 1:
            raise ValueError(f"{name}: cannot find the bias that follows its MatMul")
        weight = biases[0][: -len(".bias")] + ".weight"
        if weight in state:
            raise ValueError(f"{weight} recovered twice")
        state[weight] = array.T.copy()  # ONNX MatMul multiplies by W^T
    return {k[len(PREFIX):] if k.startswith(PREFIX) else k: v for k, v in state.items()}


def onnx_outputs(path: Path, tokenizer, texts: list[str]) -> np.ndarray:
    import onnxruntime as ort

    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    batch = tokenizer(texts, padding=True, return_tensors="np")
    feeds = {"input_ids": batch["input_ids"].astype(np.int64),
             "attention_mask": batch["attention_mask"].astype(np.int64),
             "token_type_ids": np.zeros_like(batch["input_ids"], dtype=np.int64)}
    hidden = session.run(None, feeds)[0]
    mask = batch["attention_mask"][..., None].astype(np.float64)
    pooled = (hidden * mask).sum(1) / mask.sum(1)
    return pooled / np.linalg.norm(pooled, axis=1, keepdims=True)


def recover(onnx_folder: Path, output: Path) -> float:
    import torch
    from sentence_transformers import SentenceTransformer

    if output.exists():
        raise SystemExit(f"{output} exists: choose a new folder")
    state = onnx_state_dict(onnx_folder / "onnx" / "model.onnx")
    model = SentenceTransformer(BASE_MODEL, device="cpu")
    bert = model[0].auto_model
    current = bert.state_dict()
    tensors = {k: torch.from_numpy(v) for k, v in state.items() if k in current}
    unknown = sorted(set(state) - set(current))
    missing = sorted(k for k in set(current) - set(tensors) if not k.startswith("pooler."))
    if unknown or missing:
        raise SystemExit(f"Weight names do not line up. unknown={unknown[:5]} missing={missing[:5]}")
    for key, tensor in tensors.items():
        if tuple(tensor.shape) != tuple(current[key].shape):
            raise SystemExit(f"{key}: shape {tuple(tensor.shape)} != {tuple(current[key].shape)}")
    bert.load_state_dict(tensors, strict=False)  # the pooler is not in the export and is never used
    reference = onnx_outputs(onnx_folder / "onnx" / "model.onnx", model.tokenizer, CHECK_TEXTS)
    ours = model.encode(CHECK_TEXTS, normalize_embeddings=True, convert_to_numpy=True).astype(np.float64)
    cosine = float(np.min(np.sum(reference * ours, axis=1)))
    print(f"Recovered {len(tensors)} tensors; lowest cosine against the ONNX export: {cosine:.7f}")
    if not np.isfinite(cosine) or cosine < 0.9999:
        raise SystemExit("Recovered weights do not reproduce the ONNX export; nothing saved")
    model.save_pretrained(str(output))
    (output / "recovered_from.txt").write_text(f"{onnx_folder.resolve()}\nmin_cosine={cosine:.7f}\n", encoding="utf-8")
    return cosine


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--onnx-folder", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    recover(args.onnx_folder, args.output)
