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
