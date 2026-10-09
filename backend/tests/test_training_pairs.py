from tesda_track.utils.helpers import normalize
from training.catalog import load_catalog
from training.pairs import eval_exclusions, training_pairs


def test_pairs_cover_jobs_keywords_and_templates_for_every_qualification():
    qualifications, _ = load_catalog()
    pairs = training_pairs(qualifications, exclude=set())
    passages = {passage for _, passage in pairs}
    assert len(passages) == len(qualifications)
    queries = {query for query, passage in pairs if passage.startswith("Cookery NC II.")}
    assert {"karinderya", "cook", "gusto kong maging cook", "i want to work as a chef"} <= queries


def test_evaluation_goals_never_become_training_queries():
    qualifications, _ = load_catalog()
    exclude = eval_exclusions()
    assert exclude, "the evaluation set is loaded"
    assert not {normalize(query) for query, _ in training_pairs(qualifications, exclude)} & exclude


def test_only_core_competencies_become_queries():
    qualifications, _ = load_catalog()
    queries = {query for query, _ in training_pairs(qualifications, exclude=set())}
    cookery = {query for query, passage in training_pairs(qualifications, exclude=set())
               if passage.startswith("Cookery NC II.")}
    assert "participate in workplace communication" not in queries  # a Basic unit of 178 qualifications
    assert "prepare stocks, sauces and soups" in cookery  # a Core unit of Cookery NC II
