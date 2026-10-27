# Public data provenance (TASK-076)

Qualifications, training providers, assessment centers, programs and schedules carry a
`provenance` object in public API responses. Source name, record reference, public source URL,
source date, review date and local record update time are distinct fields. Unknown dates stay
null and appear as **Not recorded**. A database write time is never shown as a source review.

The three labels describe record evidence:

- **Verified data** requires a named source, reference, public URL, source date and actual review date.
- **Incomplete data** means some source or review information is absent. Legacy and registry-imported
  records default to incomplete; importing a workbook does not declare expert review.
- **Example data** identifies development fixtures. Seeded providers, centers, programs and schedules
  have this label and a demonstration notice. Their future intake dates do not imply real availability.

Record provenance does not replace the stricter, qualification-specific service verification,
prerequisite and availability checks. Training details also show existing service source references,
review dates, review expiry and availability observation dates. Public source links accept only HTTP(S);
private workbook references remain text, and a missing link is identified explicitly.

Migration **0018** adds these fields and backfills example labels and available registry source history.
Run migrations before starting the API, then run `python -m tesda_track.seed` from `backend/` to copy
existing qualification seed source metadata into database records. The TR seed records identify their
publisher, download reference and source list; they do not currently contain publication/review dates,
so those dates remain unknown. Existing explicit review metadata is preserved by a normal seed sync.

Administrators can supply source fields through provider, center, program and schedule create/update
APIs. A verified claim requires all evidence fields, future source/review dates are rejected, and a
partial update cannot silently remove evidence from a verified record: change its status to incomplete
when clearing evidence. A newer registry import resets the record to incomplete pending review.

Verification: `backend/tests/test_record_provenance.py` exercises persistence and API behavior.
`DataProvenance.test.tsx` and `ProvenanceScreens.test.tsx` cover labels, safe links, unknown dates,
qualification cards, center details and program listings.
