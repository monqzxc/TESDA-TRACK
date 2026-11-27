import { useContext, useEffect, useRef, useState } from 'react'
import { useCopy } from '../../../i18n/copy.ts'
import { GoalSearch } from './GoalSearch.tsx'
import { LandingMotionPaused, useReducedMotion } from './motion.ts'

/** The prototype demo is illustrative; submitting a learner's words opens the real Career Map journey. */
export function HeroMatchPreview() {
  const copy = useCopy().landingPage
  const paused = useContext(LandingMotionPaused)
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [editing, setEditing] = useState(false)
  const [frame, setFrame] = useState({ characters: 0, rows: 0 })
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.1,
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible || editing || reduced || paused) return
    let timers: ReturnType<typeof setTimeout>[] = []
    const run = () => {
      timers.forEach(clearTimeout)
      timers = []
      setFrame({ characters: 0, rows: 0 })
      for (let i = 1; i <= copy.hero.previewQuery.length; i++)
        timers.push(
          setTimeout(() => setFrame((state) => ({ ...state, characters: i })), 150 + i * 65),
        )
      for (let i = 1; i <= 3; i++)
        timers.push(
          setTimeout(
            () => setFrame((state) => ({ ...state, rows: i })),
            150 + copy.hero.previewQuery.length * 65 + 200 + i * 180,
          ),
        )
    }
    const start = setTimeout(run, 0)
    const repeat = setInterval(run, 5000)
    return () => {
      clearTimeout(start)
      clearInterval(repeat)
      timers.forEach(clearTimeout)
    }
  }, [visible, editing, reduced, paused, copy.hero.previewQuery])
  const still = reduced || paused
  return (
    <div
      ref={ref}
      data-testid="hero-match-preview"
      className="min-h-[404px] rounded-[28px] bg-(--l-surface) p-7 text-(--l-ink) shadow-[0_16px_40px_-8px_rgb(5_15_38/0.2)] max-sm:p-5"
    >
      <GoalSearch
        id="landing-goal"
        placeholder={
          still ? copy.hero.previewQuery : copy.hero.previewQuery.slice(0, frame.characters)
        }
        compact
        onEditingChange={setEditing}
      />
      {editing ? (
        <p className="mt-6 text-14 text-(--l-muted)">{copy.hero.editingHint}</p>
      ) : (
        <>
          <div className="mt-5 mb-4 flex items-center justify-between gap-2">
            <p className="text-16 font-semibold">{copy.hero.previewTitle}</p>
            <span className="text-11 text-(--l-muted)">{copy.howItWorks.example}</span>
          </div>
          <div
            role="img"
            aria-label={`${copy.howItWorks.example}: ${copy.hero.previewRows.map((row) => row.title).join(', ')}`}
            className="flex flex-col gap-3"
          >
            {copy.hero.previewRows.map((row, i) => (
              <div
                key={row.title}
                aria-hidden="true"
                className={`flex min-h-[68px] items-center justify-between gap-3 rounded-14 border p-3 transition-[opacity,transform] duration-200 motion-reduce:transition-none ${i === 0 ? 'border-[#205fc1] bg-[#e6eefb] text-[#123e80]' : 'border-transparent bg-transparent'} ${still || frame.rows > i ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`}
              >
                <div className="min-w-0">
                  <p className="text-14 leading-[1.35] font-medium">{row.title}</p>
                  <p
                    className={`mt-1 text-13 leading-[1.4] text-[#5b6573] ${i === 0 ? '' : 'dark:text-[#97a7bd]'}`}
                  >
                    {row.detail}
                  </p>
                </div>
                <span
                  className={`flex-none rounded-full px-2 py-1 text-11 font-medium ${i === 0 ? 'bg-[#e3f3f0] text-[#075c51]' : i === 1 ? 'bg-[#e6eefb] text-[#123e80]' : 'bg-[#fcf1e8] text-[#91470d]'}`}
                >
                  {row.tag}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
