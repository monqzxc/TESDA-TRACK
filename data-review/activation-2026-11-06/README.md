# National mapping activation record

The complete US-20 handoff is now `release-reviewed-decisions.json`: 25 dataset
versions, 427 approvals (77 national + 342 PhilJobNet + 8 reviewed IV-A in-demand)
and 11 rejections. It uses portable keys and exact dataset fingerprints rather
than database IDs. Pending proposals are excluded. Follow `docs/us20-setup.md`
and the dry-run-first `tesda_track.labor_market_release` command. The original
national-only record below remains unchanged as a historical review batch.

This portable decision record retains source occurrence and qualification identities,
not database-specific mapping IDs. The user authorized validation and activation of
77 supported national forecast relationships; three trainer-component relationships
remain pending. Original Phase 3/4 research is unchanged.

Imports still default to pending/rejected. Database approval state is not transported
by Git. Review and apply through the existing authorized admin/CLI workflow; see
`docs/validated-demand-activation.md`. Local bootstrap/demo scripts operate only on
the explicitly named isolated preview database. The original DOLE PDF and local TR
PDF evidence must be available for the guarded revalidation command.

Raw source PDFs, HTML captures, duplicate archives, private credentials and local
screenshots/test logs are intentionally kept outside this commit. Retrieve source
PDFs from the recorded official URLs with permitted access before rerunning research
extraction. Dataset build/import scripts can use the prepared text datasets directly.
