import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { WithCatalog } from '../../components/WithCatalog.tsx'
import { paths } from '../../paths.ts'
import { PathwayStep } from '../finder/PathwayStep.tsx'
import { useFinderStore, type Journey } from '../finder/store.ts'
import { useJourney } from '../finder/useJourney.ts'
import { trainingAddress } from '../training/address.ts'
import { TspReadiness } from './TspReadiness.tsx'

/** The matching journey remains in TSP's compact shell. */
export default function TspJourneyPage() {
  const journey = useFinderStore((state) => state.journey)
  if (!journey) return <Navigate to={paths.tspWebview} replace />
  return (
    <WithCatalog emptyState>
      {(catalog) => <JourneyContent journey={journey} catalog={catalog} />}
    </WithCatalog>
  )
}

function JourneyContent({ journey, catalog }: { journey: Journey; catalog: Qualification[] }) {
  const location = useLocation()
  const navigate = useNavigate()
  const context = useJourney(journey, catalog)
  const choose = useFinderStore((state) => state.choose)
  const stage =
    location.pathname === paths.tspReadiness
      ? 'readiness'
      : location.pathname === paths.tspRecommendation
        ? 'recommendation'
        : 'matches'
  const chosen = context.chosen
  const stageLabel =
    stage === 'matches'
      ? 'Your match'
      : stage === 'readiness'
        ? 'Skills check'
        : 'Your recommendation'
  const progress = stage === 'recommendation' ? 3 : 2

  return (
    <div className="tsp-journey">
      <div className="tsp-progress" aria-label={`Step ${progress} of 3`}>
        <div className="tsp-progress-label">
          <strong>Step {progress} of 3</strong>
          <span>{stageLabel}</span>
        </div>
        <div className="tsp-progress-track">
          <span style={{ width: `${(progress * 100) / 3}%` }} />
        </div>
      </div>
      <div className="tsp-goal-note">
        <span>Your goal</span>
        <strong>{journey.query}</strong>
        <Link to={paths.tspWebview}>Edit</Link>
      </div>

      {stage === 'matches' && (
        <>
          <div className="tsp-section-heading">
            <h1>{context.matches.data?.matches.length ?? 0} matches for you</h1>
            <p>Pick one to see centers or check your skills.</p>
          </div>
          {context.matches.isPending && <p role="status">Finding qualifications…</p>}
          {context.matches.isError && !context.matches.data && (
            <div className="tsp-card">
              <p role="alert">We couldn’t load your matches.</p>
              <button className="tsp-secondary" onClick={() => void context.matches.refetch()}>
                Try again
              </button>
            </div>
          )}
          <div className="tsp-match-list">
            {context.matches.data?.matches.map((match, index) => {
              const catalogQualification = catalog.find(
                (item) => item.code === match.qualification.code,
              )
              const qualification = catalogQualification ?? match.qualification
              return (
                <article
                  key={qualification.code}
                  className={`tsp-card tsp-match-card ${index === 0 ? 'is-best' : ''}`}
                >
                  <div className="tsp-match-meta">
                    <span>{qualification.sector}</span>
                    {index === 0 && <strong>Best match</strong>}
                  </div>
                  <h2>{qualification.name}</h2>
                  <p className="tsp-match-reason">✓ {match.reason}</p>
                  {catalogQualification && catalogQualification.possible_jobs.length > 0 && (
                    <p className="tsp-muted">
                      Jobs: {catalogQualification.possible_jobs.slice(0, 3).join(', ')}
                    </p>
                  )}
                  <div className="tsp-match-actions">
                    <Link
                      className="tsp-primary"
                      to={trainingAddress({ qualifications: [qualification.code] }).replace(
                        paths.training,
                        paths.tspTraining,
                      )}
                    >
                      Find centers
                    </Link>
                    <button
                      className="tsp-secondary"
                      onClick={() => {
                        choose(qualification.code)
                        void navigate(paths.tspReadiness)
                      }}
                    >
                      Am I ready?
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
          {context.matches.data?.matches.length === 0 && (
            <div className="tsp-card">
              <p>No close matches yet. Try another goal or browse the catalog.</p>
              <Link to={paths.tspQualifications}>Browse qualifications</Link>
            </div>
          )}
        </>
      )}

      {stage === 'readiness' &&
        (chosen ? (
          <>
            <div className="tsp-section-heading">
              <p className="tsp-kicker">{chosen.name}</p>
              <h1>Are you ready for the assessment?</h1>
              <p>Rate each skill. About 2 minutes.</p>
            </div>
            <TspReadiness
              qualification={chosen}
              onResult={() => void navigate(paths.tspRecommendation)}
            />
          </>
        ) : (
          <ChooseMatch />
        ))}

      {stage === 'recommendation' &&
        (chosen ? (
          <>
            <h1 className="sr-only">Your recommendation</h1>
            <PathwayStep
              qualification={chosen}
              profile={context.matchedProfile ?? context.profile}
              asked={{ query: journey.query, profile: context.profile }}
            />
          </>
        ) : (
          <ChooseMatch />
        ))}
    </div>
  )
}

function ChooseMatch() {
  return (
    <div className="tsp-card">
      <p>Choose a qualification first to continue.</p>
      <Link className="tsp-primary" to={paths.tspMatches}>
        See matches
      </Link>
    </div>
  )
}
