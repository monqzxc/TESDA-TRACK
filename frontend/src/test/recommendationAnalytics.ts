import type { RecommendationAnalytics } from '../features/reports/api.ts'

export const emptyRecommendationAnalytics = {
  feedback_answers: 0,
  accepted: 0,
  rejected: 0,
  acceptance_rate: null,
  qualification_groups: [],
  demand: {
    recent_from: '2026-09-22',
    recent_to: '2026-10-21',
    previous_from: '2026-08-23',
    previous_to: '2026-09-21',
    forecast_from: '2026-10-22',
    forecast_to: '2026-11-20',
    window_days: 30,
    minimum_recent_learners: 10,
    minimum_previous_learners: 5,
    method: 'linear_recent_trend',
    qualifications: [],
  },
  improvement_priorities: [],
} satisfies RecommendationAnalytics

const cookery = { code: 'CKY-NCII', name: 'Cookery NC II', sector: 'Tourism' }
const welding = {
  code: 'SMAW-NCII',
  name: 'Shielded Metal Arc Welding (SMAW) NC II',
  sector: 'Metals and Engineering',
}

export const exampleRecommendationAnalytics = {
  ...emptyRecommendationAnalytics,
  feedback_answers: 16,
  accepted: 9,
  rejected: 7,
  acceptance_rate: 0.5625,
  qualification_groups: [
    {
      qualification: cookery,
      chosen_learners: 15,
      feedback_answers: 12,
      accepted: 6,
      rejected: 6,
      acceptance_rate: 0.5,
    },
    {
      qualification: welding,
      chosen_learners: 2,
      feedback_answers: 4,
      accepted: 3,
      rejected: 1,
      acceptance_rate: 0.75,
    },
  ],
  demand: {
    ...emptyRecommendationAnalytics.demand,
    qualifications: [
      {
        qualification: cookery,
        recent_learners: 15,
        previous_learners: 10,
        change_rate: 0.5,
        projected_learners: 20,
        status: 'available',
      },
      {
        qualification: welding,
        recent_learners: 2,
        previous_learners: 0,
        change_rate: null,
        projected_learners: null,
        status: 'insufficient_volume',
      },
    ],
  },
  improvement_priorities: [
    {
      qualification: cookery,
      model: 'tesda-matching-v4',
      intent: 'train_first',
      feedback_answers: 12,
      accepted: 6,
      rejected: 6,
      acceptance_rate: 0.5,
      wrong_qualification: 4,
      readiness_off: 1,
      pathway_not_helpful: 1,
      no_reason: 0,
      ranking_mismatches: 3,
      priority: 'high',
      recommendation:
        'Review wrong qualification cases and collect consented, expert-labeled examples before model training.',
    },
    {
      qualification: welding,
      model: null,
      intent: 'unsure',
      feedback_answers: 4,
      accepted: 3,
      rejected: 1,
      acceptance_rate: 0.75,
      wrong_qualification: 0,
      readiness_off: 1,
      pathway_not_helpful: 0,
      no_reason: 0,
      ranking_mismatches: 0,
      priority: 'collect_feedback',
      recommendation:
        'Collect more feedback before drawing conclusions; review readiness rules for reported issues.',
    },
  ],
} satisfies RecommendationAnalytics
