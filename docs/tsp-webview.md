# TSP WebView entry

Open the TESDA-TRACK frontend at `/tsp/webview` in TSP's mobile WebView. The route is relative to the frontend base path, including `/beta` where that deployment is used.

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

All parameters are optional, but the learner must provide a goal before continuing. The learner can edit the goal, skills, experience, certification, and region on the entry page. Name and learner ID are never treated as proof of identity or sent to the recommendation API. This route does not sign a learner in or link a TSP record to a TESDA-TRACK account.

The app removes the query string from the browser address after opening, and the existing finder keeps the goal and answers in session storage for the current tab. Because the initial WebView request still contains the URL, TSP should use HTTPS, pass an opaque reference rather than a sensitive identifier, and avoid including phone numbers, email addresses, credentials, or tokens.
