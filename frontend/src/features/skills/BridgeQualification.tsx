import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useId, useMemo, useState } from 'react'
import { Button } from 'react-aria-components'
import { Link, useNavigate } from 'react-router'
import { regionsQuery, type Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import { LoadBoundary } from '../../components/LoadBoundary.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
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
import { ui } from './styles.ts'

// The delivery map is Training & Assessment's own, downloaded only when a learner asks for sites.
const CenterMap = lazy(() => import('../training/CenterMap.tsx'))

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
  const en = useCopy()
  const copy = en.skills

  const headingId = useId()
  const Heading = headingLevel === 3 ? 'h3' : 'h4'
  const status = (item.status ?? '').replace(/_/g, ' ')
  const matched = 'terms_matched' in item ? (item.terms_matched ?? []) : []
  const share = 'skill_share' in item ? item.skill_share : null
  const evidence = 'evidence' in item ? (item.evidence ?? []) : []
  return (
    <article aria-labelledby={headingId} className={ui.card}>
      <span className={ui.level}>
        <Icon name="learn" />
        {item.level_label || copy.qualification.fallbackLevel}
      </span>
      <Heading id={headingId} className={ui.cardTitle}>
        {item.title || copy.qualification.fallbackTitle}
      </Heading>
      <p className={ui.muted}>
        {[
          item.code,
          status ? status[0].toUpperCase() + status.slice(1) : copy.qualification.noStatus,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {matched.length > 0 && <p className={ui.text}>{copy.qualification.linkedSkills(matched)}</p>}
      {share !== null && share !== undefined && (
        <p className={ui.muted}>{copy.qualification.share(Math.round(share * 100))}</p>
      )}
      {item.review_due_at && (
        <p className={ui.muted}>{copy.qualification.reviewDue(item.review_due_at)}</p>
      )}
      {evidence.length > 0 && (
        <details className={ui.details}>
          <summary className={ui.summary}>
            <Icon name="checklist" className={ui.summaryIcon} />
            {copy.qualification.evidence}
            <Icon name="chevron" className={ui.chevron} />
          </summary>
          {evidence.map((entry) => (
            <div key={entry.term} className="px-[0.95rem] pb-[0.6rem]">
              <p className={cx(ui.text, 'font-semibold')}>{entry.term}</p>
              <ul className="mt-[0.2rem] mb-0 pl-[1.35rem] text-14 leading-[1.55] text-ink">
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
  const en = useCopy()
  const copy = en.skills

  const local = useMemo(() => localQualification(item, catalog), [item, catalog])
  const [shown, setShown] = useState(false)
  return (
    <details className={ui.details}>
      <summary className={ui.summary}>
        <Icon name="pin" className={ui.summaryIcon} />
        {copy.delivery.heading}
        <Icon name="chevron" className={ui.chevron} />
      </summary>
      <div className="flex flex-col items-start gap-[0.6rem] px-[0.95rem] pb-[0.95rem]">
        {!local ? (
          <p className={ui.note}>
            {copy.delivery.unmapped} <Link to={paths.qualifications}>{en.nav.qualifications}</Link>
          </p>
        ) : (
          <>
            <p className={ui.muted}>{copy.delivery.match(local.name, local.code)}</p>
            {shown ? (
              <DeliverySites code={local.code} />
            ) : (
              <Button className={button()} onPress={() => setShown(true)}>
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
  const en = useCopy()
  const copy = en.skills

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
      <p role="alert" className={ui.note}>
        {(sites.error ?? listings.error)?.message}
      </p>
    )
  }
  if (!centers) {
    return (
      <p role="status" className={ui.muted}>
        {copy.delivery.loading}
      </p>
    )
  }
  if (!centers.length) return <p className={ui.muted}>{copy.delivery.none}</p>

  const open = (centerId?: string) =>
    void navigate(
      `${paths.training}?${writeTrainingAddress({ qualifications: [code], center: centerId ?? null })}`,
    )
  const mapped = centers.some((center) => center.latitude !== null)
  return (
    <>
      <p className={ui.muted}>{copy.delivery.count(centers.length)}</p>
      {mapped ? (
        <LoadBoundary fallback={<p className={ui.note}>{en.training.map.failed}</p>}>
          <Suspense fallback={<p className={ui.muted}>{en.training.map.loading}</p>}>
            <div className="self-stretch [--center-map-height:430px]">
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
        <p className={ui.muted}>{copy.delivery.noMap}</p>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 self-stretch p-0">
        {centers.map((center) => (
          <li key={center.id} className="rounded-10 border border-rule px-3 py-[0.55rem]">
            <p className={ui.text}>
              <strong className="text-navy">{center.name}</strong> · {placeLabel(center)}
            </p>
            <p className={ui.muted}>
              {en.training.kinds[center.kind]} · {summary(center, today)}
            </p>
          </li>
        ))}
      </ul>
      <Button className={button()} onPress={() => open()}>
        {copy.delivery.open}
        <Icon name="arrowRight" />
      </Button>
    </>
  )
}
