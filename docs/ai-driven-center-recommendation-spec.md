# TESDA-TRACK: AI-Driven Training & Assessment Center Recommendations

Technical task specification · 9 November 2026 · Proposed work, grounded in the current repository

**Objective:** Recommend relevant TESDA qualifications and suitable training or assessment services for a learner, using their profile, reviewed labor-market evidence, verified service availability and practical geographic access. Explain separately **what fits, where to go, and why**.

## Before rewriting the task: four professional checks

### 1. What a top professional would do beyond the original request

A recommendation specialist working with a TESDA assessor and geospatial analyst would define the decision and its possible failure before choosing an AI model. A relevant qualification, an authorized provider, an available intake and a reachable service are separate claims requiring separate evidence.

They would examine the entire candidate set, not just attractive examples. They would test whether a beginner is wrongly excluded, whether prior certification leads to redundant training, whether a high score hides an unknown prerequisite, and whether the nearest center is actually reachable. They would establish simple baselines and ask whether semantic matching and travel-time ranking improve independently judged recommendations.

They would also define legitimate abstention: “No confirmed service meets your requirements” or “Local demand evidence is unavailable.” These outcomes must remain possible when the model can produce a plausible answer. Qualification fit must not imply an employment guarantee, and self-reported readiness must not establish formal assessment eligibility.

For this task, the professional counterfactual is **the recommendation a learner would receive from the existing fit matcher and nearest verified eligible center**. Testing whether a new training center should be opened is a separate planning question.

### 2. The rawest material they would start from

Start from identifiable observations and original records, retaining the transformations into recommendations.

| Claim | Raw material | Important limit |
| --- | --- | --- |
| Learner fit | Original goal, interests, self-reported skills, competency answers, preferred pathway and constraints | Self-report is distinguishable from verified credentials; an existing credential does not prove what the learner should study next. |
| Qualification relevance | Current TESDA Training Regulations, competency units, qualification identifiers and reviewed occupation relationships | A similar job title is a proposed relationship until reviewed, not an official equivalence. |
| Employer demand | Individual posting identifiers/URLs, employer, occupation, job location, observation/posting dates and headcount only where explicitly reported | One posting may represent multiple workers, repeated recruitment or a closed position. Missing headcount remains unknown. |
| Training provision | Original registry workbook/source rows and qualification-specific registration, followed by provider-confirmed intake, dates, fees and available seats | Registration establishes an offering; it does not establish current intake or remaining capacity. |
| Assessment provision | Qualification-specific center authorization and independently confirmed schedules, prerequisites and remaining seats | Training authorization and assessment authorization are distinct. |
| Accessibility | Confirmed center entrance, learner-selected departure point, transport mode, routing network and observed journeys | Road routing does not establish bus/jeepney access, traffic conditions or wheelchair access. |
| Outcomes | Consented learner follow-up, enrollment, assessment, certification and qualification-related employment observations | An aggregate employment rate cannot be assigned to an individual center or learner. |

TESDA describes Training Regulations as defining national qualification competency and assessment arrangements. Its public [registered-program search](https://www.tesda.gov.ph/TVI) and [assessment-center directory](https://www.tesda.gov.ph/AssessmentCenters) provide separate verification entry points. Treat current operational availability as additional evidence. [TESDA competency standards](https://www.tesda.gov.ph/About/TESDA/85)

The rawest demand material currently in this repository is a **4 November 2026 snapshot containing 4,237 posting records**, not 4,237 verified job openings or workers. It lacks a longitudinal series and worker headcounts. Original registry imports also lack current training seats, fees and dates, and create assessment centers without schedules. See [demand-source notes](../backend/seed/sources/labor_demand/README.md) and [registry import semantics](registry-import.md). Obtaining missing observations is a data dependency, not something AI can repair.

### 3. Specific methods and tools

| Decision | Method | Tools and reuse |
| --- | --- | --- |
| Find candidate qualifications | Existing rules plus optional semantic retrieval; reviewed occupation-to-qualification links | Current E5/FastEmbed interface, pgvector and catalog services; compare semantic mode against rules before enabling a new policy. |
| Establish demand evidence | Source-ID deduplication; reviewed repost groups; occupation mapping; explicit geographic and date windows | Existing versioned CSV imports, Python, PostgreSQL and protected mapping-review workflow. No demand forecast is fitted to one snapshot. |
| Establish service suitability | Qualification-specific authority, source validity, availability, prerequisites and mandatory constraints before scoring | Existing verification, training and assessment services; separate confirmed and unresolved results. |
| Compare geographic access | Mode-specific network duration, snapped-endpoint checks and cross-boundary candidate search | PostGIS for spatial retrieval; reuse the OSRM adapter/cache, with bounded route or table requests to an approved endpoint. |
| Rank and explain | Two connected stages; deterministic contributions and explicit unknown states; separate evidence dimensions | Existing FastAPI schemas, personalization services, ranking audits and React finder/center views. |
| Establish quality | Blinded relevance judgments, held-out comparisons, observed journeys and provider confirmation | Existing pytest/evaluation tools; Python paired-bootstrap analysis and QGIS for manual route/location review where useful. |

OSRM's profile is determined by the prepared routing dataset; its table service returns route durations and can return null for unreachable pairs. Therefore mode support and null handling must be explicit. [OSRM API](https://project-osrm.org/docs/v5.24.0/api/)

The initial scope requires no new LLM, model training, vector database, microservice, 2SFCA model or capacity optimization. Template explanations over recorded evidence are sufficient. Population catchment analysis belongs to a later planning use case if that question is commissioned.

### 4. What, other than the author or requester, would show the result is right

Four independent references are required: TESDA/domain reviewers judging qualification relevance; authoritative records and provider confirmation of offered services; observed journeys checking accessibility; and later learner records checking whether the recommendation was usable. Assessors should grade results without knowing which ranking method produced them.

Passing application tests establishes implementation behavior. It does not establish matching accuracy, route accuracy or employment impact. Existing evaluation cases are engineering drafts pending expert review; cases used to tune a model become development/regression material. They cannot subsequently serve as the independent test set. See [current evaluation limits](evaluation-and-release-checks.md).

The evaluation and release criteria below specify how these references are used.

## Rewritten technical task

### Research question and scope

**For a learner with a stated goal and constraints, which TESDA qualifications are relevant, what labor-market evidence supports them in the selected area and period, and which verified training or assessment services can the learner reasonably access?**

The unit of recommendation is **learner × qualification × selected area × reference period**. The service unit is **site × qualification × service type × intake/schedule**. Training and assessment are returned separately even when the same organization provides both.

The first pilot uses one declared region and a reviewed subset of qualifications and services. Cross-boundary centers remain eligible unless the learner explicitly requires a region restriction. Regional demand may support the pilot, but municipal demand conclusions require validated municipal observations. National evidence stays national.

Center-opening decisions, workforce-shortage estimates, nationwide investment allocation and causal employment-impact claims are outside this delivery. Supply statistics support learner choice rather than prescribe additional programs.

### Current foundation and precise gaps

This is an incremental specification. The following findings describe checked source code and committed data, not the current contents of a deployed database.

| Foundation already present | Narrow addition required |
| --- | --- |
| Structured qualification fit through `POST /api/v1/recommendations/qualifications`; goal/skills discovery through analysis routes | Return coherent fit and localized demand evidence together, preserving their separate meanings. |
| Explicit demand discovery using approved current forecasts, with generic results labeled `demand_evidence` rather than personal-fit percentages | Add typed supporting statistics and coverage; preserve the distinction between demand exploration and personalized recommendations. |
| Separate `recommendations/training` and `recommendations/assessments` endpoints, authority/eligibility gates, unresolved alternatives and audits | Add travel-time constraints and a service-logistics policy that does not double-count qualification fit. |
| OSRM road directions for supported car/bike/foot profiles, independent of ranking | Feed validated route evidence into center comparison. Rankers currently use straight-line distance. |
| Audited, versioned labor-market imports and reviewed qualification links | Add explicit spatial/time aggregation and deduplication contracts; distinguish absent evidence from absent demand. |
| Source checks and engineering evaluation | Add independent labels, provider checks and field accessibility validation. |

Source entry points: [recommendation routes](../backend/tesda_track/routers/recommendations.py), [personalization](../backend/tesda_track/services/personalization.py), [demand discovery](../backend/tesda_track/services/demand_discovery.py), [labor-market service](../backend/tesda_track/services/labor_market.py), [training ranker](../backend/tesda_track/services/ranking.py), [assessment ranker](../backend/tesda_track/services/assessment_ranking.py), and [routing](../backend/tesda_track/services/routing.py).

The latest [US-20 handoff](us20-setup.md) records portable mapping approvals, while some earlier documents describe pre-review states. An approved link is an association, not a vacancy count. Activation and service freshness must be checked in the target environment before use.

### Task 1 — Define evidence that can support a recommendation

Reuse existing records and add only missing fields. Every analytical measure must carry its value or null, unit, evidence kind, geography, reference period, observation/review date, source/version, method version and limitations. Preserve original row identifiers, file hashes and mapping-review decisions.

Maintain distinct evidence kinds:

- **Observed:** dated postings, confirmed current seats, verified services or measured journeys, each with its actual unit.
- **Estimated:** a quantity derived with a documented, independently validated estimation method and uncertainty interval. Disabled where no validated estimator exists.
- **Forecast:** a source's future classification or numeric projection, preserving which one it is. A categorical “in-demand” label is not a projected vacancy total.

For posting statistics, group repeated captures by stable source ID. Where IDs are absent, retain suspected duplicates as explicit review groups using employer, normalized title, workplace, dates and source evidence. Record the deduplication policy and unresolved count. Do not merge distinct positions simply because their titles match. Exclude overseas records from domestic local totals; unresolved workplace locations remain unallocated.

Use the job workplace, not the employer headquarters, for geography. Validate municipality codes and geocoding confidence before local aggregation. National/regional evidence cannot be downscaled by distributing counts among municipalities. Record observation window separately from posting dates: a single list snapshot cannot establish how many vacancies existed throughout a quarter.

Occupation-to-qualification mapping is many-to-many. Counts per qualification may overlap. Combined totals must deduplicate source records across those mappings and disclose overlap. Mapping approval, dataset activity and evidence validity are checked at recommendation time.

**Acceptance:** The same evidence IDs and policy reproduce a statistic. Review revocation or dataset retirement removes its eligibility for new recommendations without rewriting historical snapshots.

### Task 2 — Recommend qualifications, with demand explained separately

Retain two explicit entry modes:

1. **Personalized pathway:** Match interests, career goal and skills to active catalog qualifications. Preserve beginner pathways and distinguish skills to develop from formal entry requirements. Attach reviewed evidence for the selected geography/period and show broader fallback at its true scope.
2. **Explore demand-linked pathways:** Discover qualifications linked to approved current forecast occupations using the existing demand-discovery policy. A generic request without learner evidence produces an evidence-linked directory, not a personal-fit score. Dated postings appear as observations alongside it, not as a new forecast.

For the first policy, retain learner fit as the personalized ordering and make demand an independently visible decision dimension. Learners can choose demand exploration explicitly. Do not invent a numeric demand bonus from incomparable forecasts and posting counts. A later demand-weighted ordering requires a frozen normalization policy and held-out evidence that it improves recommendations before replacing this policy.

“Based on need in the area” means a traceable occupation/qualification association with the observed or forecast geography and period shown. It does not mean the system has established a worker shortage. Weak or missing local evidence must not be reported as zero demand or make an otherwise relevant qualification irrelevant.

For each qualification return the fit basis/components where measured, linked occupations, separate observed and forecast evidence, geography match, data age, limitations and route choice guidance. Self-reported readiness may suggest training versus an assessment inquiry, but formal prerequisites still require their authoritative evidence.

**Acceptance:** A personally relevant qualification with only national evidence is described as such. An unrelated high-demand occupation cannot become a high personal match. An irrelevant or insufficient learner profile can yield no personalized result.

### Task 3 — Recommend training and assessment services

Retrieve offerings for the selected qualification and apply existing mandatory checks before ranking: current qualification-specific authority, validity through the service date, learner prerequisites, service availability and user-designated hard constraints. Assessment additionally requires an open future schedule and remaining capacity. Unknown mandatory evidence belongs in `requires_verification`; failed checks are excluded from confirmed results.

For **training**, distinguish confirmed enrollment availability from a registered offering. Return cost, intake dates, mode and seats only when evidenced. For **assessment**, return exam fee, date, prerequisites and current remaining seats. A training budget or preferred start date must not silently become an assessment fee or exam-date constraint.

In the proposed service policy, qualification fit remains available from Task 2 and is not counted again as center-specific evidence. Rank confirmed services using **accessibility and practical preferences only**, with their configured/effective weights, contributions and missing evidence returned. Define and freeze these engineering weights in a versioned policy before evaluation; do not describe them as learned or validated weights. With no usable service preferences, use stable date/identifier ordering without a fit percentage.

Use the current missing-data discipline: omitted learner dimensions are removed consistently for the request; candidate-specific unknowns receive no positive contribution and keep their denominator share. Coverage is observed evidence weight divided by applicable weight. Coverage is not a probability of a good recommendation or employment.

Evaluate the complete eligible candidate set before final pagination, or explicitly disclose a bounded search and its incompleteness. Confirmed training and assessment results retain separate orderings, totals and unresolved collections. Recheck current authority, eligibility, seats and availability when an assessment application is submitted or approved; the ranking never reserves a seat. Training choices lead to provider contact and confirmation through the existing flow, without adding a training enrollment subsystem.

**Acceptance:** A high score cannot restore failed prerequisites, an expired authorization, a full exam or an unknown mandatory fee. A learner can receive a suitable qualification and no confirmed service, with the precise reason and next verification step.

### Task 4 — Make geographic access affect center choice

Add a distinct, user-selected **travel origin** and mode for comparison, optionally a public landmark. Existing assessment/ranking coordinates are rounded to one decimal degree, approximately 11 km, while directions use two decimals, approximately 1 km. Do not silently reinterpret those stored coordinates as a precise departure point. A region centroid supports regional browsing, not a claim about the learner's actual commute.

Reuse rounded-origin handling, bounded requests and caching. Store only the declared approximate/public reference and the minimum evidence necessary to explain a result; keep precise home coordinates, route URLs and raw location input out of logs and exports. Cache identity must include origin precision, destination, mode, routing dataset/profile version and expiry. Unavailable version metadata is disclosed.

For each candidate compute modeled route duration in the chosen supported mode. Store network distance separately from straight-line distance, and check origin/destination snap distances. An unvalidated connection from a road endpoint to a center entrance is not confirmed access. Validate routing endpoint/profile support before using route/table requests; public directions endpoints must not be assumed suitable for bulk ranking.

For a requested soft travel budget `B` minutes and usable modeled duration `t`, a provisional accessibility component is `100 × max(0, 1 − t/B)`. This is a transparent preference function, not an empirical utility model. A mandatory budget excludes known durations above `B`; unknown routes cannot satisfy it. With no time budget, show durations without inventing an acceptable maximum and omit that score component. Resolve equal scores by shorter usable duration, then service date and stable ID.

Return distinct states for `modeled_route`, `no_route_in_network`, `unsupported_mode`, `routing_unavailable` and `origin_or_destination_unknown`. Straight-line distance may support clearly labeled browsing during failures, but cannot pass a travel-time constraint. “No route in network” does not prove a site is physically unreachable. Estimated flight arcs and car routes cannot stand in for scheduled flights or public transport.

Search across administrative boundaries within the declared search extent. A radius in kilometers and a budget in minutes remain different constraints. Show road durations as modeled, without traffic; a public-transport-only learner receives an explicit coverage limitation until suitable transport evidence exists.

**Acceptance:** A farther center can outrank a nearer one when its supported route is faster and mandatory conditions are met. A router outage changes evidence status without fabricating travel minutes. The response identifies the origin, mode, method, search extent and limitations used.

### Task 5 — Show supply-and-demand statistics with valid units

For each qualification, selected area/catchment and reference window, return a compact evidence panel:

| Measure | Definition and required disclosure |
| --- | --- |
| Observed postings | Distinct retained posting records at the snapshot/window; distinct employers separately; mapping overlap and unresolved duplicates disclosed. |
| Forecast support | Original occupation/classification, publisher, geography and reporting period; categorical unless the source explicitly supplies a numeric forecast. |
| Registered training provision | Distinct registered sites and qualification-program records, counted separately; not a claim of current intake. |
| Confirmed training availability | Offerings with current affirmative availability evidence; remaining seats summed only when separately known, same-window and nonduplicated. Published total slots remain a separate measure. |
| Confirmed assessment availability | Eligible current schedules/sites and remaining seats for the selected assessment window, deduplicated by schedule. |
| Modeled accessible provision | The subset within the declared origin/mode/time budget, with route success and unknown-route denominators. |
| Evidence completeness | Counts with current evidence divided by candidate records in the stated dataset/search extent, by measure; registry-wide market coverage remains unknown unless independently measured. |

Each aggregate includes `known_record_count`, `eligible_record_count`, unknown count and source coverage. With no observed numeric records, the numeric value is null. If two of five offerings report 30 remaining seats in total, report “30 reported remaining seats across 2 of 5 offerings; total capacity unknown.” If all five report zero, report an observed zero for those five, preserving the dataset coverage limitation.

Do not subtract postings from seats or graduates to label a workforce shortage: postings, people, training flows and remaining intake seats have different units and periods. Certified people are not necessarily available job seekers. No labor-supply estimator is included in this task.

### Task 6 — Integrate the evidence into the existing workflow

Keep the journey: **goal/profile → qualification choices → training or assessment comparison → training-provider contact or assessment application**. Assessment applications retain current server-side checks. Selecting a center never silently changes the chosen qualification. When the recommended qualification has no feasible center, offer an explicit return to alternatives.

Extend existing endpoints with additive/versioned contracts rather than introducing a parallel engine. `/api/v1/analysis/matches` and `/api/v1/recommendations/qualifications` remain entry points appropriate to their existing modes; `/api/v1/recommendations/training` and `/api/v1/recommendations/assessments` retain separate semantics. Reuse existing labor-market APIs, source review and ownership rules.

Proposed logical response groups, mapped to the existing schemas during implementation:

| Group | Required content |
| --- | --- |
| Context | Mode, qualification, selected evidence area, travel origin type/precision, service windows, evaluation time, policy/model/source versions and search extent. |
| Qualification evidence | Learner fit where measured; occupation mappings; separate observed/estimated/forecast records; scope match and limitations. |
| Service evidence | Training or assessment discriminator, authority, eligibility, availability, logistics, accessibility and current checked time. |
| Statistics | Typed values, units, periods, known/unknown denominators and coverage statements from Task 5. |
| Decision | Confirmed ordered results, unscored unresolved alternatives, no-result reason codes, explanations and audit references. |

Explanations must be generated from the same evidence/checks/contributions used in the decision. Show why this qualification fits, why this service ranks here, the tradeoff versus the next option, and what remains unknown. Reuse source references and provide a checked date. No LLM is needed to create those facts.

Reuse learner-owned audits and immutable assessment revisions. Record compact evidence IDs/versions and the effective policy so a historical decision can be reconstructed, without copying raw goals, questionnaire answers or precise location into new analytical logs. Document live pagination versus historical snapshots. A saved result describes the decision at that time, not current permission to apply.

## Independent evaluation and release gates

Freeze candidate data, policy, evaluation time, model identity, source versions and labels before comparing methods. Group related goals/rephrases and reposts to avoid leakage across development and test sets. Later-period observations cannot support an earlier simulated recommendation. Geographic transfer results must be reported separately from in-area results.

| Evaluation | Independent reference and method | Decision criterion |
| --- | --- | --- |
| Qualification relevance | At least two TESDA/domain reviewers independently grade the complete declared pilot qualification catalog for each held-out case, blind to system identity; include cases with no relevant qualification, adjudicate disagreement and retain initial grades. Compare rules-only and current semantic mode. | Use nDCG@3 on cases with relevant gold qualifications as the primary metric; report Recall@3 against the independently established relevant sets, unjudged rate and abstention precision/recall including no-fit cases. Promote an AI change only if the 95% paired-bootstrap interval for its primary-metric improvement is above zero and preregistered slice-regression limits pass. Otherwise retain the baseline. |
| Demand fidelity | A reviewer traces a stratified sample back to original postings, forecast tables and approved mappings. Later snapshots test persistence only when repeated observations are available. | No source-scope, date, unit or forecast/observation misrepresentation in the audited release sample. Publish sampled mapping precision and unresolved coverage. No numeric forecast-accuracy claim without a numeric forecast and later observations. |
| Service truth | Independent registry check plus dated provider confirmation of qualification authority, intake, fees, schedules and seats; compare to API results at the same time. | Zero confirmed recommendations with known failed mandatory conditions; unknown mandatory evidence remains unresolved. Publish verification coverage and expiry behavior. |
| Geographic validity | Observed pilot journeys from the declared departure points and modes; manual checks of endpoints/barriers. Compare route-based and straight-line rankings using the same frozen eligible candidates. | Report median/90th-percentile absolute duration error, bias, route coverage and independently judged travel feasibility. Set tolerances before field measurement; do not claim practical accessibility until they pass. |
| Practical usefulness | Consented prospective follow-up on contactability, feasible enrollment/application, assessment and certification; retain nonresponse and attrition denominators. | Report feasibility and completion outcomes separately from clicks/satisfaction. Employment follow-up is exploratory until adequate verified observations exist. |

For paired comparisons, compute bootstrap intervals by independent learner case, keeping related scenarios together. Freeze relevance grades, missing-judgment handling and slice-regression limits before comparison. Unexpected unjudged results receive zero numerical relevance credit and are counted explicitly; this is not a judgment of irrelevance. Report English, Filipino/Taglish, beginners, experienced learners, rural/urban locations, cross-boundary journeys and missing-evidence cases separately where sample size permits. Small slices remain inconclusive. Set sample size from the primary metric's desired precision/minimum meaningful improvement before collection; do not invent a universal pass percentage.

TESDA's [SETG research series](https://www.tesda.gov.ph/About/TESDA/20863) can inform outcome definitions. Published aggregate survey results provide context; they do not prove that this app or a recommended center caused employment gains. A randomized or carefully controlled evaluation would be needed for that stronger claim, not for this initial recommendation release.

Mandatory engineering acceptance cases:

1. National evidence selected in a municipality retains its national label; out-of-period sources cannot become current evidence.
2. A posting linked to multiple qualifications counts once in a combined total; unresolved deduplication is disclosed.
3. Missing seats yield null/unknown capacity; a fully observed zero remains zero for its documented coverage.
4. Revoked authority, expired review, failed prerequisites, full schedules and unknown mandatory fees cannot be rescued by fit.
5. Training and assessment authority, dates, fees and seats remain separate; the existing application workflow is assessment-specific.
6. A supported faster route can change center order; unsupported transit, router failure and no-route states remain distinct.
7. A travel-time constraint never passes using straight-line distance or an estimated flight arc.
8. Candidates beyond an initial retrieval page remain eligible for final ranking; pagination/ties are deterministic for a frozen snapshot.
9. Returned contributions reproduce scores; missing evidence never produces a perfect fit or an employment probability.
10. Guests can compare transient inputs; saved assessments/audits enforce ownership and retain export/deletion behavior.
11. Assessment application submission and approval recheck current facts after seats, eligibility or source status change.
12. Model/routing failures leave the baseline usable with explicit limitations, and no-result outcomes remain actionable.

Use existing backend tests/evaluators and frontend integration tests. Add contract/regression cases for the new evidence and travel policy; test against the designated disposable test database. Measure deterministic, route-cache-hit and cold-routing latency separately, with candidate count and timeout behavior. Freeze performance budgets before implementation comparisons. Existing engineering gates do not establish a production SLA.

## Delivery sequence and definition of done

1. **Evidence contract and baseline:** document current API examples, deduplication/geography rules, source inventory, missingness, frozen baseline rankings and independent evaluation protocol. Reconcile the new policy with existing callers before changing responses.
2. **One complete pilot journey:** attach qualification demand evidence and typed supply statistics; connect one supported road mode to existing verified training/assessment comparisons; expose unresolved and empty states with traceable reasons.
3. **Independent checks and release record:** run behavioral checks, conduct reviewer/provider/journey validation, and publish the comparison, coverage, unresolved dependencies and enabled policy versions. Use conditional rollout when an AI or travel policy has not met its gate.

The implementation is complete when a learner can receive a qualification and separate feasible service choices, inspect evidence and limitations, and reproduce why they were ranked. The pilot is validated only when its independently judged relevance, service truth and geographic accuracy gates have passed. Neither status implies demonstrated employment impact.

Required implementation deliverables are the additive contracts/policy, reviewed pilot evidence manifest, integrated learner workflow, automated checks and an evaluation report. Current provider confirmations, independent reviewers and observed journeys are explicit external dependencies. Until those exist, an engineering demonstration must retain its evidence limitations.

Specification preparation: inspected repository source, schemas, committed data and evaluation documentation; checked the official TESDA and OSRM references linked above. PhilJobNet's live page returned HTTP 403 during source checking; posting claims here come from the dated committed snapshot. No live database inventory, model benchmark, field validation or application test run was performed for this specification.
