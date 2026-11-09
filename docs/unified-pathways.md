# Unified Find My Pathways

The regular finder and TSP now accept goals, occupation titles, skills and skill lists through their existing input journey. The regular finder has one field instead of goal/skills tabs.

`POST /api/v1/analysis/goal` accepts optional `interpret_input: true` and then returns `matching_mode`. Short labels and lists use the existing skills matcher; contextual prose and negation use the existing goal matcher. The frontend keeps that concrete mode in its journey and passes it unchanged to matches, reports and feedback. No score-based routing, new scoring weights, model training, schema migration or catalog changes are involved. Legacy requests omit the flag and retain their response shape; saved journeys retain their explicit mode or the existing goal default.

Existing structured-assessment requests and the explicit goal/skills matching API are unchanged. Skills searches retain the existing no-auto-save policy; career-goal sessions keep account ownership and retry checks. The session-storage format and legacy drafts remain intact.

`FinalCareerOptions` composes scored alternatives and the selected qualification separately from catalog associations. It reuses `occupations.ts` and `RelatedOccupations` to show jobs from the selected qualification's `possible_jobs`, Core competencies, qualification-specific readiness links, and filtered Training Center Finder links. TSP uses its own readiness and training routes. No labor market labels or data are added; future occupation evidence can be added to this presentation independently of qualification scoring.

This iteration uses deterministic input interpretation, not an LLM classifier. Ambiguous or unsupported phrasing can still require rewording. New interface copy currently falls back to English where translations are unavailable. Comprehensive regression and relevance evaluation were deferred for the review iteration; older UI tests that assert the removed tabs or former occupation placement will need updated expectations in the follow-up test pass.

Local review on 5 November 2026: frontend type-check/build, focused interpreter/legacy-shape checks, real API matching smoke, a unified-input axe scan, and actual regular/TSP browser journeys through readiness and final recommendations. Both mobile journeys had no horizontal overflow; qualification-filtered center navigation worked. Preview uses existing v3 embeddings with semantic search enabled only in the local API process; `.env` is unchanged. No production data or schema was changed.
