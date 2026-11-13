"""The outlook's analysis as one short paragraph written by Claude, for deployments that turn it on.

Off by default (OUTLOOK_AI_SUMMARY_ENABLED). Only public aggregates leave the server: the qualification's name, region
names, the counts and the rules' own analysis of them. Never a learner's words, account or coordinates. The paragraph
is checked against the counts before it is shown, kept in the cache so each selection is written once, and replaced
by the rules' own words whenever Claude can't be reached, declines, or says a number the counts don't hold.
"""
import hashlib
import json
import logging
import re
from typing import Any, Protocol

import anthropic
from sqlmodel import Session

from tesda_track.schemas.outlook import OutlookSummary, QualificationOutlook
from tesda_track.services import cache

logger = logging.getLogger("tesda_track")

# Bumped when the instructions or the facts' shape change, so earlier paragraphs aren't served for the new ones.
PROMPT_VERSION = "1"
MAX_CHARACTERS = 900
# Models that take the server-side refusal fallback; others are asked without it.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
FALLBACK_MODELS = ("claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5")

SYSTEM = """\
You write the short note shown under a map in TESDA-TRACK, an app that helps learners in the Philippines choose a \
TESDA qualification and a training or assessment center. The learner has picked a qualification and, usually, a \
region. The JSON you receive holds everything known about it: counts of dated job-posting records linked to the \
qualification (demand), counts of recorded training and assessment centers that list it (supply), how the selected \
region's share of each compares (balance), and the same analysis already written out by fixed rules.

Write one paragraph of three or four plain sentences, under 90 words, speaking to the learner as "you". Say where \
they are and whether they are willing to relocate, what the demand for the qualification is in their area, how much \
training supply there is, and whether the area looks saturated, balanced or short of centers. If they are open to \
relocating, name the regions where demand is strongest against supply; if they are not, keep the note about their \
own area.

The note sits beside the same numbers on screen, so use only figures that appear in the JSON and do not work out new \
ones. The counts are dated posting records and recorded centers: they are not live vacancies, worker headcounts or \
forecasts, so do not call them job openings and do not promise work. When limited_evidence is true, say the counts \
are small. Write in everyday English a senior high school graduate reads easily, with region and qualification names \
exactly as given. Plain text only: no headings, lists, markdown or preamble."""


class SummaryWriter(Protocol):
    model: str

    def write(self, facts: dict[str, Any]) -> str | None:
        """The paragraph, or None when it couldn't be written."""


class ClaudeWriter:
    def __init__(self, api_key: str, model: str, timeout_seconds: float):
        self.model = model
        self._client = anthropic.Anthropic(api_key=api_key, timeout=timeout_seconds, max_retries=1)

    def write(self, facts: dict[str, Any]) -> str | None:
        request: dict[str, Any] = dict(
            model=self.model, max_tokens=16000, system=SYSTEM,
            # A short rewrite of counts already analysed: thinking stays on, at its lightest.
            output_config={"effort": "low"},
            messages=[{"role": "user", "content": json.dumps(facts, ensure_ascii=False, indent=1)}])
        try:
            if self.model.startswith(FALLBACK_MODELS):
                # A safety decline is answered by the fallback model inside the same call.
                response = self._client.beta.messages.create(**request, betas=[FALLBACK_BETA], fallbacks="default")
            else:
                response = self._client.messages.create(**request)
        except anthropic.RateLimitError:
            logger.warning("Outlook summary: Claude's rate limit was reached; using the rules' own words")
            return None
        except anthropic.APIStatusError as error:
            logger.warning("Outlook summary: Claude answered %s; using the rules' own words", error.status_code)
            return None
        except anthropic.APIConnectionError:
            logger.warning("Outlook summary: Claude couldn't be reached; using the rules' own words")
            return None
        if response.stop_reason in ("refusal", "max_tokens"):
            logger.warning("Outlook summary: Claude stopped with %s; using the rules' own words", response.stop_reason)
            return None
        return " ".join(block.text.strip() for block in response.content if block.type == "text").strip() or None


def facts_for(outlook: QualificationOutlook) -> dict[str, Any]:
    """What Claude is told: names, counts and the rules' analysis. Shares are whole percents, as the screen shows."""
    areas = {area.region_code: area for area in outlook.areas}
    area, home = areas.get(outlook.region_code), areas.get(outlook.home_region_code)

    def percent(share: float | None) -> int | None:
        return None if share is None else round(share * 100)

    def counts(item) -> dict[str, Any]:
        return {
            "region": item.name, "posting_records": item.posting_count,
            "percent_of_national_posting_records": percent(item.demand_share),
            "training_centers": item.training_sites, "assessment_centers": item.assessment_sites,
            "percent_of_national_centers": percent(item.supply_share), "balance": item.balance,
            "limited_evidence": item.limited, "most_posted_titles": item.titles,
            "example_sites_not_counted": item.example_sites,
        }

    return {
        "qualification": outlook.qualification.name,
        "selected_region": counts(area) if area else None,
        "learner_home_region": home.name if home else None,
        "selected_region_is_home": bool(area and home and area.region_code == home.region_code),
        "open_to_relocating": outlook.relocate,
        "national": {
            "posting_records": outlook.totals.posting_count, "training_centers": outlook.totals.training_sites,
            "assessment_centers": outlook.totals.assessment_sites,
            "regions_with_posting_records": outlook.totals.regions_with_postings,
            "regions_with_centers": outlook.totals.regions_with_sites,
        },
        "regions_with_stronger_demand_against_supply": [counts(areas[code]) for code in outlook.alternatives],
        "posting_snapshot_dates": [day.isoformat() for day in outlook.snapshot_dates],
        "center_counts_include_example_sites": outlook.includes_example_sites,
        "analysis_by_rules": {"headline": outlook.insight.headline, "summary": outlook.insight.summary,
                              "points": [point.text for point in outlook.insight.points]},
        "limitations": outlook.limitations,
    }


def _numbers(text: str) -> set[str]:
    return {run.replace(",", "").lstrip("0") or "0" for run in re.findall(r"\d[\d,]*", text)}


def grounded(text: str, facts: dict[str, Any]) -> bool:
    """Whether every figure in the paragraph is one the facts hold. A figure Claude worked out or misread fails."""
    return _numbers(text) <= _numbers(json.dumps(facts, ensure_ascii=False))


def rules_summary(outlook: QualificationOutlook) -> OutlookSummary:
    return OutlookSummary(source="rules", text=outlook.insight.summary)


def summarize(session: Session, outlook: QualificationOutlook, writer: SummaryWriter | None, *, ttl_seconds: int,
              allow_request=lambda: True) -> OutlookSummary:
    """The AI-written paragraph for this outlook, from the cache when it has been written before. `allow_request`
    says whether a new one may be asked for now (the request limits); when it may not, the rules speak."""
    if writer is None:
        return rules_summary(outlook)
    facts = facts_for(outlook)
    fingerprint = json.dumps([PROMPT_VERSION, writer.model, facts], sort_keys=True, ensure_ascii=False)
    key = "outlook-summary:" + hashlib.sha256(fingerprint.encode()).hexdigest()
    text = cache.get(session, key) if ttl_seconds else None
    if text is None:
        if not allow_request():
            return rules_summary(outlook)
        text = writer.write(facts)
        if text and (len(text) > MAX_CHARACTERS or not grounded(text, facts)):
            logger.warning("Outlook summary: Claude's paragraph was too long or held a figure the counts don't; "
                           "using the rules' own words")
            text = None
        if text is None:
            return rules_summary(outlook)
        if ttl_seconds:
            cache.put(session, key, text, ttl_seconds)
            session.commit()
    return OutlookSummary(source="ai", model=writer.model, text=text)
