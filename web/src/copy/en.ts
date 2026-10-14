// All interface copy lives here, so a Filipino version can be added later (US-15).
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
      lead: "Soon you can explore qualifications, possible careers, and the skills you'll build along the way.",
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
      lead: 'Soon you can sign in here to save your progress and pick up where you left off.',
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
