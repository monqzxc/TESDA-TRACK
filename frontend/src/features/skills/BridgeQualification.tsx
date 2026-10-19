import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useId, useMemo, useState } from 'react'
import { Button } from 'react-aria-components'
import { Link, useNavigate } from 'react-router'
import { regionsQuery, type Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import { LoadBoundary } from '../../components/LoadBoundary.tsx'
import { en } from '../../copy/en.ts'
import { paths } from '../../paths.ts'
import buttons from '../../styles/buttons.module.css'
import { clientConfigQuery, listingsQuery, sitesQuery } from '../training/api.ts'
import { writeTrainingAddress } from '../training/address.ts'
import {
  buildCenters,
  filterCenters,
  philippineDay,
  placeLabel,
  sortCenters,
  summary,
  withDistances,
} from '../training/centers.ts'
import { useTrainingStore } from '../training/state.ts'
import type { BridgeQualification as Item, Standard } from './api.ts'
import { localQualification } from './local.ts'
import styles from './SkillsPage.module.css'

// The delivery map is Training & Assessment's own, downloaded only when a learner asks for sites.
const CenterMap = lazy(() => import('../training/CenterMap.tsx'))

const copy = en.skills

/**
 * A qualification from Skills Bridge (classic/skills_bridge_view.py _qualification): its level, title, code and
 * status, the input skills it links to, and where TESDA Track lists training and assessment for it.
 */
export function BridgeQualification({
  item,
  catalog,
  headingLevel,
}: {
  item: Item | Standard
  catalog: readonly Qualification[]
  /** One below the section the card sits in. */
  headingLevel: 3 | 4
}) {
  const headingId = useId()
  const Heading = headingLevel === 3 ? 'h3' : 'h4'
  const status = (item.status ?? '').replace(/_/g, ' ')
  const matched = 'terms_matched' in item ? (item.terms_matched ?? []) : []
  const share = 'skill_share' in item ? item.skill_share : null
  const evidence = 'evidence' in item ? (item.evidence ?? []) : []
  return (
    <article aria-labelledby={headingId} className={styles.card}>
      <span className={styles.level}>
        <Icon name="learn" />
        {item.level_label || copy.qualification.fallbackLevel}
      </span>
      <Heading id={headingId} className={styles.cardTitle}>
        {item.title || copy.qualification.fallbackTitle}
      </Heading>
      <p className={styles.muted}>
        {[
          item.code,
          status ? status[0].toUpperCase() + status.slice(1) : copy.qualification.noStatus,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {matched.length > 0 && (
        <p className={styles.text}>{copy.qualification.linkedSkills(matched)}</p>
      )}
      {share !== null && share !== undefined && (
        <p className={styles.muted}>{copy.qualification.share(Math.round(share * 100))}</p>
      )}
      {item.review_due_at && (
        <p className={styles.muted}>{copy.qualification.reviewDue(item.review_due_at)}</p>
      )}
      {evidence.length > 0 && (
        <details className={styles.details}>
          <summary>
            <Icon name="checklist" />
            {copy.qualification.evidence}
            <Icon name="chevron" className={styles.chevron} />
          </summary>
          {evidence.map((entry) => (
            <div key={entry.term} className={styles.evidence}>
              <p className={styles.text}>{entry.term}</p>
              <ul>
                {(entry.skills ?? []).map((skill) => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
      <DeliveryOptions item={item} catalog={catalog} />
    </article>
  )
}

/** Where TESDA Track lists the qualification, once the learner asks: a local catalog match is needed first. */
function DeliveryOptions({
  item,
  catalog,
}: {
  item: Item | Standard
  catalog: readonly Qualification[]
}) {
  const local = useMemo(() => localQualification(item, catalog), [item, catalog])
  const [shown, setShown] = useState(false)
  return (
    <details className={styles.details}>
      <summary>
        <Icon name="pin" />
        {copy.delivery.heading}
        <Icon name="chevron" className={styles.chevron} />
      </summary>
      <div className={styles.delivery}>
        {!local ? (
          <p className={styles.note}>
            {copy.delivery.unmapped} <Link to={paths.qualifications}>{en.nav.qualifications}</Link>
          </p>
        ) : (
          <>
            <p className={styles.muted}>{copy.delivery.match(local.name, local.code)}</p>
            {shown ? (
              <DeliverySites code={local.code} />
            ) : (
              <Button className={buttons.button} onPress={() => setShown(true)}>
                <Icon name="search" />
                {copy.delivery.show}
              </Button>
            )}
          </>
        )}
      </div>
    </details>
  )
}

/** The centers listing the qualification, on the map and as a list, each opening in Training & Assessment. */
function DeliverySites({ code }: { code: string }) {
  const navigate = useNavigate()
  const sites = useQuery(sitesQuery)
  const listings = useQuery(listingsQuery([code]))
  const regions = useQuery(regionsQuery)
  const config = useQuery(clientConfigQuery)
  const location = useTrainingStore((state) => (state.useLocation ? state.location : null))
  const saved = useTrainingStore((state) => state.saved)
  const locating = useTrainingStore((state) => state.locating)
  const today = philippineDay(new Date())

  const centers = useMemo(() => {
    if (!sites.data || !listings.data) return null
    const regionMap = new Map((regions.data ?? []).map((region) => [region.code, region]))
    const all = buildCenters(
      sites.data.providers,
      sites.data.assessmentSites,
      listings.data.programs,
      listings.data.schedules,
      regionMap,
    )
    const offering = filterCenters(all, { qualificationCodes: [code] }, today)
    return sortCenters(withDistances(offering, location), location ? 'nearest' : 'name', today)
  }, [sites.data, listings.data, regions.data, code, today, location])

  if (sites.isError || listings.isError) {
    return (
      <p role="alert" className={styles.note}>
        {(sites.error ?? listings.error)?.message}
      </p>
    )
  }
  if (!centers) {
    return (
      <p role="status" className={styles.muted}>
        {copy.delivery.loading}
      </p>
    )
  }
  if (!centers.length) return <p className={styles.muted}>{copy.delivery.none}</p>

  const open = (centerId?: string) =>
    void navigate(
      `${paths.training}?${writeTrainingAddress({ qualifications: [code], center: centerId ?? null })}`,
    )
  const mapped = centers.some((center) => center.latitude !== null)
  return (
    <>
      <p className={styles.muted}>{copy.delivery.count(centers.length)}</p>
      {mapped ? (
        <LoadBoundary fallback={<p className={styles.note}>{en.training.map.failed}</p>}>
          <Suspense fallback={<p className={styles.muted}>{en.training.map.loading}</p>}>
            <div className={styles.map}>
              <CenterMap
                centers={centers}
                selectedId={null}
                focus={0}
                reference={location ? { ...location, label: 'you', mine: true } : null}
                route={null}
                travelMode="car"
                onTravelMode={() => {}}
                canRoute={false}
                saved={saved}
                cartoKey={config.data?.carto_key ?? ''}
                today={today}
                locating={locating}
                onPick={() => {}}
                onDetails={open}
                onRoute={open}
                onToggleSaved={(id) => useTrainingStore.getState().toggleSaved(id)}
                onLocate={() => useTrainingStore.getState().locate()}
              />
            </div>
          </Suspense>
        </LoadBoundary>
      ) : (
        <p className={styles.muted}>{copy.delivery.noMap}</p>
      )}
      <ul className={styles.sites}>
        {centers.map((center) => (
          <li key={center.id}>
            <p className={styles.text}>
              <strong>{center.name}</strong> · {placeLabel(center)}
            </p>
            <p className={styles.muted}>
              {en.training.kinds[center.kind]} · {summary(center, today)}
            </p>
          </li>
        ))}
      </ul>
      <Button className={buttons.button} onPress={() => open()}>
        {copy.delivery.open}
        <Icon name="arrowRight" />
      </Button>
    </>
  )
}
