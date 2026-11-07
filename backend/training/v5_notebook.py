"""Build a self-contained Colab notebook from public catalog passages and filtered demand titles."""
import argparse
import base64
import gzip
import json
from collections import Counter
from pathlib import Path

from tesda_track.services.embeddings import qualification_text
from training.catalog import load_catalog
from training.demand import build
from training.pairs import eval_exclusions
from tesda_track.utils.helpers import normalize

HERE = Path(__file__).resolve().parent


def write_notebook(notebook, data_path, *, mvp=False):
    qs, _ = load_catalog()
    exclusions = eval_exclusions()
    rows, audit = build(qs, exclusions)
    profile = "v5-mvp" if mvp else "v5-demand"
    if mvp:
        from training.v5_examples import learner_rows

        probes = json.loads((HERE / "data/v5_eval/mvp_probes.json").read_text(encoding="utf-8"))
        probe_keys = {normalize(row["goal"]) for row in probes}
        if any(normalize(row["title"]) in probe_keys for row in rows):
            raise ValueError("A demand title overlaps the independent MVP probes")
        held = [row for row in rows if row["split"] == "held"]
        held_labels = {name for row in held for name in row["labels"]}
        reserved = exclusions | probe_keys | {normalize(row["title"]) for row in rows}
        learner = learner_rows(qs, reserved, held_jobs={row["group"] for row in held})
        learner = [row for row in learner if held_labels.isdisjoint(row["labels"])]
        if any(normalize(row["title"]) in reserved for row in learner):
            raise ValueError("A learner example overlaps a reserved query")
        audit["learner_by_language"] = dict(sorted(Counter(r["lang"] for r in learner).items()))
        audit["learner_by_kind"] = dict(sorted(Counter(r["kind"] for r in learner).items()))
        rows.extend(learner)
    data = json.dumps({"rows": rows, "audit": audit, "profile": profile,
                       "catalog": [{"name": q.name, "passage": qualification_text(q)} for q in qs]},
                      ensure_ascii=False, separators=(",", ":")).encode()
    data_path.parent.mkdir(parents=True, exist_ok=True)
    data_path.write_bytes(data)
    encoded = base64.b64encode(gzip.compress(data, mtime=0)).decode()

    def code(source, title):
        return {"cell_type": "code", "metadata": {"cellView": "form"}, "execution_count": None, "outputs": [],
                "source": ("#@title " + title + "\n" + source).splitlines(True)}

    cells = [{"cell_type": "markdown", "metadata": {}, "source": [
        ("# TESDA multilingual learner matcher · v5 MVP\n" if mvp else "# TESDA demand-job matcher · v5\n"),
        "Run all cells on a standard **CPU** runtime. This small continuation learns a projection on the frozen "
        "v4 encoder. Public job-title labels and catalog passages are embedded in this notebook. "
        "The run compares v4 and v5 on held-out title groups and exports the candidate. " +
        ("The MVP first reconstructs the demand-trained v5, then continues on catalog-labeled learner goals, "
         "qualifications, jobs and skills. Regional examples include synthetic drafts. " if mvp else "") +
        "Download the archive before disconnecting. No Drive mount or API key is needed."]},
        code("import subprocess, sys\nsubprocess.run([sys.executable, '-m', 'pip', 'install', '-q', "
             "'fastembed==0.8.1', 'onnxruntime==1.31.0', 'onnx==1.23.2'], check=True)",
             "Install the encoder and exporter (use Colab's installed PyTorch)"),
        code("from pathlib import Path\nimport base64, gzip\n"
             "ROOT = Path('/content/tesda-v5'); ROOT.mkdir(exist_ok=True)\n"
             f"(ROOT/'demand.json').write_bytes(gzip.decompress(base64.b64decode('{encoded}')))\n"
             f"(ROOT/'v5.py').write_text({(HERE/'v5.py').read_text(encoding='utf-8')!r})\n"
             "from huggingface_hub import snapshot_download\n"
             "base = ROOT/'tesda-e5-small-v4'\n"
             "snapshot_download('Nyanta19/tesda-e5-small-v4', local_dir=base, "
             "allow_patterns=['config.json','tokenizer.json','tokenizer_config.json','calibration.json','onnx/model.onnx'])",
             "Prepare public demand data and fetch the verified v4 parent"),
        code("from datetime import datetime, timezone\n"
             f"out = ROOT/datetime.now(timezone.utc).strftime('run-%Y%m%d-%H%M%S')/'tesda-e5-small-{'v5-mvp' if mvp else 'v5'}'\n"
             "run = subprocess.run([sys.executable, '-u', str(ROOT/'v5.py'), '--base', str(base), '--output', str(out), "
             "'--data', str(ROOT/'demand.json')], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)\n"
             "print(run.stdout)\nrun.check_returncode()",
             "Train v5, score held-out demand titles, and verify the serving export"),
        code("import shutil\nfrom google.colab import files\n"
             "archive = shutil.make_archive(str(out), 'zip', root_dir=out.parent, base_dir=out.name)\n"
             "print('Download the candidate and training.json:', archive)\nfiles.download(archive)",
             "Download the trained v5 candidate")]
    notebook.write_text(json.dumps({"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3",
                            "language": "python", "name": "python3"}}, "nbformat": 4, "nbformat_minor": 0},
                        ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mvp", action="store_true")
    parser.add_argument("--notebook", type=Path)
    parser.add_argument("--data", type=Path)
    args = parser.parse_args()
    suffix = "_mvp" if args.mvp else ""
    write_notebook(args.notebook or HERE/"colab"/f"train_colab_v5{suffix}.ipynb",
                   args.data or HERE/"runs"/("v5-mvp.json" if args.mvp else "v5-demand.json"), mvp=args.mvp)
