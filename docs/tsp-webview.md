# TSP WebView entry

Open the TESDA-TRACK frontend at `/tsp/webview` in TSP's mobile WebView. The route is relative to the frontend base path, including `/beta` where that deployment is used.

The webview opens on **Find my path**. The learner enters a goal, answers optional matching questions,
then continues through `/tsp/webview/matches`, `/tsp/webview/readiness`, and
`/tsp/webview/recommendation`. The matching and readiness requests use the same APIs as the full
finder; the work stays in session storage for the current tab. The compact shell also contains
**Qualifications** at `/tsp/webview/qualifications`, **Centers** at `/tsp/webview/training`, and
**Skills** at `/tsp/webview/skills`. Recommendation and match actions open filtered centers inside
the webview.

Example launch URL:

```text
https://<frontend-host>/tsp/webview?learner_id=TSP-42&name=Ana%20Santos&goal=I%20want%20to%20be%20a%20welder&skills=welding%2Cmetal%20fabrication&experience_years=2&has_certification=no&region=VII
```

| Parameter | Meaning |
| --- | --- |
| `learner_id` | Opaque TSP learner reference, shown for confirmation only. |
| `name` | Learner display name, shown for confirmation only. |
| `goal` | Career goal, prefilled for review and sent to goal analysis after submission. |
| `skills` | Comma-separated skills; the parameter may also be repeated. Passed to matching. |
| `experience_years` | Number from 0 to 60. Passed to matching. |
| `has_certification` | `yes`/`no`, `true`/`false`, or `1`/`0`. Passed to matching. |
| `region` | TESDA region code, such as `NCR` or `VII`. Used for later local options. |

## The centers map

**Centers** (`/tsp/webview/training`) shows the same map as Training & Assessment ([docs/center-map.md](center-map.md)).
In TSP's WebView it is drawn by MapLibre where the WebView has WebGL 2 (Android's Chrome WebView; iOS 15 and later),
and by Leaflet otherwise. One finger scrolls the page past the map and two move it, so the learner isn't trapped in
it. The map changes neither the address nor Back and keeps no position. It never asks for the learner's location by
itself: the page asks as it always has (once a visit as it opens, and when the learner turns location on), and the
map's locate button asks again. Learner suggestions, matching and sign-in are unaffected.

## Suggested for you

While the goal box is still empty, the entry page shows up to three qualifications worked out from what TSP
already knows about the learner: the `skills`, `experience_years` and `has_certification` launch hints, plus the
skills on their Skill Passport once TSP has signed them in. It calls `POST /api/v1/analysis/suggestions` with that
profile in the request body; like the rest of `/analysis`, the profile is neither stored nor logged, and no name or
learner reference is ever sent.

A suggestion is not a match: the learner has given no goal, so nothing is phrased as if they had. Reasons read
"From your TSP profile: …" rather than matching's "Matched your words: …", and the response's `basis` lists what
the suggestions were worked out from, shown behind **Why these**. Tapping **See my pathway** puts the
qualification's name in the goal box and sends it through the same goal analysis as a typed goal, so matches,
readiness and recommendation all work from a goal the learner chose.

The section is hidden entirely when there is nothing to suggest from. Experience and certification alone never
trigger it: they say how a learner should train, not what in. It also steps aside as soon as the learner types a
goal of their own, and a failed suggestions request never blocks the goal box.

All parameters are optional, but the learner must provide a goal before continuing. The learner can edit the goal, skills, experience, certification, and region on the entry page. Name and learner ID are never treated as proof of identity or sent to the recommendation API. This route does not sign a learner in or link a TSP record to a TESDA-TRACK account.

The app removes the query string from the browser address after opening, and the existing finder keeps the goal and answers in session storage for the current tab. Because the initial WebView request still contains the URL, TSP should use HTTPS, pass an opaque reference rather than a sensitive identifier, and avoid including phone numbers, email addresses, credentials, or tokens.
