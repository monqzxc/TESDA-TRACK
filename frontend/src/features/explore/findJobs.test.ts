import { describe, expect, it } from 'vitest'
import { findJobsUrl } from './explore.ts'

// Card 5: the TSP Find Jobs link, from the deployment's address and parameter names.
const config = {
  tsp_find_jobs_url: 'https://tsp.example.ph/find-jobs',
  tsp_find_jobs_skill_param: 'skill',
  tsp_find_jobs_area_param: 'area',
}

describe('findJobsUrl', () => {
  it.each([
    [
      'Cookery NC II',
      'Region VII (Central Visayas)',
      'https://tsp.example.ph/find-jobs?skill=Cookery+NC+II&area=Region+VII+%28Central+Visayas%29',
    ],
    [
      'Shielded Metal Arc Welding (SMAW) NC II',
      'National Capital Region',
      'https://tsp.example.ph/find-jobs?skill=Shielded+Metal+Arc+Welding+%28SMAW%29+NC+II&area=National+Capital+Region',
    ],
    [
      'Bread & Pastry Production NC II',
      'Region IV-A (CALABARZON)',
      'https://tsp.example.ph/find-jobs?skill=Bread+%26+Pastry+Production+NC+II&area=Region+IV-A+%28CALABARZON%29',
    ],
  ])('opens Find Jobs for %s in %s, URL-encoded', (skill, area, expected) => {
    expect(findJobsUrl(config, skill, area)).toBe(expected)
  })

  it('leaves out what was not chosen, down to the general Find Jobs page', () => {
    expect(findJobsUrl(config, 'Cookery NC II', null)).toBe(
      'https://tsp.example.ph/find-jobs?skill=Cookery+NC+II',
    )
    expect(findJobsUrl(config, null, 'National Capital Region')).toBe(
      'https://tsp.example.ph/find-jobs?area=National+Capital+Region',
    )
    expect(findJobsUrl(config, ' ', null)).toBe('https://tsp.example.ph/find-jobs')
  })

  it('uses the parameter names TSP gives, and keeps what the address already has', () => {
    const named = {
      ...config,
      tsp_find_jobs_url: 'https://tsp.example.ph/jobs?src=track',
      tsp_find_jobs_skill_param: 'q',
      tsp_find_jobs_area_param: 'location',
    }
    expect(findJobsUrl(named, 'Cookery NC II', 'Metro Manila')).toBe(
      'https://tsp.example.ph/jobs?src=track&q=Cookery+NC+II&location=Metro+Manila',
    )
  })

  it('gives nothing to open without a usable address', () => {
    expect(findJobsUrl(undefined, 'Cookery NC II', 'Metro Manila')).toBeNull()
    expect(findJobsUrl({ ...config, tsp_find_jobs_url: '' }, 'Cookery NC II', null)).toBeNull()
    expect(
      findJobsUrl({ ...config, tsp_find_jobs_url: 'javascript:alert(1)' }, 'x', null),
    ).toBeNull()
    expect(findJobsUrl({ ...config, tsp_find_jobs_url: 'not a url' }, 'x', null)).toBeNull()
  })
})
