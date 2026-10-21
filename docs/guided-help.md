# Guided page help

Select **Help** at the bottom right of any page to start its Driver.js tour. Use Next and Back,
or close the tour with Escape, the close button, or a click outside. Help can replay the tour
at any time. Tours explain controls without submitting forms or changing learner records.

The tour adapts to the current page and skips controls that are missing or hidden. Phone tours
explain the Menu button instead of highlighting the desktop sidebar. The library and its styles
load on the first Help request. Tours respect reduced motion, follow the current theme, restore
focus on exit, and close when the route or account changes.

Implementation lives in `frontend/src/features/help/`:

- `GuidedHelp.tsx` owns the trigger and the active tour's lifetime.
- `startTour.ts` configures Driver.js and imports its CSS plus `tour.css`.
- `tours.ts` maps route page keys to stable selectors and resolves available targets.
- `frontend/src/copy/help.ts` holds fixed tour text, collected under `en.help`.

To extend a tour, add a `data-tour` attribute to an existing DOM element, add its fixed copy,
and register the selector in `tours.ts`. Avoid user-supplied text in popovers: Driver.js parses
their content as HTML. Prefer elements that remain visible in loading, collapsed, and empty
states; tours must never activate actions on the user's behalf.

Run `npm test -- src/features/help/GuidedHelp.test.tsx` and
`npm run e2e -- tests/e2e/help.spec.ts` from `frontend` to verify the feature.
