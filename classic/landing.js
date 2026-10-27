// The landing page (landing.html) in its shadow root. Every way into the app is a trigger for app.py: "open" names
// a page, or "account", and "goal" carries the goal typed in the closing box. Streamlit scrolls its stMain section,
// not the window, and keeps that position between pages, so the page starts at the top and listens to stMain.
// Streamlit calls this on every rerun; the page starts once and stops when it leaves the app.
const pages = new WeakMap()

export default function (component) {
  const { parentElement: root, data, setTriggerValue } = component
  let page = pages.get(root)
  if (!page) {
    page = start(root)
    pages.set(root, page)
  }
  page.emit = setTriggerValue
  page.account.textContent = data?.account || 'Sign in'
  return () => setTimeout(() => {
    if (!page.landing.isConnected) {
      page.stop()
      pages.delete(root)
    }
  })
}

function start(root) {
  const page = { emit: () => {} }
  const motionOK = !matchMedia('(prefers-reduced-motion: reduce)').matches
  const $ = selector => root.querySelector(selector)
  const $$ = (selector, within = root) => [...within.querySelectorAll(selector)]
  const scroller = document.querySelector('[data-testid="stMain"]')
  const scrollTop = () => (scroller ? scroller.scrollTop : window.scrollY)
  const off = new AbortController()
  const { signal } = off
  const timers = new Set()
  let alive = true
  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); if (alive) fn() }, ms)
    timers.add(id)
  }
  const sleep = ms => new Promise(resolve => later(resolve, ms))
  page.landing = $('.landing')
  page.account = $('[data-open="account"]')
  scroller?.scrollTo({ top: 0 })

  /* ── Theme: app.py puts the theme Streamlit shows on <html>; landing.css reads it from the host ── */
  const mirrorTheme = () => { root.host.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' }
  mirrorTheme()
  const themeWatch = new MutationObserver(mirrorTheme)
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  /* ── Scroll reveal: content is visible until this script can watch it come into view ── */
  const revealed = new Set()
  const onReveal = new Map()
  function reveal(el) {
    if (revealed.has(el)) return
    revealed.add(el)
    el.classList.add('is-in')
    for (const fn of onReveal.get(el) || []) fn()
  }
  const when = (el, fn) => (revealed.has(el) ? fn() : onReveal.set(el, [...(onReveal.get(el) || []), fn]))
  const targets = [$('.hero'), ...$$('.reveal')]
  let io = null
  if (motionOK && 'IntersectionObserver' in window) {
    page.landing.classList.add('reveal-on')
    io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { reveal(entry.target); io.unobserve(entry.target) }
    }), { rootMargin: '0px 0px -12% 0px', threshold: 0.12 })
    targets.forEach(el => io.observe(el))
    requestAnimationFrame(() => reveal($('.hero')))
  } else {
    targets.forEach(reveal)
  }

  /* ── Links: sections scroll into view; everything else goes to app.py ── */
  root.addEventListener('click', event => {
    const link = event.target.closest('[data-open], a[href^="#"]')
    if (!link) return
    event.preventDefault()
    const target = link.dataset.open
    if (target) {
      if (target !== 'account') scroller?.scrollTo({ top: 0 })
      page.emit('open', target)
      return
    }
    const section = root.getElementById(link.getAttribute('href').slice(1))
    const behavior = motionOK ? 'smooth' : 'auto'
    if (section && section.id !== 'top') section.scrollIntoView({ behavior, block: 'start' })
    else scroller?.scrollTo({ top: 0, behavior })
  }, { signal })

  const goal = $('#ctaGoal')
  $('#ctaForm').addEventListener('submit', event => {
    event.preventDefault()
    goal.value = goal.value.trim()
    if (!goal.value) { goal.reportValidity(); return }
    scroller?.scrollTo({ top: 0 })
    page.emit('goal', goal.value)
  }, { signal })

  /* ── Top bar turns solid once the hero scrolls under it ── */
  const bar = $('.topbar')
  const setBar = () => bar.classList.toggle('is-scrolled', scrollTop() > 24)

  /* ── Hero console: type a goal, then show its match ── */
  const ICONS = {
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L11.5 19.5a2.1 2.1 0 0 1-3-3l8.2-8.2a4 4 0 0 1-2-2Z"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/><path d="M8 12h2l1-2 2 4 1-2h2"/>',
    cloche: '<path d="M3.5 17.5h17M5.5 17.5a6.5 6.5 0 0 1 13 0M12 9V7M10.5 7h3"/>',
  }
  const svg = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    `stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
  const GOALS = [
    { goal: 'Gusto kong maging welder.', lang: 'Written in Taglish', name: 'Manual Metal Arc Welding (MMAW) NC II',
      meta: 'Metals and Engineering · 17 units of competency', pct: 92, icon: 'wrench', a: '#5b7aa3', b: '#33507a',
      jobs: ['Welder', 'Fabricator', 'Structural Welder'] },
    { goal: 'Marunong akong mag-ayos ng computer.', lang: 'Written in Filipino', name: 'Computer Systems Servicing NC II',
      meta: 'Information and Communication Technology · 15 units', pct: 89, icon: 'monitor', a: '#2f6fe0', b: '#1a4aa8',
      jobs: ['Computer Technician', 'IT Support Technician'] },
    { goal: 'I want to take care of elderly people abroad.', lang: 'No trade named, matched by meaning',
      name: 'Caregiving (Elderly) NC II', meta: 'Human Health/Health Care · 18 units of competency', pct: 86,
      icon: 'heart', a: '#e0607a', b: '#ac3651', jobs: ['Caregiver for Elderly'] },
    { goal: 'I want to become a chef.', lang: 'Written in English', name: 'Cookery NC II',
      meta: 'Tourism · 22 units of competency', pct: 94, icon: 'cloche', a: '#7b61d6', b: '#5038a3',
      jobs: ['Chef', 'Cook', 'Kitchen Assistant'] },
  ]
  const el = { text: $('#goalText'), box: $('#goalBox'), lang: $('#goalLang'), match: $('#match'), tile: $('#matchTile'),
    name: $('#matchName'), meta: $('#matchMeta'), ring: $('#matchRing'), pct: $('#matchPct'), jobs: $('#matchJobs'),
    step: $('#stepMatch') }
  function showMatch(g) {
    el.tile.innerHTML = svg(g.icon)
    el.tile.style.setProperty('--a', g.a)
    el.tile.style.setProperty('--b', g.b)
    el.name.textContent = g.name
    el.meta.textContent = g.meta
    el.lang.textContent = g.lang
    el.jobs.innerHTML = g.jobs.map(job => `<span>${job}</span>`).join('')
    el.match.classList.remove('is-hidden')
    el.step.classList.add('on')
    if (!motionOK) { el.ring.style.setProperty('--v', g.pct); el.pct.textContent = g.pct + '%'; return }
    const begin = performance.now()
    const tick = now => {
      const t = Math.min(1, (now - begin) / 900), v = Math.round(g.pct * (1 - Math.pow(1 - t, 3)))
      el.ring.style.setProperty('--v', v)
      el.pct.textContent = v + '%'
      if (t < 1 && alive) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  showMatch(GOALS[0])
  async function cycle() {
    let i = 0
    await sleep(3800)
    for (;;) {
      i = (i + 1) % GOALS.length
      const g = GOALS[i]
      el.match.classList.add('is-hidden')
      el.step.classList.remove('on')
      el.lang.textContent = ''
      el.jobs.innerHTML = ''
      el.box.classList.add('is-live')
      const old = el.text.textContent
      for (let n = old.length; n >= 0; n -= 2) { el.text.textContent = old.slice(0, n); await sleep(18) }
      for (let n = 1; n <= g.goal.length; n++) { el.text.textContent = g.goal.slice(0, n); await sleep(38 + Math.random() * 40) }
      el.box.classList.remove('is-live')
      await sleep(450)
      showMatch(g)
      await sleep(4200)
    }
  }
  if (motionOK) when($('.console'), cycle)

  /* ── The route: drawn through every waypoint, revealed as you scroll ── */
  const track = $('#track'), route = $('#route'), [bed, road, dash] = $$('path', route), points = $$('.waypoint', track)
  // Samples of (length along the road, height), so the drawn tip follows the reader's eye line rather than path length.
  let samples = [], total = 0
  function buildRoute() {
    const box = track.getBoundingClientRect()
    if (!box.width) return
    route.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`)
    const pts = points.map(p => {
      const r = p.getBoundingClientRect()
      return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2]
    })
    const swing = box.width < 700 ? 0 : Math.min(150, box.width * 0.12)
    let d = `M${pts[0][0]} ${Math.max(0, pts[0][1] - 120)} L${pts[0][0]} ${pts[0][1]}`
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], dy = y1 - y0, side = i % 2 ? 1 : -1
      // An S-bend between stops, like the logo's road.
      d += ` C${x0 + side * swing} ${y0 + dy * 0.45}, ${x1 - side * swing} ${y1 - dy * 0.45}, ${x1} ${y1}`
    }
    const last = pts[pts.length - 1]
    d += ` L${last[0]} ${last[1] + 90}`
    for (const path of [bed, road, dash]) path.setAttribute('d', d)
    total = road.getTotalLength()
    samples = []
    for (let i = 0; i <= 200; i++) { const len = total * i / 200; samples.push([len, road.getPointAtLength(len).y]) }
    drawRoute()
  }
  function drawRoute() {
    if (!total) return
    const box = track.getBoundingClientRect()
    const reachY = motionOK ? innerHeight * 0.62 - box.top : Infinity
    const hit = samples.find(([, y]) => y >= reachY)
    const len = hit ? hit[0] : total
    road.style.strokeDasharray = `${total} ${total}`
    road.style.strokeDashoffset = String(total - len)
    points.forEach(p => p.classList.toggle('is-lit', p.getBoundingClientRect().top - box.top + p.offsetHeight / 2 <= reachY))
  }
  const ro = new ResizeObserver(() => buildRoute())
  ro.observe(track)
  document.fonts?.ready.then(() => alive && buildRoute())
  ;(scroller || window).addEventListener('scroll', () => requestAnimationFrame(() => {
    if (!alive) return
    setBar()
    drawRoute()
  }), { passive: true, signal })
  setBar()

  /* ── Readiness check, scored as the API scores it (skill_gap_service.py) ── */
  const UNITS = ['Prepare espresso', 'Texture milk', 'Prepare and serve coffee beverages',
    'Perform basic maintenance of machine and equipment', 'Perform basic cashiering and general control procedures']
  const START = ['yes', 'yes', 'some', 'some', 'new']
  const VALUE = { yes: 1, some: 0.5, new: 0 }
  const LABEL = { yes: 'Confident', some: 'Some experience', new: 'New to me' }
  $('#units').innerHTML = UNITS.map((unit, i) => `<fieldset class="unit">
      <legend class="unit-name" style="padding:0">${unit}</legend>
      <div class="seg">${Object.keys(VALUE).map(v => `<input type="radio" id="u${i}-${v}" name="u${i}" value="${v}"
        ${START[i] === v ? 'checked' : ''}><label for="u${i}-${v}">${LABEL[v]}</label>`).join('')}</div>
    </fieldset>`).join('')
  const form = $('#readiness')
  function score() {
    const values = UNITS.map((_, i) => VALUE[form.elements['u' + i].value])
    const s = values.reduce((a, b) => a + b, 0) / values.length * 100
    const level = s >= 80 ? 'high' : s >= 50 ? 'moderate' : 'low'
    $('#meterTrack').style.setProperty('--score', s)
    $('#readinessScore').textContent = Math.round(s) + '%'
    $('#readinessLevel').textContent = { high: 'High', moderate: 'Moderate', low: 'Low' }[level] + ' readiness'
    $$('#routes .route-card').forEach(card => card.classList.toggle('is-picked', card.dataset.level === level))
  }
  form.addEventListener('change', score, { signal })
  form.addEventListener('submit', event => event.preventDefault(), { signal })
  score()

  /* ── The archipelago: each region's center, from backend/seed/regions.json ── */
  const REGIONS = [['NCR', 'Manila', 14.5995, 120.9842], ['CAR', 'Baguio', 16.4023, 120.596],
    ['I', 'San Fernando', 16.6159, 120.3166], ['II', 'Tuguegarao', 17.6132, 121.727],
    ['III', 'San Fernando', 15.0286, 120.6898], ['IV-A', 'Calamba', 14.2117, 121.1653],
    ['MIMAROPA', 'Calapan', 13.4115, 121.1803], ['V', 'Legazpi', 13.1391, 123.7438],
    ['VI', 'Iloilo City', 10.7202, 122.5621], ['NIR', 'Bacolod', 10.6765, 122.9509],
    ['VII', 'Cebu City', 10.3157, 123.8854], ['VIII', 'Tacloban', 11.2443, 125.0039],
    ['IX', 'Pagadian', 7.8257, 123.437], ['X', 'Cagayan de Oro', 8.4542, 124.6319],
    ['XI', 'Davao City', 7.1907, 125.4553], ['XII', 'Koronadal', 6.5031, 124.8469],
    ['XIII', 'Butuan', 8.9475, 125.5406], ['BARMM', 'Cotabato City', 7.2236, 124.2464]]
  const W = 320, H = 420, lon0 = 119.4, lon1 = 127.6, lat0 = 5.6, lat1 = 19.2
  const px = lon => 20 + (lon - lon0) / (lon1 - lon0) * (W - 40)
  const py = lat => 20 + (lat1 - lat) / (lat1 - lat0) * (H - 40)
  const LABELS = new Set(['Manila', 'Baguio', 'Cebu City', 'Iloilo City', 'Davao City', 'Tuguegarao', 'Legazpi', 'Cagayan de Oro'])
  let map = ''
  for (let x = 14; x < W; x += 18) for (let y = 14; y < H; y += 18) map += `<circle class="grid-dot" cx="${x}" cy="${y}" r="1.2"/>`
  const me = REGIONS[10] // an example learner in Cebu City, linked to the centers nearby
  REGIONS.filter(r => r !== me && Math.hypot(r[2] - me[2], r[3] - me[3]) < 2.1).forEach(r => {
    map += `<path class="link" d="M${px(me[3])} ${py(me[2])} Q${(px(me[3]) + px(r[3])) / 2 + 14} ` +
      `${(py(me[2]) + py(r[2])) / 2 - 14} ${px(r[3])} ${py(r[2])}"/>`
  })
  REGIONS.forEach(([, city, lat, lon], i) => {
    const x = px(lon), y = py(lat), you = city === me[1]
    map += `<circle class="pulse" cx="${x}" cy="${y}" r="5" style="--d:${(i * 0.37) % 3}"/>`
    map += `<circle class="${you ? 'you' : 'region'}" cx="${x}" cy="${y}" r="${you ? 7 : 4.5}"/>`
    if (you) map += `<text class="you-label" x="${x + 12}" y="${y + 4}">You · ${city}</text>`
    else if (LABELS.has(city)) {
      const left = ['Baguio', 'Manila', 'Iloilo City'].includes(city)
      map += `<text x="${left ? x - 10 : x + 10}" y="${y + 4}" text-anchor="${left ? 'end' : 'start'}">${city}</text>`
    }
  })
  $('#islands').innerHTML = map

  /* ── Catalog: numbers count up, names drift by ── */
  const fmt = n => n.toLocaleString('en-US')
  $$('[data-count]').forEach(n => {
    const target = +n.dataset.count
    if (!motionOK) return
    n.textContent = '0'
    when(n.closest('.reveal'), () => {
      const begin = performance.now(), duration = 1400 + Math.min(target, 1000)
      const tick = now => {
        const t = Math.min(1, (now - begin) / duration)
        n.textContent = fmt(Math.round(target * (1 - Math.pow(1 - t, 4))))
        if (t < 1 && alive) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  })
  const Q1 = [['Cookery NC II', 'Tourism'], ['Electrical Installation and Maintenance NC II', 'Construction'],
    ['Barista NC II', 'Tourism'], ['Computer Systems Servicing NC II', 'ICT'], ['Carpentry NC II', 'Construction'],
    ['Driving NC II', 'Automotive'], ['2D Animation NC III', 'ICT'], ['Housekeeping NC II', 'Tourism'],
    ['Able Seafarer Deck NC II (II-5)', 'Maritime']]
  const Q2 = [['Manual Metal Arc Welding (MMAW) NC II', 'Metals and Engineering'], ['Caregiving (Elderly) NC II', 'Health Care'],
    ['Front Office Services NC II', 'Tourism'], ['5-Axis CNC Machine Operation NC III', 'Metals and Engineering'],
    ['Food and Beverage Services NC II', 'Tourism'], ['Carpentry NC III', 'Construction'],
    ['3D Game Art Development NC III', 'ICT'], ['Electrical Installation and Maintenance NC III', 'Electrical and Electronics']]
  for (const [row, list] of [[$('#row1'), Q1], [$('#row2'), Q2]]) {
    const names = list.map(([name, sector]) => `<span>${name}<small>${sector}</small></span>`).join('')
    row.innerHTML = names + names // the second copy makes the loop seamless
    ;[...row.children].slice(list.length).forEach(copy => copy.setAttribute('aria-hidden', 'true'))
  }

  /* ── Progress: steps tick off as the plan comes into view ── */
  const plan = $('#plan')
  when(plan.closest('.reveal'), () => $$('li', plan).forEach((li, i) => later(() => {
    li.classList.toggle('done', i < 2)
    li.classList.toggle('next', i === 2)
  }, motionOK ? 500 + i * 450 : 0)))

  page.stop = () => {
    alive = false
    off.abort()
    io?.disconnect()
    ro.disconnect()
    themeWatch.disconnect()
    timers.forEach(clearTimeout)
  }
  return page
}
