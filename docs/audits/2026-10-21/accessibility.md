# React accessibility evidence — 21 October 2026

**Partial automated audit. Manual acceptance remains open on TASK-077.**

The local Chromium suite passed 117 selected browser tests across `shell`, `profile`, `reports`,
`finder`, `training`, `library` and `theme`. Its mocked API uses synthetic accounts and service data.
It checks 390 × 844 and 1280 × 800 layouts, horizontal overflow, axe accessibility rules including
contrast in both themes, keyboard navigation, dialogs, readiness controls, filters and application review.
The keyboard scenarios include account sign-in/out and the goal-to-training journey in the existing suite;
the selected run exercised the latter. They establish automated behavior, not a person's screen-reader experience.

Twelve new cases enlarge text to 200% at 390 px width across six core pages in both themes. This is CSS text
enlargement, **not actual browser zoom**. Home's offscreen sections are visited before measurement because
their layout is deferred until they are near the viewport. These twelve checks passed in the selected run.

Profile captures use the fictional test account `Maria Santos / maria@example.com`:

- [390 px profile](profile-phone.png)
- [Desktop profile](profile-desktop.png)

## Manual checks still required

- Use actual browser zoom at 200% and check every core form and action for clipped text and overflow.
- Complete goal → readiness → application review using only the keyboard, recording visible focus and traps.
- Repeat the journey with one screen reader, recording announcements, labels and error recovery.
- Check contrast and selected/error states visually in both themes, including maps and external content.
- Repeat against the deployed revision, add tester/device/browser/date notes, attach results to TASK-077,
  and obtain staging QA approval.

No manual checks or human approvals are marked complete by this report.
