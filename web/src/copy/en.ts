// All interface copy lives here, so a Filipino version can be added later (US-15).

/** A figure in a line of copy, grouped as the page shows figures: 4,981. */
const figure = (n: number) => n.toLocaleString('en-US')

/** Names in a sentence: "a", "a and b", "a, b and c". */
const list = (items: readonly string[]) =>
  items.length > 1
    ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
    : (items[0] ?? '')

export const en = {
  app: {
    name: 'TESDA-TRACK',
  },
  brand: {
    // The wordmark is drawn as "TESDA" and a lighter "TRACK"; screen readers get the name instead.
    wordmark: ['TESDA', 'TRACK'],
    name: 'TESDA Track',
    tagline: 'Your skills. Your next chapter.',
    homeLink: 'TESDA Track home',
  },
  skipToContent: 'Skip to content',
  nav: {
    // The accessible name of the page links.
    label: 'Main',
    home: 'Home',
    finder: 'Find my pathway',
    qualifications: 'Qualifications Library',
    training: 'Training & Assessment',
    progress: 'My Progress',
    skills: 'Skills Explorer',
    reports: 'Reports',
    signIn: 'Sign in',
    menu: 'Menu',
    closeMenu: 'Close menu',
  },
  // The landing page's own top bar, on Home.
  landing: {
    sections: 'Sections',
    how: 'How it works',
    near: 'Near you',
    catalog: 'Qualifications',
    progress: 'My progress',
    signIn: 'Sign in',
    findMyPath: 'Find my path',
  },
  // Home, the landing page (frontend/landing.html). Names from TESDA's data (qualifications, jobs, units of
  // competency, regions) and the figures it shows are in features/home/data.ts; the lines that quote a figure take it
  // from there.
  home: {
    hero: {
      eyebrow: 'TESDA qualifications · Learner pilot',
      // The h1, drawn on three lines with the last one highlighted. It reads as en.pages.home.heading.
      title: ['Every career', 'has a track.', 'Find yours.'],
      lead: "Not sure where to start? Just tell us what you enjoy doing, what you're good at, or what you'd like to become—in your own words. We'll help you discover skills worth learning, explore career paths, and find training or assessment centers near you.",
      findMyPath: 'Find my path',
      browse: (qualifications: number) => `Browse ${figure(qualifications)} qualifications`,
      notes: (regions: number) => [
        'No account needed to start',
        'Taglish welcome',
        `Search all ${figure(regions)} regions`,
      ],
    },
    // The hero's example: a goal types itself, then its top match appears.
    console: {
      label: 'Example: a goal matched to a qualification',
      goal: 'Your goal',
      example: 'Example',
      topMatch: 'Top match',
      goalMatch: 'Goal match',
      steps: ['Goal', 'Match', 'Readiness', 'Pathway'],
      // Typed in turn, each with its match in data.ts (CONSOLE_MATCHES).
      examples: [
        { goal: 'Gusto kong maging welder.', language: 'Written in Taglish' },
        { goal: 'Marunong akong mag-ayos ng computer.', language: 'Written in Filipino' },
        {
          goal: 'I want to take care of elderly people abroad.',
          language: 'No trade named, matched by meaning',
        },
        { goal: 'I want to become a chef.', language: 'Written in English' },
      ],
    },
    how: {
      eyebrow: 'How Find my path works',
      heading: 'Four stops between a goal and a certificate.',
      lead: 'Follow the route at your own pace. Each stop uses what you told us at the one before, so the plan at the end is yours.',
      goal: {
        step: 'Your goal',
        heading: 'Start with what you want to do.',
        // Plain text, with each { quote } shown as a quotation.
        body: [
          'Write it the way you would say it. ',
          { quote: 'Gusto kong maging kusinero' },
          ' works as well as ',
          { quote: 'I want to become a chef' },
          ', and so does a goal that names no trade at all, like ',
          { quote: 'I want to take care of elderly people abroad' },
          '.',
        ],
        card: 'Goals learners start with',
        // Tags the goals written in Filipino.
        filipino: 'Filipino',
        goals: [
          { text: 'Become a welder' },
          { text: 'Work in a hotel' },
          { text: 'Marunong akong mag-ayos ng computer', filipino: true },
          { text: 'I want to be a barista' },
          { text: 'Improve my digital skills' },
          { text: 'Work on construction projects' },
          { text: 'I want to learn caregiving' },
          { text: 'Gusto kong maging kusinero', filipino: true },
        ],
      },
      match: {
        step: 'Your match',
        heading: 'See which qualifications fit, and why.',
        body: 'Matches weigh the meaning of your goal and the words you used, so a goal finds its trade even when it shares no words with the catalog. When a goal has no TESDA equivalent, such as astronaut or lawyer, TESDA Track says so instead of guessing.',
        card: '“I want to work in a hotel”',
        example: 'Example',
        note: 'Match scores are guidance, not a guarantee.',
      },
      readiness: {
        step: 'Readiness check',
        heading: 'Rate yourself on each unit of competency.',
        body: 'Every qualification is built from units of competency in TESDA’s Training Regulations. Mark the ones you can already do, and see your strengths and skill gaps before you spend on training. Try it here.',
        card: 'Barista NC II · core units',
        tryIt: 'Try it',
        answers: { yes: 'Confident', some: 'Some experience', new: 'New to me' },
        levels: { high: 'High readiness', moderate: 'Moderate readiness', low: 'Low readiness' },
        // Under the meter, at 0, 50, 80 and 100.
        scale: ['0', '50 moderate', '80 high', '100'],
      },
      pathway: {
        step: 'Your pathway',
        heading: 'Get the route that fits where you are.',
        body: 'Your readiness picks the route. Experienced workers can go straight to assessment, and new learners start with training. Change your answers above and watch the route change.',
        card: 'Your recommended route',
        routes: {
          high: {
            title: 'Apply for the NC assessment',
            band: '80% and up',
            text: 'Book a schedule at an accredited assessment center.',
          },
          moderate: {
            title: 'Take focused training, then the NC assessment',
            band: '50–79%',
            text: 'Train only on the units you marked as gaps.',
          },
          low: {
            title: 'Take training first',
            band: 'Below 50%',
            text: 'Enroll in a TESDA-registered program near you.',
          },
        },
      },
    },
    near: {
      eyebrow: 'Training & assessment',
      heading: 'Programs and assessment centers, nearest first.',
      lead: 'Pick your region and TESDA Track lists training programs and upcoming assessment schedules, then lets you apply for a slot.',
      mapLabel: (regions: number) =>
        `Dots marking the center of each of the ${figure(regions)} Philippine regions`,
      mapCaption: 'One dot per region, placed at its regional center',
      // Beside the example learner's dot: "You · Cebu City".
      you: 'You',
      weightsHeading: 'How training programs are ranked',
      // Each part of a program's score, with its weight in features/home/NearYou.tsx.
      weights: [
        { title: 'Fit with your goal.', text: 'How close the program is to what you asked for.' },
        { title: 'Distance.', text: 'How far the provider is from your region.' },
        {
          title: 'Assessment nearby.',
          text: 'Whether you can get certified close to where you train.',
        },
        { title: 'Start date.', text: 'Sooner classes rank higher.' },
        { title: 'Your preferences.', text: 'Anything else you told us.' },
      ],
      extras: [
        'Directions and travel time',
        'Flight estimates across islands',
        'Open assessment schedules',
      ],
      cta: 'Find training near you',
    },
    catalog: {
      eyebrow: 'Qualifications library',
      heading: (qualifications: number) => `${figure(qualifications)} qualifications`,
      // After the big figure.
      lead: 'qualifications, each built from a current TESDA Training Regulation.',
      // After each of the figures in data.ts (CATALOG.facts).
      facts: [
        'sectors, from construction to maritime',
        'jobs the qualifications lead to',
        'units of competency to rate yourself on',
      ],
      levels: 'Qualifications by NC level',
      levelsNote: 'Four more qualifications carry no NC level.',
      cta: 'Open the qualifications library',
      drifting: 'Some of the qualifications in the library',
    },
    progress: {
      planTitle: 'Train, then get assessed',
      plan: [
        {
          title: 'Enroll in a training program',
          text: 'Choose a TESDA-registered program near you or online.',
        },
        {
          title: 'Complete the readiness check',
          text: 'Rate yourself on each competency to find any remaining gaps.',
        },
        {
          title: 'Apply for the competency assessment',
          text: 'Book a schedule at an accredited assessment center.',
        },
        {
          title: 'Receive your National Certificate',
          text: 'Candidates assessed as competent are issued an NC.',
        },
      ],
      eyebrow: 'My progress',
      heading: 'Save your path. Tick off each step.',
      lead: 'Create an account when you want to keep your place. Your plan waits for you on any device.',
      keeps: [
        {
          title: 'Goals, matches and readiness checks',
          text: 'Come back to a recommendation without starting over.',
        },
        {
          title: 'Applications and certificates',
          text: 'Follow an assessment application, and keep the certificate when you pass.',
        },
        {
          title: 'Your data stays yours',
          text: 'Download everything we keep about you, or delete your account and every record with it.',
        },
      ],
      cta: 'Go to My progress',
    },
    // The goal box at the end of the page, which opens Find my path with the goal.
    closing: {
      eyebrow: 'Step 1 of 4',
      heading: 'What would you like to achieve?',
      lead: 'Tell us about a career, a skill, or an experience you’d like to turn into a qualification.',
      label: 'Your goal',
      placeholder: 'I’ve worked as a welder for 5 years but I don’t have an NC.',
      submit: 'Find my path',
      note: 'Your goal opens in Find my path, where you can change it before you get your matches.',
      // As the finder's goal box says it.
      empty: 'Describe your career goal or skills to get started.',
      // Under the box, as Streamlit's text area counts: "12/500", read as "12 of 500 characters".
      count: (used: number, max: number) => `${used}/${max}`,
      countLabel: (used: number, max: number) => `${used} of ${max} characters`,
    },
    footer:
      'TESDA Track is a pilot. Matches are guidance, and readiness checks are self-reported: they don’t replace an official TESDA competency assessment.',
  },
  // Each page's document title, heading and the line under it (for now, what's coming). Titles are fixed
  // strings: they never include anything a learner typed (see lib/navigation.ts).
  pages: {
    home: {
      title: 'TESDA-TRACK · Your next step',
      heading: 'Every career has a track. Find yours.',
      lead: 'The new home page is coming soon.',
    },
    finderGoal: {
      title: 'Your goal · Find my pathway · TESDA-TRACK',
      heading: 'Find my pathway',
      step: 'Your goal',
      lead: "Soon you can tell us about a career, a skill, or an experience you'd like to turn into a qualification.",
    },
    finderMatches: {
      title: 'Your match · Find my pathway · TESDA-TRACK',
      heading: 'Find my pathway',
      step: 'Your match',
      lead: "Soon you'll see the qualifications that match your goal.",
    },
    finderReadiness: {
      title: 'Readiness check · Find my pathway · TESDA-TRACK',
      heading: 'Find my pathway',
      step: 'Readiness check',
      lead: 'Soon you can check the skills you already have and the ones to build.',
    },
    finderPathway: {
      title: 'Your pathway · Find my pathway · TESDA-TRACK',
      heading: 'Find my pathway',
      step: 'Your pathway',
      lead: "Soon you'll see the training and assessment steps to your qualification.",
    },
    qualifications: {
      title: 'Qualifications Library · TESDA-TRACK',
      heading: 'Qualifications Library',
      lead: "Explore qualifications, possible careers, and the skills you'll build along the way.",
    },
    training: {
      title: 'Training & Assessment · TESDA-TRACK',
      heading: 'Training & Assessment',
      lead: 'Soon you can find training and assessment centers near you.',
    },
    progress: {
      title: 'My Progress · TESDA-TRACK',
      heading: 'My Progress',
      lead: 'Soon your recommendations, readiness checks, and achievements will be together in one place.',
    },
    skills: {
      title: 'Skills Explorer · TESDA-TRACK',
      heading: 'Skills Explorer',
      lead: 'Soon you can explore occupations, related qualifications, and skills to develop with Skills Bridge.',
    },
    reports: {
      title: 'Reports · TESDA-TRACK',
      heading: 'Reports',
      lead: 'Soon administrators can explore pilot activity, qualification demand, and training opportunities.',
    },
    signIn: {
      title: 'Sign in · TESDA-TRACK',
      heading: 'Sign in',
      lead: 'Sign in to save your progress and pick up where you left off.',
    },
    notFound: {
      title: 'Page not found · TESDA-TRACK',
      heading: 'Page not found',
      lead: 'The address may be mistyped, or the page may have moved.',
      home: 'Go to the home page',
    },
  },
  catalog: {
    loading: 'Loading qualifications…',
    // The catalog loaded, but it has no qualifications yet (frontend/app.py main).
    empty: {
      heading: 'New possibilities are on the way',
      body: 'There are no qualifications in the catalog yet. Please check back later.',
      refresh: 'Refresh catalog',
    },
  },
  // Facts about a qualification from its catalog record (frontend/app.py qualification_tags, qualification_blurb).
  qualification: {
    tags: {
      level: (numeral: string) => `NC ${numeral}`,
      competencies: (n: number) => `${figure(n)} ${n === 1 ? 'competency' : 'competencies'}`,
      careers: (n: number) => `${figure(n)} career ${n === 1 ? 'option' : 'options'}`,
      higher: (numeral: string) => `Pathway to NC ${numeral}`,
    },
    blurb: {
      jobs: (jobs: readonly string[]) => `Prepares you for jobs like ${list(jobs)}.`,
      covers: (competencies: number, core: number) =>
        `Covers ${figure(competencies)} ${competencies === 1 ? 'competency' : 'competencies'}` +
        (core
          ? `, including ${figure(core)} core technical ${core === 1 ? 'skill' : 'skills'}.`
          : '.'),
    },
    // Each group of competencies, as the readiness check and the library name them.
    category: (category: string) => `${category} skills`,
    categoryHelp: {
      Basic: 'Workplace skills every qualification shares, like teamwork and safety.',
      Common: 'Skills shared by the trades in this sector.',
      Core: 'The technical skills of this qualification.',
      other: 'What can you already do? Rate each sample competency.',
    } as Record<string, string>,
  },
  // Qualifications Library (frontend/app.py show_library).
  library: {
    hero: {
      title: 'Find what sparks',
      accent: 'your interest.',
    },
    filters: 'Filter qualifications',
    search: 'Search qualifications or careers',
    searchPlaceholder: 'Try welding, cookery, or computers',
    clearSearch: 'Clear search',
    sector: 'Sector',
    allSectors: 'All sectors',
    // "12 of 319 qualifications · Showing 1–12 · Filtered results"
    count: (found: number, total: number) => `${figure(found)} of ${figure(total)} qualifications`,
    showing: (first: number, last: number) => `Showing ${figure(first)}–${figure(last)}`,
    filtered: 'Filtered results',
    unfiltered: 'Find your next possibility',
    clear: 'Clear filters',
    empty: {
      heading: 'No qualifications found',
      body: 'Try a different career or keyword, or clear your filters to explore all qualifications.',
    },
    careers: 'Possible careers',
    noCareers: 'Not listed yet',
    competencies: (n: number) =>
      `View ${figure(n)} sample ${n === 1 ? 'competency' : 'competencies'}`,
    explore: 'Explore this pathway',
    // The goal "Explore this pathway" puts in Find my pathway's goal box, for the learner to review.
    exploreGoal: (name: string) => `I want to pursue ${name}.`,
  },
  pager: {
    label: 'Pages',
    previous: 'Previous',
    next: 'Next',
    page: (page: number, pages: number) => `Page ${figure(page)} of ${figure(pages)}`,
  },
  service: {
    unreachable: "We can't reach the TESDA-TRACK service right now. Please try again shortly.",
    // Shown when the API refuses a request without saying why.
    requestFailed: 'The request could not be completed.',
    // Shown when the API rejects a form's input without a message for it.
    checkInput: 'Please check your input.',
  },
  // A page that can't load: the API is unreachable, or part of the app failed to download or show.
  unavailable: {
    heading: "We can't load TESDA Track right now",
    body: 'Your saved progress is safe. Try again in a moment.',
    retry: 'Try again',
  },
  // Signing in, creating an account, and the account menu. The wording is the Streamlit app's account panel
  // (frontend/app.py show_account) and its redesign (frontend/portal/account.py).
  account: {
    signIn: 'Sign in',
    close: 'Close',
    // Shown in the sign-in dialog when a request finds the session has ended.
    expired: 'Your session has expired. Please sign in again.',
    checking: 'Checking your account…',
    exploring: {
      heading: 'Just exploring?',
      body: 'You can find a pathway and browse qualifications without an account.',
    },
    signInForm: {
      heading: 'Sign in',
      lead: 'Sign in to save your progress and pick up where you left off.',
      email: 'Email',
      emailPlaceholder: 'you@example.com',
      password: 'Password',
      passwordPlaceholder: 'Enter your password',
      submit: 'Sign in',
      pending: 'Signing you in…',
      missingEmail: 'Enter your email address.',
      missingPassword: 'Enter your password.',
      toRegister: 'New here? Create an account',
    },
    registerForm: {
      heading: 'Create an account',
      fullName: 'Full name',
      email: 'Email',
      emailPlaceholder: 'you@example.com',
      password: 'Password',
      passwordHelp: 'At least 10 characters.',
      privacyHeading: 'Privacy notice',
      privacyNotice:
        'TESDA-TRACK keeps your name, email, goals, recommendations, readiness checks and certifications so you ' +
        'can follow your progress. They are used only to run this pilot and are never sold. You can download or ' +
        'permanently delete your data from your account menu at any time.',
      consent: 'I agree to the privacy notice',
      submit: 'Create account',
      pending: 'Creating your account…',
      missingName: 'Enter your name.',
      invalidEmail: 'Enter a valid email address.',
      shortPassword: 'Use at least 10 characters.',
      longPassword: 'Use 128 characters or fewer.',
      consentRequired: 'Agree to the privacy notice to create your account.',
      // The account was made, but signing in straight after failed.
      createdNotSignedIn: 'Your account was created. Sign in to continue.',
      toSignIn: 'Already have an account? Sign in',
    },
    menu: {
      // Read before the learner's name on the menu button: "Your account: Maria Santos".
      label: 'Your account',
      admin: 'Administrator',
      learner: 'Learner account',
      signOut: 'Sign out',
      // The Streamlit panel's "Your data & privacy" expander.
      data: {
        heading: 'Your data & privacy',
        body: 'Download everything TESDA-TRACK stores about you, or delete your account.',
      },
      download: 'Download my data (JSON)',
      delete: 'Delete my account',
    },
    // A part of the account's code couldn't be downloaded (offline, or a new release replaced the old files).
    // Try again reloads the app, as on a page that failed to load.
    unavailable: {
      signIn: "We can't open sign-in right now. Check your connection, then try again.",
      menu: "We can't open your account menu right now. Check your connection, then try again.",
      retry: 'Try again',
    },
    exportFileName: 'tesda-track-my-data.json',
    downloading: 'Preparing your data…',
    downloaded: 'Your data was downloaded as tesda-track-my-data.json.',
    deleteDialog: {
      heading: 'Delete my account',
      body: "This can't be undone. If you want a copy of your data, download it first.",
      confirm: 'I understand this permanently deletes my account and saved records.',
      cancel: 'Cancel',
      submit: 'Delete my account',
      pending: 'Deleting your account…',
    },
    deleted: 'Your account and saved records were deleted.',
    dismiss: 'Dismiss',
    // My Progress, signed out.
    progress: {
      heading: 'Your journey deserves a place to grow',
      body: 'Sign in to save your recommendations and readiness checks and see your progress here.',
      action: 'Sign in or create an account',
    },
    // Reports, for anyone but an administrator.
    reports: {
      heading: 'Reports are not available',
      body: 'Reports are only available to administrator accounts.',
      signedOut:
        'Reports are only available to administrator accounts. Sign in with one to see them.',
      action: 'Sign in',
    },
  },
  theme: {
    // The accessible name of the System / Light / Dark switch.
    label: 'Theme',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
  },
  dev: {
    tokens: {
      title: 'Design tokens',
      intro:
        'Every color token and icon in the theme on screen, then in light and dark side by side.',
      colors: 'Colors',
      icons: 'Icons',
      token: 'Token',
      current: 'On screen',
      light: 'Light',
      dark: 'Dark',
    },
  },
} as const
