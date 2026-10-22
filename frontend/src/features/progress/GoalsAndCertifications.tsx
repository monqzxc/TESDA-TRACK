import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Button, FieldError, Input, Label, TextField } from 'react-aria-components'
import type { Qualification } from '../../api/queries.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { throwWithoutData } from '../../components/QueryBoundary.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import {
  achieveGoal,
  addCertification,
  addGoal,
  certificationsQuery,
  goalsQuery,
  progressKeys,
  type Certification,
  type Goal,
} from './api.ts'
import { ui } from './styles.ts'

const NONE = 'none'

/** The add forms, under each list. */
const addForm = 'mt-4 flex flex-col gap-3 border-t border-border pt-4'
const input =
  'min-h-11.5 w-full rounded-12 border border-hover-border bg-surface px-[0.8rem] py-[0.55rem] text-16 text-navy placeholder:text-muted placeholder:opacity-100 data-focused:border-blue data-invalid:border-warn-ink'

/** The catalog as options for an optional qualification, "None" first. */
function qualificationOptions(catalog: readonly Qualification[], none: string) {
  return [
    { id: NONE, label: none },
    ...catalog.map((qualification) => ({ id: qualification.code, label: qualification.name })),
  ]
}

/** The learner's goals, Mark achieved for the active ones, and a form to add one (classic/app.py show_goals). */
export function Goals({ catalog }: { catalog: readonly Qualification[] }) {
  const en = useCopy()
  const copy = en.progress

  const goals = useQuery({ ...goalsQuery, throwOnError: throwWithoutData })
  const queryClient = useQueryClient()
  const headingId = useId()
  const achieve = useMutation({
    mutationFn: achieveGoal,
    onSuccess: (updated) =>
      queryClient.setQueryData<Goal[]>(progressKeys.goals, (current) =>
        current?.map((goal) => (goal.id === updated.id ? updated : goal)),
      ),
  })

  return (
    <section data-tour="progress-goals" aria-labelledby={headingId} className={ui.card}>
      <h2 id={headingId} className={ui.sectionHeading}>
        {copy.goals.heading}
      </h2>
      {goals.data && goals.data.length === 0 && <p className={ui.empty}>{copy.goals.empty}</p>}
      <ul className={ui.records}>
        {goals.data?.map((goal) => (
          <li key={goal.id} className={ui.record}>
            <div className={ui.recordBody}>
              <p className={ui.recordTitle}>{goal.title}</p>
              <p className={ui.muted}>
                {copy.goals.statuses[goal.status]}
                {goal.target_qualification ? ` · ${goal.target_qualification.name}` : ''}
              </p>
            </div>
            {goal.status === 'active' && (
              <Button
                className={button({ variant: 'tertiary' })}
                aria-label={`${copy.goals.achieve}: ${goal.title}`}
                isPending={achieve.isPending && achieve.variables === goal.id}
                onPress={() => achieve.mutate(goal.id)}
              >
                {copy.goals.achieve}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {achieve.isError && (
        <p role="alert" className={ui.note}>
          {failureMessage(achieve.error)}
        </p>
      )}
      <AddGoal catalog={catalog} />
    </section>
  )
}

function AddGoal({ catalog }: { catalog: readonly Qualification[] }) {
  const en = useCopy()
  const copy = en.progress

  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState<string>(NONE)
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const add = useMutation({
    mutationFn: () => addGoal(title.trim(), target === NONE ? null : target),
    onSuccess: (goal) => {
      queryClient.setQueryData<Goal[]>(progressKeys.goals, (current) => [...(current ?? []), goal])
      setTitle('')
      setTarget(NONE)
    },
    onError: (failure) => setError(failureMessage(failure)),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) {
      setError(copy.goals.missing)
      field.current?.focus()
      return
    }
    setError(null)
    add.mutate()
  }
  return (
    <form className={addForm} onSubmit={submit} noValidate aria-label={copy.goals.add}>
      <TextField
        className="flex flex-col gap-[0.35rem]"
        value={title}
        onChange={(value) => {
          setTitle(value)
          setError(null)
        }}
        isInvalid={error !== null}
        validationBehavior="aria"
        maxLength={200}
      >
        <Label className="text-15 font-semibold text-navy">{copy.goals.title}</Label>
        <Input ref={field} className={input} placeholder={copy.goals.titlePlaceholder} />
        <FieldError className="text-14 font-semibold text-warn-ink">{error}</FieldError>
      </TextField>
      <SelectField
        label={copy.goals.target}
        options={qualificationOptions(catalog, copy.goals.none)}
        value={target}
        onChange={setTarget}
      />
      <Button type="submit" className={cx(button(), 'self-start')} isPending={add.isPending}>
        {add.isPending ? copy.saving : copy.goals.submit}
      </Button>
    </form>
  )
}

/** The learner's certifications, and a form to add one (classic/app.py show_certifications). */
export function Certifications({ catalog }: { catalog: readonly Qualification[] }) {
  const en = useCopy()
  const copy = en.progress

  const certifications = useQuery({ ...certificationsQuery, throwOnError: throwWithoutData })
  const headingId = useId()
  return (
    <section data-tour="progress-certifications" aria-labelledby={headingId} className={ui.card}>
      <h2 id={headingId} className={ui.sectionHeading}>
        {copy.certifications.heading}
      </h2>
      {certifications.data && certifications.data.length === 0 && (
        <p className={ui.empty}>{copy.certifications.empty}</p>
      )}
      <ul className={ui.records}>
        {certifications.data?.map((certification) => (
          <li key={certification.id} className={ui.record}>
            <div className={ui.recordBody}>
              <p className={ui.recordTitle}>{certification.title}</p>
              <p className={ui.muted}>
                {[
                  certification.issuing_body,
                  // Self-reported unless TESDA's records confirm it (US-12).
                  certification.verified
                    ? copy.certifications.verified
                    : copy.certifications.selfReported,
                  ...(certification.certificate_number
                    ? [copy.certifications.number(certification.certificate_number)]
                    : []),
                ].join(' · ')}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <AddCertification catalog={catalog} />
    </section>
  )
}

function AddCertification({ catalog }: { catalog: readonly Qualification[] }) {
  const en = useCopy()
  const copy = en.progress

  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [qualification, setQualification] = useState<string>(NONE)
  const [number, setNumber] = useState('')
  const [issuedOn, setIssuedOn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const add = useMutation({
    mutationFn: () =>
      addCertification({
        title: title.trim(),
        qualificationCode: qualification === NONE ? null : qualification,
        certificateNumber: number.trim() || null,
        issuedOn: issuedOn || null,
      }),
    onSuccess: (certification) => {
      queryClient.setQueryData<Certification[]>(progressKeys.certifications, (current) => [
        ...(current ?? []),
        certification,
      ])
      setTitle('')
      setQualification(NONE)
      setNumber('')
      setIssuedOn('')
    },
    onError: (failure) => setError(failureMessage(failure)),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) {
      setError(copy.certifications.missing)
      field.current?.focus()
      return
    }
    setError(null)
    add.mutate()
  }
  return (
    <form className={addForm} onSubmit={submit} noValidate aria-label={copy.certifications.add}>
      <TextField
        className="flex flex-col gap-[0.35rem]"
        value={title}
        onChange={(value) => {
          setTitle(value)
          setError(null)
        }}
        isInvalid={error !== null}
        validationBehavior="aria"
        maxLength={200}
      >
        <Label className="text-15 font-semibold text-navy">{copy.certifications.title}</Label>
        <Input ref={field} className={input} placeholder={copy.certifications.titlePlaceholder} />
        <FieldError className="text-14 font-semibold text-warn-ink">{error}</FieldError>
      </TextField>
      <SelectField
        label={copy.certifications.qualification}
        options={qualificationOptions(catalog, copy.goals.none)}
        value={qualification}
        onChange={setQualification}
      />
      <TextField
        className="flex flex-col gap-[0.35rem]"
        value={number}
        onChange={setNumber}
        maxLength={100}
      >
        <Label className="text-15 font-semibold text-navy">
          {copy.certifications.certificateNumber}
        </Label>
        <Input className={input} />
      </TextField>
      <TextField
        className="flex flex-col gap-[0.35rem]"
        value={issuedOn}
        onChange={setIssuedOn}
        type="date"
      >
        <Label className="text-15 font-semibold text-navy">{copy.certifications.issuedOn}</Label>
        <Input className={input} />
      </TextField>
      <Button type="submit" className={cx(button(), 'self-start')} isPending={add.isPending}>
        {add.isPending ? copy.saving : copy.certifications.submit}
      </Button>
    </form>
  )
}
