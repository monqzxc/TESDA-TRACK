"""Recommendation tools: matching a goal, the route and readiness for a qualification, and ranked training programs
and assessment schedules. What a partner sends about a person is used to answer the call and never stored."""
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from typing import Annotated, Literal

from fastapi import FastAPI
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field, ValidationError
from sqlmodel import Session

from tesda_track.errors import DomainError
from tesda_track.mcp import deps
from tesda_track.mcp.deps import embedder, open_session, principal
from tesda_track.mcp.schemas import AssessmentRankingOutput, MatchOutput, RouteOutput, TrainingRankingOutput
from tesda_track.mcp.tools_catalog import READ_ONLY, UNKNOWN_CODE, _unknown_region, resolve_item
from tesda_track.models import Region
from tesda_track.schemas.analysis import GoalRequest, Profile, ReadinessResult
from tesda_track.schemas.assessment_ranking import AssessmentRankingRequest
from tesda_track.schemas.delivery import Money, PreferredDeliveryMode
from tesda_track.schemas.learner_assessments import AssessmentAnswers
from tesda_track.schemas.ranking import TrainingRankingRequest
from tesda_track.services import analysis, assessment_ranking, catalog, learner_assessments, ranking, sites

NO_MATCH = "No qualification matched. Name a trade, job or skill, such as welder or magluto sa hotel."
LOCATION_DECIMALS = 1  # about 11 km: nothing finer is used, returned or stored

Goal = Annotated[str | None, Field(
    min_length=1, max_length=1000,
    description="The learner's goal in their own words, English or Filipino, 1 to 1000 characters.")]
Answers = Annotated[AssessmentAnswers | None, Field(
    description="The learner's questionnaire answers. Every field is optional; send what is known.")]
Lat = Annotated[float | None, Field(
    ge=-90, le=90, description="The learner's latitude; used rounded to 0.1 degree. Give it with near_lon.")]
Lon = Annotated[float | None, Field(
    ge=-180, le=180, description="The learner's longitude; used rounded to 0.1 degree. Give it with near_lat.")]
QualificationCode = Annotated[str, Field(description="The qualification's code, e.g. SMAW-NC-II, or TESDA's official code.")]
Experience = Annotated[float | None, Field(ge=0, le=80, description="Years of experience in the trade.")]
HasCertification = Annotated[bool | None, Field(description="Whether the learner already holds a TESDA certificate.")]
RegionCode = Annotated[str | None, Field(
    description="A region code such as NCR or VII. Stands in for near_lat and near_lon when they are left out.")]


@contextmanager
def _request_errors() -> Iterator[None]:
    """A request the services refuse becomes a tool error. Pydantic's messages name the rule that failed, never the
    value, and the services' own messages are fixed text."""
    try:
        yield
    except ValidationError as error:
        raise ToolError("; ".join(item["msg"].removeprefix("Value error, ") for item in error.errors())) from None
    except DomainError as error:
        raise ToolError(error.detail) from None


def _require_qualification(session: Session, code: str):
    """The active qualification, else a message without the code the caller typed."""
    return resolve_item(session, code, catalog.snapshot(session).items, UNKNOWN_CODE)


def _rounded(latitude: float | None, longitude: float | None) -> tuple[float | None, float | None]:
    if latitude is None or longitude is None:
        return latitude, longitude
    return round(latitude, LOCATION_DECIMALS), round(longitude, LOCATION_DECIMALS)


def _region_centre(session: Session, region_code: str) -> tuple[float | None, float | None]:
    region = _region(session, region_code)
    return _rounded(region.latitude, region.longitude)


def _region(session: Session, region_code: str) -> Region:
    region = session.get(Region, region_code)
    if region is None:
        raise _unknown_region([row.code for row in sites.regions(session)])
    return region


def register(server: MCPServer, app: FastAPI) -> None:
    @server.tool(annotations=READ_ONLY)
    def match_qualifications(
        goal: Goal = None,
        experience_years: Experience = None,
        has_certification: HasCertification = None,
        answers: Answers = None,
        limit: Annotated[int, Field(ge=1, le=10, description="Most matches to return.")] = 3,
    ) -> MatchOutput:
        """The TESDA qualifications that best fit a learner's goal, strongest first, each with a 0-100 score and the
        reason. Give a goal, answers or both. A goal that names no trade, job or skill is an error."""
        if goal is None and answers is None:
            raise ToolError("Give a goal or answers.")
        with _request_errors():
            text = GoalRequest(query=goal).query if goal is not None else ""
            profile = Profile(experience_years=experience_years, has_certification=has_certification)
            with open_session(app) as session:
                checked = learner_assessments.validate(session, answers) if answers is not None else None
                interpreted, matches = analysis.match(session, text, profile, embedder(app), checked, limit)
        if not matches:
            raise ToolError(NO_MATCH)
        return MatchOutput(interpreted=interpreted, matches=matches)

    @server.tool(annotations=READ_ONLY)
    def recommend_route(
        qualification_code: QualificationCode,
        experience_years: Experience = None,
        has_certification: HasCertification = None,
    ) -> RouteOutput:
        """The next step for a learner toward one qualification: training, assessment, a readiness check or more
        questions, with the reason and, where one is defined, the curated steps."""
        with _request_errors():
            profile = Profile(experience_years=experience_years, has_certification=has_certification)
            with open_session(app) as session:
                qualification_code = _require_qualification(session, qualification_code).code
                result = analysis.pathway(session, profile, qualification_code)
        return RouteOutput(route=result.recommendation, reason=result.reason, next_step=result.next_step,
                           pathway=result.pathway)

    @server.tool(annotations=READ_ONLY)
    def check_readiness(
        qualification_code: QualificationCode,
        answers: Annotated[dict[int, Literal["confident", "some_experience", "not_familiar"]], Field(
            max_length=100,
            description="How familiar the learner is with each competency of the qualification: its competency id "
                        "(from get_qualification) mapped to confident, some_experience or not_familiar. "
                        "Every competency needs an answer.")],
    ) -> ReadinessResult:
        """A learner's readiness for the assessment of one qualification, from 0 to 100, with their strengths, their
        skill gaps and what to do next."""
        with _request_errors():
            with open_session(app) as session:
                item = _require_qualification(session, qualification_code)
                qualification_code = item.code
                expected = {competency.id for competency in item.public.competencies}
                missing, unknown = sorted(expected - answers.keys()), sorted(answers.keys() - expected)
                problems = []
                if missing:
                    problems.append(f"Answer every competency. Missing competency ids: {', '.join(map(str, missing))}.")
                if unknown:
                    problems.append("Unknown competency ids for this qualification: "
                                    f"{', '.join(map(str, unknown))}.")
                if problems:
                    raise ToolError(" ".join(problems))
                return analysis.readiness(session, qualification_code, answers)

    @server.tool(annotations=READ_ONLY)
    def rank_training_programs(
        qualification_code: QualificationCode,
        goal: Goal = None,
        near_lat: Lat = None,
        near_lon: Lon = None,
        region_code: RegionCode = None,
        preferred_delivery_mode: Annotated[PreferredDeliveryMode | None, Field(
            description="Prefer programs delivered this way.")] = None,
        needs_scholarship: Annotated[bool, Field(description="Prefer programs that offer a scholarship.")] = False,
        require_confirmed_availability: Annotated[bool, Field(
            description="Hold back programs whose current intake is not confirmed.")] = False,
        answers: Answers = None,
        limit: Annotated[int, Field(ge=1, le=50, description="Most programs to return.")] = 10,
    ) -> TrainingRankingOutput:
        """Active training programs for a qualification, ranked 0-100 for one learner by meaning, distance, nearby
        assessment, start date and stated preferences, each score with its components and explanation. Programs
        whose provider is not yet verified come separately in requires_verification."""
        client = principal().client_id
        with _request_errors():
            near_lat, near_lon = _rounded(near_lat, near_lon)
            with open_session(app) as session:
                qualification_code = _require_qualification(session, qualification_code).code
                if region_code and near_lat is None and near_lon is None:
                    near_lat, near_lon = _region_centre(session, region_code)
                request = TrainingRankingRequest(
                    qualification_code=qualification_code, goal=goal, near_lat=near_lat, near_lon=near_lon,
                    preferred_delivery_mode=preferred_delivery_mode, needs_scholarship=needs_scholarship,
                    require_confirmed_availability=require_confirmed_availability, assessment=answers, limit=limit)
                result = ranking.rank_programs(session, request, embedder(app), None, api_client_id=client)
                session.commit()
                deps.note_ranking_audit(result.audit_id)
        return TrainingRankingOutput.model_validate(result, from_attributes=True)

    @server.tool(annotations=READ_ONLY)
    def rank_assessment_schedules(
        qualification_code: QualificationCode,
        goal: Goal = None,
        near_lat: Lat = None,
        near_lon: Lon = None,
        region_code: RegionCode = None,
        maximum_distance_km: Annotated[float | None, Field(
            gt=0, le=2000, description="Leave out centers farther than this; needs a location.")] = None,
        maximum_fee: Annotated[Money | None, Field(description="The most the learner can pay, in pesos.")] = None,
        fee_is_mandatory: Annotated[bool, Field(
            description="Leave out schedules above maximum_fee, rather than only scoring them lower.")] = False,
        scheduled_after: Annotated[date | None, Field(description="Earliest date the learner can attend.")] = None,
        scheduled_before: Annotated[date | None, Field(description="Latest date the learner can attend.")] = None,
        schedule_is_mandatory: Annotated[bool, Field(
            description="Leave out schedules outside the date window, rather than only scoring them lower.")] = False,
        answers: Answers = None,
        limit: Annotated[int, Field(ge=1, le=50, description="Schedules per page.")] = 10,
        offset: Annotated[int, Field(ge=0, le=10000, description="Schedules to skip.")] = 0,
    ) -> AssessmentRankingOutput:
        """Upcoming assessment schedules with seats left for a qualification, ranked 0-100 for one learner by
        distance, fee, date and fit, each score with its explanation. Schedules at centers not yet verified come
        separately in requires_verification."""
        client = principal().client_id
        with _request_errors():
            near_lat, near_lon = _rounded(near_lat, near_lon)
            with open_session(app) as session:
                qualification_code = _require_qualification(session, qualification_code).code
                if region_code:
                    _region(session, region_code)
                request = AssessmentRankingRequest(
                    qualification_code=qualification_code, goal=goal, near_lat=near_lat, near_lon=near_lon,
                    region_code=region_code, maximum_distance_km=maximum_distance_km, maximum_fee=maximum_fee,
                    fee_is_mandatory=fee_is_mandatory, scheduled_after=scheduled_after,
                    scheduled_before=scheduled_before, schedule_is_mandatory=schedule_is_mandatory,
                    assessment=answers, limit=limit, offset=offset)
                result = assessment_ranking.rank(session, request, None, api_client_id=client)
                session.commit()
                deps.note_ranking_audit(result.audit_id)
        return AssessmentRankingOutput.model_validate(result, from_attributes=True)
