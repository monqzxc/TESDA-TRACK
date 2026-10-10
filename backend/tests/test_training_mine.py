"""Hard-negative mining needs neither torch nor fastembed: a toy embedder stands in for the model."""
import json
import re
import zlib

from training.mine import mine_negatives, write_negatives


class Toy:
    def _v(self, text):
        v = [0.0] * 64
        for w in re.findall(r"[a-z]+", text.lower()):
            v[zlib.crc32(w.encode()) % 64] += 1.0
        n = sum(x * x for x in v) ** 0.5 or 1.0
        return [x / n for x in v]

    def embed_queries(self, texts):
        return [self._v(t) for t in texts]

    def embed_passages(self, texts):
        return [self._v(t) for t in texts]


PASSAGES = {"Cookery NC II": "cook chef kitchen food bread", "Welding NC II": "weld metal arc torch",
            "Baking NC II": "bake bread pastry food", "Driving NC II": "drive truck road vehicle"}


def test_a_negative_is_never_one_of_the_queries_own_qualifications():
    pairs = [("chef", "Cookery NC II"), ("welder metal", "Welding NC II"), ("food", "Cookery NC II"),
             ("food", "Baking NC II"), ("truck", "Driving NC II")]
    rows = mine_negatives(pairs, PASSAGES, Toy(), k=2)
    owners = {}
    for query, name in pairs:
        owners.setdefault(query, set()).add(name)
    assert rows
    for row in rows:
        assert row["negative_name"] not in owners[row["query"]]
        assert row["negative_name"] in PASSAGES
    # a query shared by two qualifications gets negatives for both pairs, from the other two qualifications
    food = [r for r in rows if r["query"] == "food"]
    assert {r["positive_name"] for r in food} == {"Cookery NC II", "Baking NC II"}
    assert {r["negative_name"] for r in food} <= {"Welding NC II", "Driving NC II"}


def test_k_negatives_per_pair_in_similarity_order():
    rows = mine_negatives([("bake bread", "Baking NC II")], PASSAGES, Toy(), k=2)
    assert [r["negative_name"] for r in rows][0] == "Cookery NC II"  # shares "bread"
    assert len(rows) == 2


def test_write_negatives_is_lf_json(tmp_path):
    path = tmp_path / "runs" / "hn.json"
    write_negatives([{"query": "a", "positive_name": "b", "negative_name": "c"}], path)
    assert json.loads(path.read_text(encoding="utf-8"))[0]["negative_name"] == "c"
    assert b"\r" not in path.read_bytes()
