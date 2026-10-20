"""Metrics use independent graded judgments; omitted judgments remain explicitly unjudged."""
import math
import statistics


def relevance(shown: list[str], judgments: dict[str, int], k: int = 3) -> dict:
    if k < 1:
        raise ValueError("k must be positive")
    if len(shown) != len(set(shown)):
        raise ValueError("Duplicate recommendations invalidate rank metrics")
    if any(not isinstance(g, int) or isinstance(g, bool) or not 0 <= g <= 3 for g in judgments.values()):
        raise ValueError("Relevance grades must be integers from 0 to 3")
    top = shown[:k]
    positives = {key for key, grade in judgments.items() if grade > 0}
    hits = sum(key in positives for key in top)
    dcg = sum((2 ** judgments.get(key, 0) - 1) / math.log2(index + 2) for index, key in enumerate(top))
    ideal = sorted(judgments.values(), reverse=True)[:k]
    idcg = sum((2 ** grade - 1) / math.log2(index + 2) for index, grade in enumerate(ideal))
    return {"precision_at_k": hits / k, "recall_at_k": hits / len(positives) if positives else None,
            "ndcg_at_k": dcg / idcg if idcg else None,
            "mrr_at_k": next((1 / rank for rank, key in enumerate(top, 1) if key in positives), 0.0) if positives else None,
            "top1_relevant": bool(top and top[0] in positives) if positives else None,
            "unjudged_at_k": sum(key not in judgments for key in top),
            "abstained": not shown}


def percentile(values: list[float], percent: float) -> float | None:
    if not values:
        return None
    if not 0 <= percent <= 100:
        raise ValueError("Invalid percentile")
    ordered = sorted(values)
    position = (len(ordered) - 1) * percent / 100
    low = math.floor(position)
    high = math.ceil(position)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def summarize(rows: list[dict], k: int = 3) -> dict:
    relevant = [r for r in rows if any(g > 0 for g in r["judgments"].values())]
    negatives = [r for r in rows if r.get("expect_empty")]
    measured = [relevance(r["shown"], r["judgments"], k) for r in relevant]
    durations = [v for row in rows for v in row.get("warm_latency_ms", [])]
    mean = lambda key: statistics.mean(m[key] for m in measured) if measured else None
    return {"cases": len(rows), "positive_cases": len(relevant), "negative_cases": len(negatives), "k": k,
            "precision_at_k": mean("precision_at_k"), "recall_at_k": mean("recall_at_k"),
            "ndcg_at_k": mean("ndcg_at_k"), "mrr_at_k": mean("mrr_at_k"), "top1_relevance": mean("top1_relevant"),
            "negative_abstention_rate": sum(not r["shown"] for r in negatives) / len(negatives) if negatives else None,
            "unjudged_at_k": sum(m["unjudged_at_k"] for m in measured),
            "constraint_violations": sum(len(r.get("violations", [])) for r in rows),
            "unstable_cases": sum(not r.get("stable", True) for r in rows),
            "warm_latency_samples": len(durations), "warm_p50_ms": percentile(durations, 50),
            "warm_p95_ms": percentile(durations, 95), "warm_max_ms": max(durations) if durations else None}
