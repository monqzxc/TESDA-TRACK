import { Button } from 'react-aria-components'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'

const CATEGORIES: Record<string, { title: string; description: string; icon: IconName }> = {
  'catalog:read': {
    title: 'Catalog & services',
    description: 'Look up qualifications, training and regional supply.',
    icon: 'book',
  },
  'recommend:run': {
    title: 'Recommendations',
    description: 'Match learner goals and plan their next steps.',
    icon: 'compass',
  },
  'reports:read': {
    title: 'Demand insights',
    description: 'Read aggregate qualification demand.',
    icon: 'growth',
  },
}

const TOOLS: Record<string, { title: string; description: string }> = {
  match_qualifications: {
    title: 'Match qualifications',
    description: 'Find qualifications that fit a learner’s goals.',
  },
  get_qualification: {
    title: 'View qualification details',
    description: 'Read a qualification and its competencies.',
  },
  recommend_route: {
    title: 'Recommend a pathway',
    description: 'Suggest the next training or assessment step.',
  },
  check_readiness: {
    title: 'Check assessment readiness',
    description: 'Review readiness using competency self-ratings.',
  },
  rank_training_programs: {
    title: 'Rank training programs',
    description: 'Compare training options for a learner.',
  },
  rank_assessment_schedules: {
    title: 'Rank assessment schedules',
    description: 'Compare available assessment options.',
  },
  search_training_programs: {
    title: 'Search training programs',
    description: 'Find listed training programs and providers.',
  },
  get_regional_supply: {
    title: 'View regional supply',
    description: 'Explore training and assessment capacity by region.',
  },
  get_qualification_demand: {
    title: 'View qualification demand',
    description: 'Review aggregate learner interest and outcomes.',
  },
}

export const toolTitle = (name: string) => TOOLS[name]?.title ?? name.replaceAll('_', ' ')

export function McpToolSelector({
  tools,
  selected,
  onChange,
  disabled = false,
}: {
  tools: Record<string, string>
  selected: string[]
  onChange: (selected: string[]) => void
  disabled?: boolean
}) {
  const names = Object.keys(tools)
  const scopes = [...new Set(Object.values(tools))]
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" disabled={disabled}>
      <legend className="mb-1 text-18 font-semibold text-navy">Expected tools</legend>
      <p className="mt-0 text-14 text-muted">
        Choose what this partner plans to use. Access is calculated automatically.
      </p>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span
          className="rounded-full bg-tint px-3 py-1 text-13 font-semibold text-blue"
          aria-live="polite"
        >
          {selected.length} of {names.length} selected
        </span>
        <div className="flex gap-1">
          <Button
            className={button({ variant: 'tertiary', text: 13, height: 44 })}
            isDisabled={disabled || names.length === 0 || selected.length === names.length}
            onPress={() => onChange(names)}
          >
            Select all tools
          </Button>
          <Button
            className={button({ variant: 'tertiary', text: 13, height: 44 })}
            isDisabled={disabled || selected.length === 0}
            onPress={() => onChange([])}
          >
            Clear selection
          </Button>
        </div>
      </div>
      <div className="grid gap-4">
        {scopes.map((scope) => {
          const category = CATEGORIES[scope] ?? {
            title: scope,
            description: 'Available partner tools.',
            icon: 'network' as const,
          }
          const members = names.filter((name) => tools[name] === scope)
          const count = members.filter((name) => selected.includes(name)).length
          const allSelected = count === members.length
          return (
            <section
              key={scope}
              className="min-w-0 overflow-hidden rounded-14 border border-border bg-surface"
              aria-label={category.title}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-soft px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="mt-1 text-blue">
                    <Icon name={category.icon} />
                  </span>
                  <div>
                    <h4 className="mb-0 text-15 font-semibold text-navy">
                      {category.title}{' '}
                      <span className="ml-1 text-12 font-normal text-muted">
                        {count}/{members.length}
                      </span>
                    </h4>
                    <p className="mt-1 mb-0 text-13 text-muted">{category.description}</p>
                  </div>
                </div>
                <Button
                  className={button({ variant: 'tertiary', text: 13, height: 44 })}
                  aria-label={`${allSelected ? 'Clear' : 'Select'} ${category.title}`}
                  isDisabled={disabled}
                  onPress={() =>
                    onChange(
                      allSelected
                        ? selected.filter((name) => !members.includes(name))
                        : [...new Set([...selected, ...members])],
                    )
                  }
                >
                  {allSelected ? 'Clear group' : 'Select group'}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3 max-[1100px]:grid-cols-1">
                {members.map((name) => (
                  <label
                    key={name}
                    htmlFor={`expected-tool-${name}`}
                    className={cx(
                      'flex min-w-0 cursor-pointer items-start gap-3 rounded-10 border p-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus motion-reduce:transition-none',
                      selected.includes(name)
                        ? 'border-hover-border bg-tint'
                        : 'border-transparent bg-surface hover:border-border hover:bg-soft',
                      disabled && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <input
                      id={`expected-tool-${name}`}
                      type="checkbox"
                      aria-label={toolTitle(name)}
                      className="mt-1 size-5 shrink-0 accent-fill"
                      checked={selected.includes(name)}
                      onChange={(event) =>
                        onChange(
                          event.target.checked
                            ? [...selected, name]
                            : selected.filter((item) => item !== name),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <span className="block text-14 font-semibold text-navy">
                        {toolTitle(name)}
                      </span>
                      <span className="mt-1 block text-13 text-muted">
                        {TOOLS[name]?.description ?? 'Enable this tool for planned partner usage.'}
                      </span>
                      <span className="mt-2 block font-mono text-12 break-all text-muted">
                        {name}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </fieldset>
  )
}
