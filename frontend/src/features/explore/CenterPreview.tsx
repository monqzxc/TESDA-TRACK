import {
  Button,
  Dialog,
  DialogTrigger,
  Popover,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from 'react-aria-components'
import { FoldedProvenance } from '../../components/DataProvenance.tsx'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { CenterSuggestionFeedback } from '../suggestion-feedback/CenterSuggestionFeedback.tsx'
import type { ClientConfig } from '../training/api.ts'
import { googleMapsDirections, RoutePanel } from '../training/CenterDetail.tsx'
import { placeLabel, type Center, type Point } from '../training/centers.ts'
import { TripMeta, useCenterDetails } from './Panels.tsx'
import { useExploreStore } from './useExplore.ts'

// A center opened from the skills list (the UI/UX team's preview, 2026-11-27): a photo across the top with Close and a
// flag to raise a concern, its name and trip, then two tabs: Overview (the center's information and the travel time)
// and Qualifications (everything it lists, the learner's matches first). Small type, like the list beside it.

/** The header's look per kind of center while no photo of it is on record: a drawn sample image. */
const sample = {
  training: 'from-[#dbe7fb] via-[#eaf1fd] to-[#c9daf8] text-blue',
  assessment: 'from-[#d5efe9] via-[#e8f6f2] to-[#c2e6dd] text-teal',
} as const
const kindLabel = {
  training: 'text-blue',
  assessment: 'text-teal',
} as const

const roundButton =
  'grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-surface/95 text-navy shadow-[0_2px_8px_rgb(var(--track-shadow-rgb)/0.18)] data-hovered:bg-surface data-focus-visible:outline-3 data-focus-visible:outline-focus'
const sectionHeading = 'm-0 flex items-center gap-1.5 text-12 font-bold text-navy'
const tab =
  'relative flex min-h-10 flex-1 cursor-pointer items-center justify-center text-13 font-semibold text-muted outline-none data-hovered:text-navy data-selected:text-navy data-focus-visible:outline-3 data-focus-visible:-outline-offset-3 data-focus-visible:outline-focus'

function SampleImage({ center }: { center: Center }) {
  const copy = useCopy().explore.preview
  return (
    <div
      role="img"
      aria-label={copy.sampleImage}
      className={cx(
        'relative grid h-36 place-items-center overflow-hidden bg-gradient-to-br',
        sample[center.kind],
      )}
    >
      {/* A simple building: roof, walls and windows, in the kind's color. */}
      <svg aria-hidden="true" viewBox="0 0 160 90" className="h-24 w-auto opacity-80">
        <path d="M20 40 80 12l60 28" fill="none" stroke="currentColor" strokeWidth="4" />
        <rect
          x="30"
          y="40"
          width="100"
          height="44"
          rx="3"
          fill="currentColor"
          fillOpacity="0.14"
          stroke="currentColor"
          strokeWidth="3"
        />
        {[44, 66, 94, 116].map((x) => (
          <rect key={x} x={x - 6} y="50" width="12" height="10" rx="1.5" fill="currentColor" />
        ))}
        <rect x="72" y="62" width="16" height="22" rx="2" fill="currentColor" />
        <circle cx="80" cy="30" r="5" fill="currentColor" />
      </svg>
      <span className="absolute bottom-2 left-3 rounded-full bg-surface/85 px-2 py-0.5 text-11 font-semibold text-muted">
        {copy.sampleImage}
      </span>
    </div>
  )
}

/** The flag over the photo: a popover with the report form (reason, then Send report). */
function ConcernFlag({ center, code }: { center: Center; code: string | null }) {
  const copy = useCopy().explore.preview
  const search = useExploreStore((state) => state.search)
  return (
    <DialogTrigger>
      <Button aria-label={copy.flag} className={roundButton}>
        <Icon name="flag" size="1rem" />
      </Button>
      <Popover
        placement="bottom end"
        className="w-[300px] max-w-[calc(100vw-24px)] rounded-12 bg-surface p-3 shadow-[0_10px_28px_rgb(var(--track-shadow-rgb)/0.24)]"
      >
        <Dialog aria-label={copy.flag} className="outline-none">
          {({ close }) => (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-12 leading-[1.45] text-muted">{copy.flagHint}</p>
              <CenterSuggestionFeedback
                center={center}
                qualificationCode={code ?? undefined}
                goal={search?.chosen ? undefined : search?.query}
                scope={search?.feedbackScope}
                compact="report"
                onCancel={close}
              />
            </div>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  )
}

export function CenterPreview({
  center,
  code,
  codes,
  canRoute,
  routeFrom,
  config,
  onClose,
  onRoute,
  onHideRoute,
  className,
}: {
  center: Center
  /** The qualification it was opened for; from the map, none. */
  code: string | null
  codes: ReadonlySet<string>
  canRoute: boolean
  /** The learner's location, when routes can be loaded from it. */
  routeFrom: Point | null
  config: ClientConfig | undefined
  onClose: () => void
  onRoute: () => void
  onHideRoute: () => void
  className?: string
}) {
  const en = useCopy()
  const copy = en.explore.preview
  const card = en.explore.card
  const { openPathway, listedFor, matches, readiness, point, scholarship, contacts } =
    useCenterDetails(center, code, codes)
  const routed = Boolean(routeFrom && point && config?.routing_enabled)
  const directions = cx(button({ variant: 'primary', height: 38, text: 13 }), 'w-full')

  return (
    <article
      aria-label={center.name}
      className={cx(
        'flex min-h-0 flex-col overflow-hidden rounded-16 border border-border bg-surface',
        className,
      )}
    >
      <div className="relative flex-none">
        <SampleImage center={center} />
        <Button
          aria-label={copy.close}
          onPress={onClose}
          className={cx(roundButton, 'absolute top-3 left-3')}
        >
          <Icon name="close" size="1rem" />
        </Button>
        <div className="absolute top-3 right-3">
          <ConcernFlag center={center} code={code} />
        </div>
      </div>

      <div className="flex-none px-4 pt-3">
        <p
          className={cx(
            'm-0 text-11 font-bold tracking-[0.06em] uppercase',
            kindLabel[center.kind],
          )}
        >
          {center.kind === 'training' ? card.training : card.assessment}
        </p>
        <h2 className="m-0 mt-0.5 text-16 leading-[1.3] font-bold wrap-anywhere text-navy">
          {center.name}
        </h2>
        <TripMeta center={center} className="text-12 text-muted" />
      </div>

      <Tabs className="flex min-h-0 flex-1 flex-col">
        <TabList aria-label={copy.tabs} className="mx-4 mt-2 flex flex-none border-b border-rule">
          {(['overview', 'qualifications'] as const).map((id) => (
            <Tab key={id} id={id} className={tab}>
              {({ isSelected }) => (
                <>
                  {id === 'overview' ? copy.overview : copy.qualifications(listedFor.length)}
                  <span
                    aria-hidden="true"
                    className={cx(
                      'absolute inset-x-3 -bottom-px h-0.5 rounded-full',
                      isSelected ? 'bg-navy' : 'bg-transparent',
                    )}
                  />
                </>
              )}
            </Tab>
          ))}
        </TabList>

        <TabPanel
          id="overview"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-3 outline-none"
        >
          <section className="flex flex-col gap-2">
            <h3 className={sectionHeading}>
              <Icon name="info" />
              {copy.information}
            </h3>
            {(center.kind === 'assessment' || scholarship) && (
              <p className="m-0 text-12 font-semibold text-good-ink">
                {center.kind === 'assessment' ? card.leadsToNc : en.explore.results.scholarship}
              </p>
            )}
            <p className="m-0 flex items-start gap-2 text-12 leading-[1.5] text-ink">
              <Icon name="pin" className="mt-0.5 flex-none text-muted" label={card.address} />
              {center.address || placeLabel(center)}
            </p>
            {contacts.map((contact) => (
              <a
                key={contact.key}
                href={contact.href}
                {...(contact.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                className="flex items-start gap-2 text-12 leading-[1.5] font-semibold wrap-anywhere text-blue no-underline hover:underline focus-visible:outline-3 focus-visible:outline-focus"
              >
                <Icon name={contact.icon} className="mt-0.5 flex-none" label={contact.label} />
                {contact.value}
              </a>
            ))}
            <FoldedProvenance value={center.provenance} />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className={sectionHeading}>
              <Icon name="route" />
              {copy.travel}
            </h3>
            {routed && routeFrom && point ? (
              <div className="rounded-12 bg-panel p-2.5 text-12">
                <RoutePanel from={routeFrom} to={point} explainEstimate />
              </div>
            ) : center.distanceKm !== null ? (
              <p className="m-0 text-12 leading-[1.5] text-muted">{en.explore.notes.times}</p>
            ) : (
              <p className="m-0 text-12 leading-[1.5] text-muted">{copy.noTravel}</p>
            )}
            {/* Directions hand off to Google Maps in a new tab (US-0001 AC3); the drawn route is its own button. */}
            {point && (
              <a
                className={directions}
                href={googleMapsDirections(point)}
                target="_blank"
                rel="noopener noreferrer"
                title={en.training.center.googleMapsHelp}
              >
                <Icon name="directions" />
                {card.directions}
              </a>
            )}
            {point && canRoute && config?.routing_enabled && (
              <Button
                className={cx(button({ variant: 'secondary', height: 38, text: 13 }), 'w-full')}
                onPress={routed ? onHideRoute : onRoute}
              >
                <Icon name={routed ? 'close' : 'route'} />
                {routed ? card.hideRoute : card.route}
              </Button>
            )}
          </section>
        </TabPanel>

        <TabPanel
          id="qualifications"
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3 outline-none"
        >
          {listedFor.length ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {listedFor.map((qualification) => (
                <li
                  key={qualification.code}
                  className={cx(
                    'flex items-center gap-2 rounded-10 px-2.5 py-2 text-12 leading-[1.4] font-semibold',
                    matches(qualification) ? 'bg-tint text-blue' : 'bg-soft text-navy',
                  )}
                >
                  <Icon
                    name={matches(qualification) ? 'check' : 'book'}
                    className="flex-none"
                    label={matches(qualification) ? card.matchesSearch : undefined}
                  />
                  <span className="min-w-0 wrap-anywhere">{qualification.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-12 text-muted">{copy.noQualifications}</p>
          )}
          {readiness && openPathway && (
            <Button
              onPress={() => openPathway(readiness.code)}
              className={cx(button({ variant: 'secondary', height: 38, text: 13 }), 'w-full')}
            >
              <Icon name="checklist" />
              {card.readiness}
            </Button>
          )}
        </TabPanel>
      </Tabs>
    </article>
  )
}
