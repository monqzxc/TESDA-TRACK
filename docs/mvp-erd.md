# TESDA-TRACK MVP entity relationship diagram

Prepared 14 October 2026. Companion: [feature list, priorities, and statuses](mvp-features.md).

This ERD follows the project roadmap and user stories, using the current FastAPI/SQLModel models and migrations through `0007` for actual table names and relationships. It covers 26 application tables in five readable views. Tables repeated across views refer to the same entity. Selected business fields are shown; routine timestamps, security counters, and descriptive fields are omitted where they do not clarify a relationship.

The root `30_DATABASE_SCHEMA_MERMAID.md` describes a different Laravel/SSO schema and is not used as the source for this ERD. This document does not change that file or the database. It reflects working-tree definitions, including uncommitted additions, rather than a verified live database.

**Notation:** `PK` = primary key, `FK` = foreign key, `UK` = unique key. In the relationship lines, `||` means exactly one, `o|` means zero or one, and `o{` means zero or many. Dashed lines denote non-identifying relationships; solid lines are used where the parent key is part of the child's primary key. Nullable foreign keys are labelled. Composite keys and uniqueness rules are explained below.

## 1. Catalog, accounts, recommendations, and readiness

Supports F01–F07 and saved personalized recommendations in F19.

```mermaid
erDiagram
    sector ||..o{ qualification : contains
    qualification ||..o{ competency : defines
    learner ||..o{ goal : sets
    qualification o|..o{ goal : optional_target
    learner ||..o{ recommendation_session : saves
    goal o|..o{ recommendation_session : optional_goal
    qualification o|..o{ recommendation_session : optional_selection
    learner ||..o{ readiness_check : submits
    qualification ||..o{ readiness_check : measures
    recommendation_session o|..o{ readiness_check : optional_context
    readiness_check ||--o{ readiness_answer : includes
    competency ||--o{ readiness_answer : receives

    sector {
        int id PK
        string name UK
    }
    qualification {
        int id PK
        string code UK
        int sector_id FK
        string name
        string skill_label
        text_array career_keywords
        text_array possible_jobs
        boolean is_active
    }
    competency {
        int id PK
        int qualification_id FK
        int position
        string name
        string category "Basic, Common, Core"
        boolean is_active
    }
    learner {
        uuid id PK
        string email UK
        string password_hash
        string full_name
        string role "learner or admin"
        boolean is_active
        datetime privacy_consent_at
    }
    goal {
        uuid id PK
        uuid learner_id FK
        int target_qualification_id FK "nullable"
        string title
        string status "active, achieved, archived"
        date target_date "nullable"
    }
    recommendation_session {
        uuid id PK
        uuid learner_id FK
        uuid goal_id FK "nullable"
        uuid assessment_id FK "nullable - view 4"
        int qualification_id FK "nullable"
        text query
        string analysis_source "rules or ai"
        jsonb analysis_profile
        jsonb profile
        jsonb matches
        jsonb pathway "nullable snapshot"
    }
    readiness_check {
        uuid id PK
        uuid learner_id FK
        int qualification_id FK
        uuid recommendation_session_id FK "nullable"
        float score
        string level
        jsonb result
        datetime created_at
    }
    readiness_answer {
        uuid readiness_check_id PK, FK
        int competency_id PK, FK
        string answer "confident, some_experience, not_familiar"
    }
```

Each competency belongs to one qualification in this implementation; there is no qualification/competency junction table. Possible jobs and career keywords are arrays on the qualification, not separate job entities. Each check/competency pair has one answer. Scores and result snapshots are stored on the check; the application validates completeness and qualification consistency.

## 2. Training, assessment applications, and certifications

Supports F08 and F10–F14. `learner` and `qualification` are defined in view 1.

```mermaid
erDiagram
    region ||..o{ training_provider : groups
    region ||..o{ assessment_center : groups
    training_provider ||..o{ training_program : offers
    qualification ||..o{ training_program : prepares_for
    assessment_center ||..o{ assessment_schedule : hosts
    qualification ||..o{ assessment_schedule : assesses
    learner ||..o{ assessment_application : submits
    assessment_schedule ||..o{ assessment_application : receives
    learner ||..o{ certification : owns
    qualification o|..o{ certification : optional_qualification
    assessment_application o|..o| certification : optional_origin

    region {
        string code PK
        string name
        string center_city
        float latitude
        float longitude
    }
    training_provider {
        int id PK
        string region_code FK
        string name
        string address "nullable"
        float latitude "nullable"
        float longitude "nullable"
        boolean is_active
    }
    training_program {
        int id PK
        int provider_id FK
        int qualification_id FK
        string title
        string delivery_mode
        int duration_hours "nullable"
        decimal cost "nullable"
        boolean scholarship_available
        date start_date "nullable"
        date end_date "nullable"
        int slots "nullable"
        boolean is_active
        string availability_status
        string availability_source "nullable"
        datetime availability_checked_at "nullable"
        datetime availability_valid_until "nullable"
    }
    assessment_center {
        int id PK
        string region_code FK
        string name
        string address "nullable"
        float latitude "nullable"
        float longitude "nullable"
        boolean is_active
    }
    assessment_schedule {
        int id PK
        int center_id FK
        int qualification_id FK
        datetime scheduled_at
        int slots
        decimal fee "nullable"
        string status "open, closed, cancelled, completed"
        string availability_status
        string availability_source "nullable"
        datetime availability_checked_at "nullable"
        datetime availability_valid_until "nullable"
    }
    assessment_application {
        uuid id PK
        uuid learner_id FK
        int schedule_id FK
        string status "pending, approved, rejected, withdrawn, completed"
        string result "nullable - competent or not_yet_competent"
        string reviewer_note "nullable"
    }
    certification {
        uuid id PK
        uuid learner_id FK
        int qualification_id FK "nullable"
        uuid assessment_application_id FK, UK "nullable"
        string title
        string certificate_number "nullable"
        string issuing_body
        date issued_on "nullable"
        date expires_on "nullable"
        boolean verified
        string source "self_reported or assessment"
    }
```

A learner can have at most one application row for each schedule. A single application can be linked to at most one certification; self-reported certifications need no application link. A certificate number itself is not declared unique. An assessment result is allowed only on a completed application. Pending applications do not reserve seats; capacity is checked by the service, with approved/completed applications consuming seats.

Programs and schedules have separate availability evidence. Unknown fees are not zero fees, and a scheduled date is not proof of verified service authority. Providers and assessment centers are separate entities even if one organization performs both roles. PostGIS indexes derive geography from latitude/longitude rather than a separate location table.

## 3. Curated pathways and learner progress

Supports F04 and F13. A pathway enrollment records progress inside TESDA-TRACK, not admission to a training provider.

```mermaid
erDiagram
    qualification ||..o{ pathway : has_routes
    pathway ||..o{ pathway_step : orders
    learner ||..o{ pathway_enrollment : follows
    pathway ||..o{ pathway_enrollment : receives
    pathway_enrollment ||--o{ step_progress : tracks
    pathway_step ||--o{ step_progress : records

    pathway {
        int id PK
        int qualification_id FK
        string route "TRAINING_AND_ASSESSMENT, ASSESSMENT_READINESS, SKILL_GAP_CHECK"
        string title
        text description
        boolean is_active
    }
    pathway_step {
        int id PK
        int pathway_id FK
        int position
        string kind "self_check, training, assessment, certification, other"
        string title
        text description
    }
    pathway_enrollment {
        uuid id PK
        uuid learner_id FK
        int pathway_id FK
        string status "active, completed, withdrawn"
        datetime completed_at "nullable"
    }
    step_progress {
        uuid enrollment_id PK, FK
        int step_id PK, FK
        string status "not_started, in_progress, completed"
        datetime updated_at
    }
```

One pathway exists per qualification/route pair; step positions are unique within a pathway. A learner has at most one enrollment per pathway. Untouched steps have no progress row and are treated as not started. Services must ensure a progress step belongs to the enrollment's pathway; the two independent foreign keys alone do not enforce that relationship.

The JSON `recommendation_session.pathway` is a historical snapshot, not a foreign key to `pathway`.

## 4. Personalized assessments and service verification

Supports F19–F21 and part of US-12. Assessment revisions are learner questionnaires; they are distinct from official exam schedules and readiness checks.

```mermaid
erDiagram
    learner ||..o{ learner_assessment : saves_revisions
    learner_assessment o|..o{ learner_assessment : previous_revision
    learner_assessment o|..o{ recommendation_session : optional_basis
    training_provider o|..o{ service_verification : training_authority
    assessment_center o|..o{ service_verification : assessment_authority
    qualification ||..o{ service_verification : authorizes_for

    learner_assessment {
        uuid id PK
        uuid learner_id FK
        uuid series_id
        int revision
        uuid previous_revision_id FK "nullable"
        jsonb answers "includes questionnaire version"
        datetime created_at
    }
    service_verification {
        int id PK
        int provider_id FK "nullable - exactly one site"
        int center_id FK "nullable - exactly one site"
        int qualification_id FK
        string status "unknown, verified, unavailable, expired"
        string source_name "nullable"
        string source_reference "nullable"
        string source_record_id "nullable"
        string source_version "nullable"
        datetime reviewed_at "nullable"
        datetime review_due_at "nullable"
        datetime valid_from "nullable"
        datetime valid_until "nullable"
        boolean is_synthetic
        boolean requirements_reviewed
        jsonb requirements
    }
```

The database requires **exactly one** of `provider_id` and `center_id` per verification row. A site/qualification pair has at most one verification row for its service type. Verified status requires source/review evidence and disallows synthetic data; effective validity and prerequisite decisions also use service logic.

Each assessment series/revision pair is unique. `series_id` groups revisions; it is not a foreign key to an omitted series table. Questionnaire version and normalized input are inside `answers`. The self-reference permits multiple successors at the database level; the assessment service enforces revision workflow rules. Guest questionnaire input is transient and creates no learner-owned record unless explicitly saved.

## 5. Search, ranking audit, caching, and reporting support

Supports F03 and F15–F18, with assessment references supporting F19–F21. These tables support the product but are not separate learner-facing features.

```mermaid
erDiagram
    qualification ||--o| qualification_embedding : semantic_vector
    training_program ||--o| training_program_embedding : semantic_vector
    learner o|..o{ ranking_audit : optional_owner
    learner_assessment o|..o{ ranking_audit : optional_basis
    qualification ||..o{ ranking_audit : ranks_services_for

    qualification_embedding {
        int qualification_id PK, FK
        string model
        string content_hash
        vector embedding "384 dimensions"
        datetime updated_at
    }
    training_program_embedding {
        int program_id PK, FK
        string model
        string content_hash
        vector embedding "384 dimensions"
        datetime updated_at
    }
    ranking_audit {
        bigint id PK
        uuid learner_id FK "nullable"
        uuid assessment_id FK "nullable"
        int qualification_id FK
        string query_hash "nullable"
        float near_lat "nullable rounded coordinate"
        float near_lon "nullable rounded coordinate"
        jsonb preferences
        jsonb weights
        string model "nullable"
        jsonb results
        datetime created_at
    }
    cache_entry {
        string key PK
        jsonb value
        datetime expires_at
        datetime created_at
    }
    match_daily_stat {
        date date PK
        int requests
        int no_match
    }
```

Each qualification/program has at most one current embedding row: its entity ID alone is the primary key, while `model` records which model produced it. The database does not use a composite entity/model key.

Both training and assessment rankings use `ranking_audit`; assessment rankings are identified by `preferences.service_kind = "assessment"`. Results and explanations are JSON snapshots, not foreign-key junction rows for every ranked result. Audit rows store a goal hash rather than raw goal text; saved learner recommendation sessions separately retain their query text. Cache entries and daily aggregate counts have no learner foreign key. Skills Bridge has no imported local skills/occupation tables.

## Constraints and lifecycle rules

| Entity | Database rule |
| --- | --- |
| `learner` | Unique email; role restricted to learner/admin. |
| `qualification` | Unique code; sector reference is required. |
| `competency` | Unique `(qualification_id, position)`; positive position. |
| `readiness_answer` | Composite PK `(readiness_check_id, competency_id)`. |
| `assessment_application` | Unique `(learner_id, schedule_id)`; result requires completed status. |
| `certification` | Unique non-null application reference; expiry cannot precede issue date when both exist. |
| `pathway` | Unique `(qualification_id, route)`. |
| `pathway_step` | Unique `(pathway_id, position)`; positive position. |
| `pathway_enrollment` | Unique `(learner_id, pathway_id)`. |
| `step_progress` | Composite PK `(enrollment_id, step_id)`. |
| `learner_assessment` | Unique `(series_id, revision)`; positive revision. |
| `service_verification` | Exactly one site FK; unique provider/qualification and center/qualification pairs. |
| Embedding tables | One row per referenced qualification/program. |

Deleting a learner cascades to owned goals, assessments, saved sessions, checks, applications, certifications, and pathway enrollments. Child readiness answers and step progress also cascade. Audit learner links use `SET NULL`. Deleting an assessment cascades to linked recommendation sessions and clears audit assessment links; the API deletes an entire revision series. Readiness checks survive deletion of their associated recommendation session because that link uses `SET NULL`.

Deleting a goal clears optional session goal references. Deleting an assessment application clears its certification link. Many catalog/delivery references restrict deletion to protect historical records; qualification records are normally archived with `is_active`. Foreign keys establish references, while service ownership checks ensure a learner cannot attach another learner's records.

## Relationship to proposed features

| Proposed or partial feature | Data-design implication |
| --- | --- |
| Guest journey saving (US-02) | Reuse recommendation sessions and readiness records; no guest-account table is required. |
| Continue journey (US-10) | Reuse saved sessions, pathway progress, and applications; define restoration/ordering behavior. |
| Qualification shortlist (US-05) | Session-only state needs no table. Cross-device persistence would be a separate design. |
| Readiness comparisons (US-11) | Existing checks support history; robust historical comparability may need competency/catalog version snapshots. |
| Source visibility (US-12) | Service verification exists; complete qualification provenance may require additional fields or a related evidence entity. No unimplemented entity is drawn as existing. |
| Interface language (US-15) | Session-only preference needs no table. Account-level persistence would require an explicit addition. |

## Sources

- [Product roadmap](../README.md#roadmap) and [user stories](user-stories.md).
- Model definitions: [catalog](../backend/tesda_track/models/catalog.py), [learners](../backend/tesda_track/models/learners.py), [delivery](../backend/tesda_track/models/delivery.py), [pathways](../backend/tesda_track/models/pathways.py), [learner assessments](../backend/tesda_track/models/learner_assessments.py), [verification](../backend/tesda_track/models/verification.py), [semantic support](../backend/tesda_track/models/semantic.py), and [daily statistics](../backend/tesda_track/models/stats.py).
- [Migrations](../backend/migrations/versions/), [structured assessment behavior](structured-assessments.md), [verification behavior](service-verification.md), and [assessment-center ranking](assessment-center-ranking.md).
