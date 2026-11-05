"""Database-free checks that the TSP embed contract's schemas, examples and document agree. Run with
--confcutdir=backend/tests/unit."""
import json
import re
from functools import cache
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

CONTRACT_DIR = Path(__file__).resolve().parents[3] / "docs" / "contracts" / "tsp-tracker-embed"
MESSAGE_TYPES = ("tsp.tracker.ready", "tsp.tracker.signed_in", "tsp.tracker.error", "tsp.tracker.handoff",
                 "tsp.tracker.handoff_failed", "tsp.tracker.logout")
# Each invalid example and the check it must fail: (JSON Schema keyword, field). Pinning the reason stops an
# example from passing as "invalid" because of some other mistake in it.
INVALID_BECAUSE = {
    "tsp.tracker.handoff--missing-state": ("required", ()),
    "tsp.tracker.ready--version-2": ("const", ("version",)),
    "tsp.tracker.ready--short-nonce": ("pattern", ("nonce",)),
    "tsp.tracker.ready--standard-base64-nonce": ("pattern", ("nonce",)),
    # 43 characters, so only the alphabet (+ and /) is wrong: what a host using the wrong encoder sends.
    "tsp.tracker.ready--standard-base64-unpadded-nonce": ("pattern", ("nonce",)),
    "tsp.tracker.ready--string-version": ("type", ("version",)),
    "tsp.tracker.error--unknown-code": ("enum", ("code",)),
    "tsp.tracker.handoff--empty-code": ("minLength", ("code",)),
}
REQUIRED_INVALID = set(INVALID_BECAUSE)


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


@cache
def validator(message_type: str) -> Draft202012Validator:
    return Draft202012Validator(load(CONTRACT_DIR / "schemas" / f"{message_type}.schema.json"))


def examples(kind: str) -> list[Path]:
    return sorted((CONTRACT_DIR / "examples" / kind).glob("*.json"))


def schema_of(path: Path) -> str:
    """The message type an example is checked against: its file name before any "--"."""
    return path.stem.split("--")[0]


def test_every_message_type_has_a_schema_and_a_valid_example():
    for message_type in MESSAGE_TYPES:
        assert (CONTRACT_DIR / "schemas" / f"{message_type}.schema.json").is_file()
        assert (CONTRACT_DIR / "examples" / "valid" / f"{message_type}.json").is_file()


def test_no_schema_for_an_unknown_type():
    assert {path.name.removesuffix(".schema.json") for path in (CONTRACT_DIR / "schemas").glob("*.json")} \
        == set(MESSAGE_TYPES)


@pytest.mark.parametrize("message_type", MESSAGE_TYPES)
def test_schema_is_valid_draft_2020_12_and_names_its_type(message_type):
    schema = load(CONTRACT_DIR / "schemas" / f"{message_type}.schema.json")
    Draft202012Validator.check_schema(schema)
    assert schema["properties"]["type"]["const"] == message_type
    assert (schema["properties"]["version"]["const"], schema["properties"]["version"]["type"]) == (1, "integer")
    assert {"type", "version"} <= set(schema["required"]) and schema["additionalProperties"] is True


@pytest.mark.parametrize("path", examples("valid"), ids=lambda path: path.stem)
def test_valid_examples_pass(path):
    validator(schema_of(path)).validate(load(path))


@pytest.mark.parametrize("path", examples("invalid"), ids=lambda path: path.stem)
def test_invalid_examples_fail_for_their_reason(path):
    errors = {(error.validator, tuple(error.absolute_path)) for error in validator(schema_of(path)).iter_errors(load(path))}
    assert INVALID_BECAUSE[path.stem] in errors


def test_the_required_invalid_cases_exist():
    assert REQUIRED_INVALID <= {path.stem for path in examples("invalid")}


def contract_json_blocks() -> list[dict]:
    """Every ```json block in CONTRACT.md that is a message (its "type" starts "tsp.tracker."). A block that isn't
    valid JSON fails here, so the document can't show TSP broken JSON."""
    text = (CONTRACT_DIR / "CONTRACT.md").read_text(encoding="utf-8")
    blocks = [json.loads(block) for block in re.findall(r"```json\r?\n(.*?)\r?\n```", text, re.DOTALL)]
    return [block for block in blocks
            if isinstance(block, dict) and str(block.get("type", "")).startswith("tsp.tracker.")]


def test_contract_json_blocks_match_their_schemas():
    blocks = contract_json_blocks()
    assert {block["type"] for block in blocks} == set(MESSAGE_TYPES)
    for block in blocks:
        validator(block["type"]).validate(block)


def test_contract_links_every_schema():
    text = (CONTRACT_DIR / "CONTRACT.md").read_text(encoding="utf-8")
    assert all(f"schemas/{message_type}.schema.json" in text for message_type in MESSAGE_TYPES)
