// All interface copy lives here, so a Filipino version can be added later (US-15).

/** A figure in a line of copy, grouped as the page shows figures: 4,981. */
const figure = (n: number) => n.toLocaleString('en-US')

/** The line under Find my pathway's headline, on each of its steps. */
const FINDER_LEAD =
  'Discover in-demand skills, find the right TESDA programs, and get closer to the career you want.'

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
      lead: FINDER_LEAD,
    },
    finderMatches: {
      title: 'Your match · Find my pathway · TESDA-TRACK',
      heading: 'Find my pathway',
      lead: FINDER_LEAD,
    },
    finderReadiness: {
      title: 'Readiness check · Find my pathway · TESDA-TRACK',
      heading: 'Find my pathway',
      lead: FINDER_LEAD,
    },
    finderPathway: {
      title: 'Your pathway · Find my pathway · TESDA-TRACK',
      heading: 'Find my pathway',
      lead: FINDER_LEAD,
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
  // Find my pathway (frontend/app.py show_finder and its steps).
  finder: {
    banner: {
      title: 'A little direction.',
      accent: 'A world of possibilities.',
      tiles: [
        {
          title: 'Tell us your goal',
          text: 'Share what you want to do, or what you already know.',
        },
        {
          title: 'Explore your pathway',
          text: 'Discover qualifications and suggested next steps.',
        },
        {
          title: 'Build your confidence',
          text: 'Check your readiness and find skills to develop.',
        },
      ],
    },
    steps: {
      label: 'Steps',
      // Each step's name, and the hint under it on its tab.
      names: ['Your goal', 'Your match', 'Readiness check', 'Your pathway'],
      hints: ['Start here', 'See recommendations', 'Find skill gaps', 'Plan your learning'],
      // Read after a finished step's name.
      done: 'done',
      count: (step: number, steps: number) => `Step ${step} of ${steps}`,
      back: 'Back',
      next: (step: string) => `Next: ${step}`,
    },
    goal: {
      heading: 'What would you like to achieve?',
      lead: 'Tell us about a career, a skill, or an experience you’d like to turn into a qualification.',
      examplesLabel: 'Need an idea? Start with an example',
      // Each button puts its goal in the box, without sending it (US-01).
      examples: [
        { label: 'Become a welder', goal: 'I want to be a welder.' },
        {
          label: 'Work in a hotel',
          goal: 'I want to work in a hotel but I don’t know which qualification is suitable for me.',
        },
        {
          label: 'Improve my digital skills',
          goal: 'I want to improve my digital skills and work with computers.',
        },
        {
          label: 'Work on construction projects',
          goal: 'I want to work on construction projects.',
        },
      ],
      ownWords: 'Or tell us in your own words',
      label: 'What would you like to learn or achieve?',
      placeholder:
        'Example: I want to work in a hotel but I don’t know which qualification is suitable for me.',
      samplesLabel: 'You can also try these sample goals:',
      samples: [
        { label: 'I want to become a chef', goal: 'I want to become a chef.' },
        { label: 'I want to work abroad', goal: 'I want to work abroad.' },
        { label: 'I want to learn caregiving', goal: 'I want to learn caregiving.' },
        { label: 'I want to be a barista', goal: 'I want to be a barista.' },
        {
          label: 'I want to improve my computer skills',
          goal: 'I want to improve my computer skills.',
        },
        // The one idea that shows the assessment route: experience without a certificate.
        {
          label: 'Get my skills certified',
          goal: 'I’ve worked as a welder for 5 years but I don’t have an NC.',
        },
        {
          label: 'Marunong akong mag-ayos ng computer',
          goal: 'Marunong akong mag-ayos ng computer.',
        },
      ],
      submit: 'Get recommendation',
      pending: 'Finding a starting point for you…',
      empty: 'Describe your career goal or skills to get started.',
      saved: 'Your results are saved to My Progress.',
      signInToSave: 'Sign in to save your progress',
      last: 'Your last submitted goal',
      useAgain: 'Use again',
    },
    // The submitted goal, above steps 2 to 4.
    summary: {
      label: 'Your goal',
      change: 'Change goal',
      saved: 'Saved to My Progress',
      save: 'Save to profile',
      saving: 'Saving…',
      retry: 'Try saving again',
    },
    // Saving a journey started as a guest, after signing in (US-02).
    save: {
      done: (parts: readonly string[]) => `Saved to My Progress: ${list(parts)}.`,
      goal: 'your goal',
      answers: 'your answers',
      check: 'your readiness check',
      failed: (saved: readonly string[], message: string) =>
        saved.length
          ? `We saved ${list(saved)}, but not the rest. ${message}`
          : `We couldn’t save your journey. ${message}`,
      syncFailed: 'Your latest answers aren’t saved yet.',
    },
    start: {
      heading: 'Your starting point',
      lead: 'Based on your submitted goal and the details you’ve shared.',
      goal: 'Career goal',
      exploring: 'Still exploring',
      experience: 'Experience',
      years: (years: number) =>
        `${years.toLocaleString('en-US')} ${years === 1 ? 'year' : 'years'}`,
      notSpecified: 'Not specified',
      certification: 'Certification',
      certified: 'Reported certification',
      none: 'None',
      unsure: 'Not sure',
      intent: 'Detected intent',
      intents: {
        training_recommendation: 'Training recommendation',
        training_and_assessment: 'Training and assessment',
        assessment_recommendation: 'Assessment recommendation',
        career_exploration: 'Career exploration',
        unknown: 'Unknown',
      },
      skills: (skills: readonly string[]) => `Skills you mentioned: ${skills.join(', ')}`,
    },
    followUp: {
      heading: 'A little more about you',
      lead: 'These details help us suggest a suitable starting point.',
      experienceWelder: 'Do you already have welding experience?',
      experience: 'How much experience do you have in your intended field?',
      experienceOptions: {
        none: 'No experience',
        'under-1': 'Less than 1 year',
        '1-3': '1–3 years',
        'over-3': 'More than 3 years',
      },
      certification: 'Do you currently hold a related certification?',
      certificationOptions: { yes: 'Yes', no: 'No', unsure: 'I’m not sure' },
      choose: 'Choose an answer',
    },
    matches: {
      heading: 'Qualifications for you',
      lead: 'These match your goal and experience. Choose one to check your readiness for it.',
      leadNone: 'Pick one from the full list, or describe your goal another way.',
      viewAll: 'View all qualifications',
      loading: 'Finding qualifications for you…',
      none: 'We couldn’t find a clear match. Choose a qualification from the full list below, or describe a more specific career goal.',
      topMatch: 'Top match',
      // A qualification the learner picked from the full list (US-03).
      yourChoice: 'Your choice',
      goalMatch: 'Goal match',
      goalMatchScore: (score: number) => `Goal match: ${score}%`,
      hint: 'How closely this qualification fits the goal you described. It’s guidance, not a guarantee.',
      rate: (skills: number) =>
        `Rate its ${figure(skills)} ${skills === 1 ? 'skill' : 'skills'} to see your strengths and gaps.`,
      relevant: 'Relevant skills',
      develop: 'Skills to develop',
      check: 'Check my readiness',
      other: 'Or choose any qualification to explore',
      careers: (careers: readonly string[]) => `Sample career options: ${careers.join(', ')}`,
    },
    // Steps 3 and 4 need a qualification, and a goal with no match has none until the learner picks one.
    choose: {
      heading: 'Choose a qualification first',
      body: 'Pick a qualification from your matches or the full list, then check your readiness for it.',
      action: 'Go to your matches',
    },
    why: {
      heading: 'Why we ask',
      relevant: 'Your experience should be relevant to the selected qualification.',
    },
    readiness: {
      kicker: 'Know your starting point',
      heading: 'Assessment readiness',
      lead: (name: string) => `${name}: recognize your strengths and discover what to build on.`,
      none: 'No sample competencies are listed for this qualification yet.',
      progress: (rated: number, total: number) =>
        `${figure(rated)} of ${figure(total)} skills rated`,
      part: (part: number, parts: number, category: string) =>
        `Part ${part} of ${parts} · ${category} skills`,
      single: (category: string) => `${category} skills`,
      answers: {
        confident: 'I can do this confidently',
        some_experience: 'I have some experience',
        not_familiar: 'I am not familiar with this',
      },
      previous: 'Previous part',
      next: (category: string) => `Next: ${category} skills`,
      analyze: 'Analyze my skills',
      analyzing: 'Analyzing your skills…',
      // Nothing is sent until every skill is rated (US-06).
      unanswered: (left: number, category: string) =>
        `Rate every skill before you analyze. ${figure(left)} ${left === 1 ? 'is' : 'are'} still unrated, starting in ${category} skills.`,
    },
    pathway: {
      pending: {
        heading: 'Finish your readiness check to see your recommendation',
        body: (name: string) =>
          `Whether training or an NC assessment comes next for ${name} depends on the skills you rate.`,
        action: 'Go to the readiness check',
      },
      kicker: 'Recommended for you',
      verdicts: {
        high: { headline: 'Apply for the NC assessment', action: 'See assessment schedules' },
        moderate: {
          headline: 'Take focused training, then the NC assessment',
          action: 'Find training near you',
        },
        low: { headline: 'Take training first', action: 'Find training near you' },
      },
      for: (name: string) => `For ${name}`,
      score: 'Your readiness',
      strengths: 'Your strengths',
      improve: 'Skills to improve',
      details: (strengths: number, gaps: number) =>
        `Your strengths (${figure(strengths)}) and skills to improve (${figure(gaps)})`,
      noStrengths: 'No competencies marked confident yet.',
      noGaps: 'No self-reported gaps.',
      basedOn:
        'Based on your last submitted answers for this qualification. To update it, change your answers in the readiness check and select Analyze my skills.',
      // The answers changed after this result was worked out (US-06).
      changed:
        'You’ve changed your answers since this result. Analyze your skills again to update it.',
      disclaimer:
        'This self-reported score is not an official competency assessment result. Formal assessment is subject to official eligibility and requirements.',
      yourPathway: 'Your pathway',
      follow: 'Follow this pathway',
      following: 'Adding to My Progress…',
      followed: 'Added to My Progress. Tick off each step as you complete it.',
      already: 'You’re already following this pathway. Find it under My Progress.',
      diagnostics: 'Recommendation diagnostics',
    },
  },
  // Training & Assessment (frontend/training_view.py).
  training: {
    hero: {
      title: 'Find a training or assessment center',
      lead: 'Discover TESDA-accredited training centers and assessment centers near you or in any location.',
    },
    useLocation: 'Use my location',
    search: 'Search centers',
    searchPlaceholder: 'Search by location, center name, or program…',
    kinds: { training: 'Training center', assessment: 'Assessment center' },
    bothKinds: 'Training and assessment centers',
    filters: {
      heading: 'Filters',
      // Read after the heading: "Filters, 2 on".
      count: (n: number) => `${figure(n)} on`,
      clear: 'Clear all',
      hide: 'Hide filters',
      show: 'Show filters',
      type: 'Type',
      location: 'Location',
      region: 'Region',
      province: 'Province',
      qualification: 'Qualification / skills / job',
      more: 'More filters',
      useCurrent: 'Use my current location',
      locationHelp:
        'Your browser asks first. We round your location to about 1 km and never save it. We use it to measure distances and, when you ask for directions, share it with an OpenStreetMap routing service to plan the route.',
      locating: 'Finding your approximate location…',
      locationErrors: {
        denied: 'Location access was declined. Search a place or choose a region instead.',
        unavailable: 'Your location couldn’t be found. Search a place or choose a region instead.',
        unsupported:
          'This browser can’t share a location. Search a place or choose a region instead.',
      },
      place: 'Search location',
      placePlaceholder: 'Enter city, province, or region',
      placeHelp: 'Distances are measured from this place when your own location is off.',
      placeNotFound: (text: string) =>
        `We couldn’t find “${text}”. Try a city, province or region name.`,
      yourLocation: 'Your location',
      anywhere: 'Anywhere',
      allRegions: 'All regions',
      allProvinces: 'All provinces',
      noProvinces: 'No provinces listed yet',
      noProvincesInRegion: 'No provinces listed for this region',
      anyQualification: 'Any qualification',
      addQualification: 'Add a qualification',
      removeQualification: (name: string) => `Remove ${name}`,
      mode: 'Mode of delivery',
      anyMode: 'Any mode',
      modeHelp: 'Applies to training centers.',
      availability: 'Availability',
      anyTime: 'Any time',
      availabilityHelp: 'Programs with a flexible start count as available.',
      scholarship: 'Scholarship available',
      scholarshipHelp:
        'Applies to training centers. A scholarship listed isn’t a guaranteed award.',
    },
    delivery: {
      institution_based: 'In a training center',
      enterprise_based: 'At a workplace',
      community_based: 'In the community',
      online: 'Online',
    },
    availability: { '30': 'Starts within 30 days', '90': 'Starts within 3 months' },
    sortLabel: 'Sort results',
    sorts: { nearest: 'Nearest first', soonest: 'Soonest start', name: 'Name (A–Z)' },
    results: {
      heading: (n: number) => `All results (${figure(n)})`,
      loading: 'Loading centers…',
      // Distances are as the crow flies, from a point that may itself be rounded (US-08).
      distancesFrom: (label: string) => `Approximate distances from ${label}`,
      fromYou: 'your location',
      sortHint: 'Turn on your location or search a place to sort by distance.',
      truncated: 'Some listings aren’t shown. Choose a qualification to narrow your search.',
      none: {
        heading: 'No centers match your search',
        body: 'Try another place or qualification, or select Clear all.',
      },
      // The filters in use, when nothing matches them (US-07).
      active: (filters: readonly string[]) => `Filters on: ${filters.join(' · ')}`,
      others: (n: number) => `Other centers (${figure(n)})`,
      showMore: (n: number) => `Show more (${figure(n)} more)`,
      viewDetails: 'View details',
      viewDetailsOf: (name: string) => `View details: ${name}`,
      mapToggle: { show: 'Show map', hide: 'Hide map' },
    },
    summary: {
      noPrograms: 'No programs listed yet',
      programs: (n: number) => `${figure(n)} ${n === 1 ? 'program' : 'programs'}`,
      nextBatch: (day: string) => `Next batch ${day}`,
      flexible: 'Flexible start',
      noAssessments: 'No upcoming assessments yet',
      assessments: (n: number) => `${figure(n)} upcoming ${n === 1 ? 'assessment' : 'assessments'}`,
      next: (day: string) => `Next ${day}`,
    },
    center: {
      nearest: 'Nearest to you',
      away: (km: string) => `About ${km} away`,
      saved: 'Saved',
      save: 'Save this center',
      unsave: 'Remove from saved centers',
      noLocation: 'No map location on file',
      directions: 'Get directions',
      hideRoute: 'Hide route',
      viewOnMap: 'View on map',
      website: 'Website',
      googleMaps: 'Google Maps',
      googleMapsHelp: 'Turn-by-turn directions in Google Maps',
    },
    routes: {
      finding: 'Finding routes…',
      label: 'Travel mode',
      modes: { car: 'by car', bike: 'by bike', foot: 'on foot', plane: 'in the air' },
      modeNames: { car: 'car', bike: 'bike', foot: 'walking' },
      road: (km: string, time: string, mode: string) => `${km} · about ${time} ${mode}`,
      fromYou: 'From your approximate location, without traffic.',
      flight: (from: string, to: string, time: string) =>
        `${from} to ${to} · about ${time} in the air`,
      flightNote: (between: string, toAirport: string, fromAirport: string) =>
        `An estimate from the ${between} between the airports, not an airline schedule: check airlines for flights and fares. Allow time to reach the airport (${toAirport} from you), check in, and travel ${fromAirport} on to the center.`,
      missing: (modes: readonly string[]) =>
        `No ${modes.join(' or ')} route could be loaded right now.`,
      retry: 'Try again',
      unavailable: 'Directions can’t be loaded right now. Try again shortly, or open Google Maps.',
    },
    programs: {
      heading: (n: number) => `Training programs (${figure(n)})`,
      none: 'No programs are listed here for your search yet.',
      viewAll: 'View all',
      fewer: 'Show fewer',
      details: 'Program details',
      fit: (score: number) => `${score}% fit`,
      scholarship: 'Scholarship available',
      why: 'Why this program?',
      whyNote: 'Fit considers your goal, location, start date and preferences.',
      hours: (n: number) => `${figure(n)} hours`,
      flexibleStart: 'Flexible start',
      starts: (day: string) => `Starts ${day}`,
      started: (day: string) => `Started ${day}`,
      free: 'Free',
      // A cost or fee the listing doesn't give (US-08).
      notProvided: 'Not provided',
    },
    program: {
      where: 'Where',
      how: 'How',
      duration: 'Duration',
      starts: 'Starts',
      ends: 'Ends',
      cost: 'Cost',
      slots: 'Slots',
      learners: (n: number) => `${figure(n)} learners`,
      confirm:
        'Confirm the schedule, fees and requirements with the training center before you enroll.',
      close: 'Close',
    },
    schedules: {
      heading: (n: number) => `Upcoming assessments (${figure(n)})`,
      none: 'No upcoming assessments are listed here for your search yet.',
      timezone: 'Times are in Philippine time.',
      seats: (left: number, slots: number) => `${figure(left)} of ${figure(slots)} seats left`,
      noFee: 'No fee',
      fee: (amount: string) => `${amount} fee`,
      full: 'Fully booked',
      apply: 'Apply',
    },
    // Reviewing an assessment application before it's sent (US-09).
    apply: {
      heading: 'Apply for this assessment',
      qualification: 'Qualification',
      center: 'Assessment center',
      when: 'When',
      philippineTime: 'Philippine time',
      fee: 'Fee',
      review:
        'The assessment center reviews each application. Applying doesn’t reserve a seat: you’ll see the center’s decision in My Progress.',
      submit: 'Send application',
      pending: 'Sending your application…',
      cancel: 'Cancel',
      sent: 'Application sent',
      receipt: (reference: string, status: string) =>
        `Reference ${reference} · Status: ${status}. The center will review it.`,
      statuses: {
        pending: 'Awaiting review',
        approved: 'Approved',
        rejected: 'Not approved',
        withdrawn: 'Withdrawn',
        completed: 'Completed',
      },
      toProgress: 'Go to My Progress',
      close: 'Close',
    },
    map: {
      label: 'Map of training and assessment centers',
      loading: 'Loading the map…',
      none: 'No centers match this search yet.',
      tilesFailed: 'Some map tiles could not load. The list of centers still works.',
      failed: 'The map could not load. The list of centers still works.',
      legend: { training: 'Training center', assessment: 'Assessment center' },
      locate: 'Show centers near me',
      layers: 'Map layers',
      layersButton: 'Layers',
      basemaps: { map: 'Map', light: 'Light', standard: 'OpenStreetMap' },
      yourLocation: 'Your approximate location',
      copy: 'Copy a link to this location',
      copied: 'Link to this location copied.',
      copyFailed: (url: string) => `Couldn’t copy. The link is ${url}`,
      pin: (name: string, kind: string) => `${name}, ${kind.toLowerCase()}`,
      routeLabel: (label: string) => `${label}: show this route`,
    },
  },
  // A count against a total, as screen readers hear "5/8".
  countOf: (count: number, total: number) => `${figure(count)} of ${figure(total)}`,
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
