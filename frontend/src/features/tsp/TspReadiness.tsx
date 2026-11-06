import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import type { Qualification } from '../../api/queries.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { submitReadiness } from '../finder/api.ts'
import { useFinderStore, type Answer, type Answers } from '../finder/store.ts'

const choices: { value: Answer; label: string }[] = [
  { value: 'confident', label: 'I can do it' },
  { value: 'some_experience', label: 'A little' },
  { value: 'not_familiar', label: 'Not yet' },
]
const EMPTY_ANSWERS: Answers = {}

export function TspReadiness({
  qualification,
  onResult,
}: {
  qualification: Qualification
  onResult: () => void
}) {
  const [index, setIndex] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const answers = useFinderStore((state) => state.answers[qualification.code] ?? EMPTY_ANSWERS)
  const answer = useFinderStore((state) => state.answer)
  const setCheck = useFinderStore((state) => state.setCheck)
  const origin = useFinderStore((state) => state.journey?.origin)
  const skills = qualification.competencies
  const current = skills[index]
  const rated = skills.filter((skill) => answers[skill.id]).length
  const submit = useMutation({
    mutationFn: (sent: Answers) => submitReadiness(qualification.code, sent, null, origin),
    onSuccess: (result, sent) => {
      setCheck(qualification.code, { result, answers: sent, saved: false })
      onResult()
    },
    onError: (error) => setMessage(failureMessage(error)),
  })

  if (!current)
    return (
      <div className="tsp-card tsp-skill-card">
        <p>No skills are listed for this qualification yet. You can still find a center.</p>
      </div>
    )

  const next = () => {
    if (!answers[current.id]) {
      setMessage('Choose an answer or tap Skip.')
      return
    }
    setMessage(null)
    if (index < skills.length - 1) {
      setIndex(index + 1)
      return
    }
    submit.mutate({ ...answers })
  }

  return (
    <div className="tsp-readiness">
      <div className="tsp-skill-progress">
        <span>
          Skill {index + 1} of {skills.length}
        </span>
        <span>{rated} rated</span>
      </div>
      <div className="tsp-progress-track">
        <span style={{ width: `${skills.length ? (rated * 100) / skills.length : 0}%` }} />
      </div>
      <fieldset className="tsp-card tsp-skill-card">
        <legend>{current.name}</legend>
        <div className="tsp-choices" role="group" aria-label={`Rate ${current.name}`}>
          {choices.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={answers[current.id] === value ? 'is-selected' : ''}
              aria-pressed={answers[current.id] === value}
              onClick={() => {
                answer(qualification.code, current.id, value)
                setMessage(null)
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      {message && (
        <p role="alert" className="tsp-error">
          {message}
        </p>
      )}
      <div className="tsp-bottom-actions">
        <button
          type="button"
          className="tsp-secondary"
          onClick={() => {
            if (index > 0) setIndex(index - 1)
            else {
              answer(qualification.code, current.id, 'not_familiar')
              setIndex(Math.min(index + 1, skills.length - 1))
            }
            setMessage(null)
          }}
        >
          {index > 0 ? 'Previous' : 'Skip'}
        </button>
        <button type="button" className="tsp-primary" disabled={submit.isPending} onClick={next}>
          {submit.isPending
            ? 'Checking…'
            : index === skills.length - 1
              ? 'See recommendation'
              : 'Next skill'}
        </button>
      </div>
      <p className="tsp-muted">Self-rated. This is a guide, not an official TESDA assessment.</p>
    </div>
  )
}
