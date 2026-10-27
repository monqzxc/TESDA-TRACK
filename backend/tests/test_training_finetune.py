"""The fine-tune output-folder guard needs neither torch nor the database."""
import pytest

from training.finetune import check_output_folder


def test_a_new_or_empty_folder_is_accepted(tmp_path):
    check_output_folder(tmp_path / "tesda-e5-small-v2", resume=False, checkpoint=None)
    tmp_path.joinpath("empty").mkdir()
    check_output_folder(tmp_path / "empty", resume=False, checkpoint=None)


@pytest.mark.parametrize("marker", ["onnx/model.onnx", "training.json"])
def test_a_finished_folder_is_refused_with_advice(tmp_path, marker):
    path = tmp_path / marker
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("x")
    with pytest.raises(SystemExit, match="new folder and give the model a new name"):
        check_output_folder(tmp_path, resume=False, checkpoint=None)


def test_an_unfinished_run_resumes_only_with_the_flag(tmp_path):
    checkpoint = str(tmp_path / "checkpoints" / "checkpoint-10")
    check_output_folder(tmp_path, resume=True, checkpoint=checkpoint)
    with pytest.raises(SystemExit, match="--resume"):
        check_output_folder(tmp_path, resume=False, checkpoint=checkpoint)
    with pytest.raises(SystemExit, match="no checkpoint"):
        check_output_folder(tmp_path, resume=True, checkpoint=None)


def test_every_pair_gets_one_negative_that_is_not_its_own_passage():
    from tesda_track.services.embeddings import qualification_text
    from training.catalog import load_catalog
    from training.finetune import attach_negatives

    qualifications, _ = load_catalog()
    cookery, welding, baking = (next(q for q in qualifications if q.name == n)
                                for n in ("Cookery NC II", "Manual Metal Arc Welding (MMAW) NC II", "Food Production (Bread and Patisserie) NC II"))
    pairs = [("chef", qualification_text(cookery)), ("no mined negative", qualification_text(cookery))]
    rows = [{"query": "chef", "positive_name": cookery.name, "negative_name": welding.name},
            {"query": "chef", "positive_name": cookery.name, "negative_name": baking.name}]
    triplets, missing = attach_negatives(pairs, rows, qualifications, seed=1)
    assert missing == 1 and len(triplets) == 2
    assert triplets[0][2] in {qualification_text(welding), qualification_text(baking)}
    assert all(t[2] != t[1] for t in triplets)


def test_sibling_levels_are_dropped_as_negatives_unless_the_query_names_a_level_or_allowed():
    from tesda_track.services.embeddings import qualification_text
    from training.catalog import load_catalog
    from training.finetune import attach_negatives

    qualifications, _ = load_catalog()
    by_name = {q.name: q for q in qualifications}
    cook2, cook3 = by_name["Flux-Cored Arc Welding (FCAW) NC II"], by_name["Flux-Cored Arc Welding (FCAW) NC III"]
    other = by_name["Cookery NC II"]
    pairs = [("welder", qualification_text(cook2)), ("welder nc ii", qualification_text(cook2))]
    rows = [{"query": q, "positive_name": cook2.name, "negative_name": n}
            for q in ("welder", "welder nc ii") for n in (cook3.name, other.name)]
    sibling = qualification_text(cook3)
    for seed in range(10):
        triplets, missing = attach_negatives(pairs, rows, qualifications, seed)
        assert missing == 0 and triplets[0][2] == qualification_text(other)  # no level cue: sibling dropped
        assert triplets[1][2] in {sibling, qualification_text(other)}  # level named: sibling allowed
    only_sibling = [{"query": "welder", "positive_name": cook2.name, "negative_name": cook3.name}]
    triplets, missing = attach_negatives(pairs[:1], only_sibling, qualifications, 1)
    assert missing == 1 and triplets[0][2] not in {sibling, qualification_text(cook2)}
    triplets, missing = attach_negatives(pairs[:1], only_sibling, qualifications, 1, allow_sibling=True)
    assert missing == 0 and triplets[0][2] == sibling


def test_random_fallback_never_picks_an_owner_of_the_query_or_a_sibling():
    from tesda_track.services.embeddings import qualification_text
    from training.catalog import load_catalog
    from training.finetune import attach_negatives
    from training.pairs import family

    qualifications, _ = load_catalog()
    by_name = {q.name: q for q in qualifications}
    a, b = by_name["Cookery NC II"], by_name["Flux-Cored Arc Welding (FCAW) NC II"]
    sibling = by_name["Flux-Cored Arc Welding (FCAW) NC III"]
    pairs = [("Shared Goal", qualification_text(a)), ("shared goal", qualification_text(b))]
    forbidden = {qualification_text(a), qualification_text(b), qualification_text(sibling)}
    for seed in range(200):
        triplets, missing = attach_negatives(pairs, [], qualifications, seed)
        assert missing == 2
        assert all(t[2] not in forbidden for t in triplets)
        again, _ = attach_negatives(pairs, [], qualifications, seed)
        assert again == triplets
