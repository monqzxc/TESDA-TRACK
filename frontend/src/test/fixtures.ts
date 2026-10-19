import type { Qualification, Region } from '../api/queries.ts'

export const bookkeeping: Qualification = {
  code: 'BKP-NCIII',
  name: 'Bookkeeping NC III',
  sector: 'Business and management',
  possible_jobs: ['Bookkeeper'],
  competencies: [{ id: 1, position: 1, name: 'Journalize transactions', category: 'core' }],
}

export const electrical: Qualification = {
  code: 'EIM-NCII',
  name: 'Electrical Installation and Maintenance NC II',
  sector: 'Construction',
  possible_jobs: ['Building wiring electrician'],
  competencies: [],
}

export const ncr: Region = {
  code: 'NCR',
  name: 'National Capital Region',
  center_city: 'Manila',
  latitude: 14.5995,
  longitude: 120.9842,
}
