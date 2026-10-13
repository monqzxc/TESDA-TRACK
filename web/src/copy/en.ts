// All interface copy lives here, so a Filipino version can be added later (US-15).
export const en = {
  app: {
    name: 'TESDA-TRACK',
  },
  service: {
    unreachable: "We can't reach the TESDA-TRACK service right now. Please try again shortly.",
  },
  demo: {
    heading: 'Qualifications',
    loading: 'Loading qualifications…',
    count: (n: number) =>
      n === 1 ? '1 qualification in the catalog.' : `${n} qualifications in the catalog.`,
  },
} as const
