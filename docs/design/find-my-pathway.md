# Find my pathway

The finder starts with the learner's situation and ends with an actionable next step.
It uses the existing matching and pathway services. Starting-point choices change writing
guidance only; they never infer work experience or certification on the learner's behalf.

| Learner story | Design response |
| --- | --- |
| I am new to a trade and don't know what to write. | Learn a new skill offers plain-language prompts and editable examples. |
| I already do this work and want my skills recognized. | Get my skills recognized prompts for the work, years of experience, and existing certificates. |
| I have interests but no specific job title. | Explore my options accepts activities and workplaces, with a direct route to browse qualifications. |
| I want to understand a recommendation before choosing it. | Match cards explain why each suggestion may fit and provide a direct selection action. |
| I want to know what to do next. | Missing experience and certification questions appear inside the pathway card, followed by a Your next step callout and numbered steps. |
| I want to act on my skills check. | Training and assessment actions open the center finder with the selected qualification and center type. |

## Interaction expectations

- Selecting a starting point preserves the draft and does not call the analysis service.
- Examples fill an editable draft; only Find my matches submits it.
- Results keep the submitted goal visible and collapse its editor to reduce repetition.
- Personal details are available in a disclosure; internal intent labels stay in admin diagnostics.
- Required follow-up questions stay beside the selected qualification. The pathway and skills check appear
  after the missing details are answered; completed answers remain editable in a disclosure in the same card.
- When no qualifications match, the learner explicitly chooses one before a pathway is requested.
- Starting a new goal resets the current questionnaire without deleting saved account records.
- Native buttons, inputs, disclosures, and focus styles support keyboard use. Cards and the roadmap
  adapt to narrow screens. Selection has a check icon as well as a color change.

## Validation

`frontend/tests/test_frontend_states.py` exercises starting-point changes, draft retention,
direct match selection, filtered assessment navigation, no-match recovery, and existing account,
readiness, and navigation behavior without a database.
