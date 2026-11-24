import { useCopy } from '../../i18n/copy.ts'
import type { Program } from './centers.ts'

/** Keep the sample label beside the scholarship wherever its badge appears. */
export function ScholarshipSampleNote({
  programs,
  qualificationCode,
}: {
  programs: readonly Program[]
  qualificationCode?: string
}) {
  const copy = useCopy()
  const sample = programs.some(
    (program) =>
      program.scholarship_open &&
      program.scholarship_is_sample &&
      (!qualificationCode || program.qualification.code === qualificationCode),
  )
  return sample ? (
    <span className="block text-12 leading-[1.5] font-normal wrap-anywhere text-muted">
      {copy.training.programs.sampleScholarship}
    </span>
  ) : null
}
