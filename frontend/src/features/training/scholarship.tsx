import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'

/** What a program says about its scholarship, as the API worked it out (US-0019). */
interface ScholarshipFacts {
  scholarship_open: boolean
  scholarship_is_sample?: boolean
}

/**
 * A scholarship is shown as open only while the API says so: one is listed and its close date, in Philippine time,
 * hasn't passed. Once it closes, nothing is shown.
 */
export const scholarshipOpen = (program: ScholarshipFacts) => program.scholarship_open

/** Shown wherever an open scholarship is, while any of them is the December 2 demo's sample data. */
export const sampleScholarship = (program: ScholarshipFacts) =>
  program.scholarship_open && Boolean(program.scholarship_is_sample)

/** The line that says the scholarship information is sample data for the demo. */
export function SampleScholarshipNote({ className }: { className?: string }) {
  const en = useCopy()
  return (
    <span className={cx('text-12 leading-[1.4] font-semibold text-muted', className)}>
      {en.training.programs.scholarshipSample}
    </span>
  )
}
