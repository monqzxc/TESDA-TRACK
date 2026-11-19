# Sample centers for the December 2 demo (US-0017 AC8)

TESDA has not yet approved using its official training-provider and assessment-center lists. The Product Owner decided on
19 November 2026 that the December 2 demo shows a sample of made-up centers, clearly labelled as sample data, instead.

## What learners see with `CENTER_DATA=sample`

- Only the sample centers, everywhere centers appear: the Career Map's list and map, the supply and demand brief and its
  recommendations, the pathway report, nearest centers and travel times. The official records stay in the database,
  untouched, and come back when the setting does.
- Every sample center is named "[Sample] …", has the status **Sample data** with the source "Sample data for the
  December 2 demo. Not an official TESDA list.", and has no contact details.
- The Career Map panel starts with a notice: "Sample centers for the December 2 demo. These are not an official TESDA
  list: names, places and schedules are made up."

With `CENTER_DATA=official` (the default) the sample set is never listed, even if it has been loaded.

## Turn it on for the demo

From `backend/`, against the deployment's database:

```text
python -m tesda_track.sample_centers load            # preview the counts
python -m tesda_track.sample_centers load --commit   # add the sample set
```

Then set `CENTER_DATA=sample` in the API's environment and restart it. Every region gets two sample training
providers, which share the qualifications between them, and one sample assessment center with an upcoming schedule for
every qualification (about 36 providers, 18 centers and 5,700 programs and schedules each). Loading again replaces the
set. The load also embeds the sample programs for semantic ranking when the embedding model is configured.

## Turn it off after the demo

Set `CENTER_DATA=official` (or remove it) and restart the API. To delete the sample set as well, including any
application a learner made to a sample schedule:

```text
python -m tesda_track.sample_centers remove --commit
```

Once TESDA approves the official lists, US-0017 AC1–AC3 (official lists only) apply instead.
