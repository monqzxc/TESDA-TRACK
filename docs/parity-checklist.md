# Parity checklist: the new TESDA Track at /beta/

The new TESDA Track runs at `/beta/` next to the current app at `/`. Before it replaces the current app, check
that it does everything the current app does, on a computer and on a phone. This checklist follows the current
app's pages and the [learner user stories](user-stories.md) (US-01 to US-15).

Tick an item when it works at `/beta/` as described. Where an item says **same as current**, open the current app
at `/` and compare the two. If something doesn't work, report it (see [Reporting a problem](#reporting-a-problem)).

## Before you start

- **Addresses.** The current app is at `https://<your site>/` and the new one at `https://<your site>/beta/`.
- **Sign in to each app separately.** The two apps keep sign-in separately, so signing in to one doesn't sign you
  in to the other.
- **Use test accounts, not real learners' accounts.** Create a learner account in the new app for testing. For
  Reports you need an administrator account: ask whoever runs the server to create one
  (`python -m tesda_track.cli create-admin`).
- **Listings are examples.** Training and assessment centers whose names start with `[Seed]` are example data.
- **Devices.** Test on a computer (Chrome, Edge or Firefox) and on a phone (Chrome on Android, Safari on an iPhone).
- **Themes.** Test in light and dark. The System / Light / Dark switch is at the bottom of the sidebar (on a phone,
  open **Menu**).

## Reporting a problem

Send:

1. The page and its address.
2. What you did, step by step.
3. What you expected, and what happened instead.
4. Your device, browser and theme (light or dark).
5. A screenshot, if you can take one.

Don't include real learners' names, email addresses or goals.

## 1. Every page

- [ ] On a computer, the sidebar shows every page: Home, Find my pathway, Qualifications Library, Training &
      Assessment, My Progress and Skills Explorer, plus Reports for administrators.
- [ ] On a phone, **Menu** opens the same links. Escape, the close button, or a tap outside closes it.
- [ ] Each page has its own address. Back and Forward work, and reloading stays on the same page.
- [ ] The System / Light / Dark switch changes the theme. All text is easy to read in both themes.
- [ ] On a phone, nothing makes the whole page scroll sideways. Wide tables scroll inside their own box. (US-13)
- [ ] At 200% browser zoom, forms and buttons can still be read and used. (US-13)
- [ ] With the keyboard alone (Tab, Shift+Tab, Enter, Space, Escape), you can reach and use every link, button,
      field and dialog. You can always see where you are, and you never get stuck in a dialog. (US-13)
- [ ] Errors and states are shown in words or icons, not by color alone. (US-13)
- [ ] An address that doesn't exist (for example `/beta/nothing-here`) shows **Page not found** with a way back.
- [ ] With the internet turned off, a page says it can't reach TESDA Track and offers **Try again**. Once you're
      back online, Try again loads the page. (US-14)

## 2. Home (`/beta/`)

- [ ] The top bar's **How it works**, **Near you**, **Qualifications** and **My progress** scroll to their sections.
- [ ] Typing a goal in the box at the top and pressing the button opens **Find my pathway** with the goal filled in.
      The goal doesn't appear in the address bar.
- [ ] An empty goal shows a message beside the box, and you stay on Home.
- [ ] The goal box takes at most 500 characters.
- [ ] The readiness example can be answered with the mouse and with the arrow keys.
- [ ] Sections appear as you scroll. With "reduce motion" turned on in your device settings, everything shows at
      once, without animation.
- [ ] After opening another page and pressing Back, Home returns to where you were.
- [ ] **Same as current:** the sections and figures match the current Home.

## 3. Find my pathway (`/beta/find`)

### Your goal (US-01)

- [ ] The step explains what to do in one sentence, with one main button. You don't need an account.
- [ ] The examples and the sample goals fill the box, but don't submit it. (US-01)
- [ ] An empty goal shows an instruction beside the box, and the page stays as it is. (US-01)
- [ ] A goal in Filipino or Taglish, such as "Gusto kong maging welder", gets sensible matches.
- [ ] After **Get Recommendation**, the goal stays visible at the top, with **Change goal**. (US-01)
- [ ] A changed goal, once submitted, clears the answers and results from the old one. (US-01)
- [ ] The step tabs: later steps open only once there's a goal. Back and Next move between steps.

### Your match (US-03)

- [ ] The starting point shows the career goal, experience, certification and detected intent. **Same as current.**
- [ ] When the goal doesn't mention experience or certification, two questions ask for them, and the matches
      update with your answers. "I'm not sure" isn't shown as a certification you hold. (US-03)
- [ ] Each match shows the qualification, the jobs it leads to, the reason for the match and a goal-match
      percentage, described as guidance, not a guarantee. (US-03)
- [ ] With no clear match, the page says so, keeps your goal, and offers the Qualifications Library. (US-03)
- [ ] **Or choose any qualification to explore** lets you pick any qualification, and the page shows it as your
      choice. (US-03)
- [ ] **View all qualifications** opens the Qualifications Library.

### Readiness check (US-06)

- [ ] **Why we ask** explains the route your experience suggests.
- [ ] The questions come in parts (Basic, Common, Core skills), with a count of how many you've rated. (US-06)
- [ ] **Previous part** and **Next** keep your answers. (US-06)
- [ ] **Analyze my skills** with skills still unrated says how many are left and where, and shows no result.
      (US-06)
- [ ] With the internet turned off, **Analyze my skills** shows a message and keeps your answers. (US-14)

### Your pathway (US-06, US-07)

- [ ] The recommendation shows your readiness percentage, its level, your strengths and the skills to improve, and
      says the score is self-reported, not an official assessment. (US-06)
- [ ] After you change answers, the page tells your last submitted result apart from the changes you haven't
      analyzed yet. (US-06)
- [ ] The main button opens Training & Assessment with this qualification and the right kind of center already
      chosen, even if you searched Training & Assessment before. (US-07)
- [ ] The pathway's steps show. Signed in, **Follow this pathway** adds it to My Progress, and pressing it again
      says you're already following it.
- [ ] Signed in as an administrator, **Recommendation diagnostics** shows the details behind the recommendation.

### Saving your journey (US-02)

- [ ] As a guest, **Save to profile** asks you to sign in. After signing in, you're back on the same step, and My
      Progress shows the goal, the chosen qualification and any readiness check you'd submitted. (US-02)
- [ ] Saving again, or reloading the page, doesn't create the same records twice. (US-02)
- [ ] Signed in, the page says your results are saved to My Progress.
- [ ] Signing out clears your goal and results from the page. (US-02)

## 4. Qualifications Library (`/beta/qualifications`) (US-04)

- [ ] It shows 12 qualifications a page, the number found, **Previous** and **Next**, and "Page 1 of …". (US-04)
- [ ] Search finds qualifications by name, code, sector and career. **Same as current:** the same words find the
      same qualifications.
- [ ] The sector filter works with the search. A new search or sector goes back to page 1. (US-04)
- [ ] **Clear filters** shows the whole catalog again. A search with no results says so and offers to clear.
      (US-04)
- [ ] Each card shows the sector, name, careers, NC level, number of competencies and, where there is one, the
      next NC level. **View sample competencies** opens the list.
- [ ] The search, sector and page stay in the address, so Back and shared links return to the same results.
      (US-04)
- [ ] **Explore this pathway** opens Find my pathway with "I want to pursue …" in the goal box, not yet submitted.
      **Same as current.**

## 5. Training & Assessment (`/beta/training`)

### Filters (US-07)

- [ ] Center type (training, assessment or both), region, province, qualification (several can be added and
      removed), mode of delivery, availability and scholarship all narrow the list.
- [ ] The filters show how many are on, and **Clear all** removes them. On a phone, **Show filters** and **Hide
      filters** fold them away.
- [ ] Opened from Find my pathway, the page names the chosen qualification and keeps a location you'd already
      shared. (US-07)
- [ ] With filters that match nothing, the page says which filters are on and how to broaden them. (US-07)
- [ ] The filters stay in the address, so Back and shared links return to the same results.

### Location (US-08)

- [ ] **Use my current location**, allowed, sorts by nearest and labels distances as approximate, from your
      location. (US-08)
- [ ] **Use my current location**, refused or failed, shows a message, and the list and the other filters still
      work. The page doesn't keep asking. (US-08)
- [ ] **Search location** with a city, province or region measures distances from there. A place it can't find
      gets a message.

### Results (US-08, US-12)

- [ ] **All results** counts the centers. **Sort results** offers nearest first, soonest start, and name.
- [ ] Each center shows its name, place, type and what it offers. **View details** opens it with the keyboard,
      without using the map. (US-08)
- [ ] Centers with no location on file are still listed, without a distance or directions. (US-08)
- [ ] An unknown cost or fee reads "Not provided", and a recorded zero reads "Free" or "No fee". A listed
      scholarship isn't described as guaranteed. (US-08)
- [ ] **Same as current:** the same filters list the same centers.

### Map (US-08)

- [ ] Pins show each center, grouped when they're close together. A pin opens a summary, and **View details**
      opens that center in the list.
- [ ] **Layers** changes the map style, **Locate me** shows your location, and the legend explains the pin colors.
- [ ] **Hide map** leaves the whole list working. When map pictures fail to load, the list still works. (US-08)
- [ ] The bookmark saves a center for this visit.

### A center's details

- [ ] Contact details and the website link show where the center has them.
- [ ] **Get directions** with your location draws the route on the map, by car, bike, on foot, or as a flight
      estimate for far places, and says it's from your approximate location, without traffic. **Hide route**
      removes it.
- [ ] Without your location, **Get directions** opens Google Maps.
- [ ] Programs show a fit percentage when a qualification is chosen, with **Why this program?**. **Program details**
      opens a dialog that asks you to confirm schedules and fees with the center.
- [ ] Assessment schedules show the date and time in Philippine time, the seats left and the fee. A full schedule
      says **Fully booked**.

### Applying for an assessment (US-09)

- [ ] As a guest, **Apply** asks you to sign in, then brings you back to the same schedule without sending
      anything. (US-09)
- [ ] Signed in, **Apply** first shows the qualification, center, date and time (Philippine time), and the fee or
      "Not provided", and explains that the center reviews applications. (US-09)
- [ ] **Send application** shows a receipt with a reference and status, and a link to My Progress. (US-09)
- [ ] Applying again for the same schedule says you've already applied, and doesn't show a false success. (US-09)

## 6. My Progress (`/beta/progress`)

- [ ] Signed out, the page invites you to sign in.
- [ ] **Continue your journey** names your saved goal and qualification and offers one next step. With no records,
      it leads to Find my pathway. (US-10)
- [ ] The figures (saved recommendations, readiness checks, latest readiness) match your records. **Same as
      current.**
- [ ] **Readiness over time** lists your checks with dates. You can pick a qualification and compare two of its
      checks. With fewer than two, the page explains how to compare. When two checks asked about different skills,
      it says their scores can't be compared like for like. The scores are labelled self-reported. (US-11)
- [ ] **Recommendation history** shows each goal with its date, qualification and route. Opening one continues
      that journey in Find my pathway. (US-10)
- [ ] A record whose qualification is no longer in the catalog says so, and the record stays. (US-10)
- [ ] **My pathways:** ticking a step updates the percentage. Completed pathways show as achievements. (US-10)
- [ ] **My assessment applications:** the status is in words, with the result and the center's note where there is
      one. **Withdraw** asks you to confirm that application, then shows its new status. (US-09)
- [ ] **My goals:** you can add a goal, with an optional target qualification, and mark it achieved.
- [ ] **My certifications:** you can add one (title, related qualification, number, date issued). Each shows
      "Self-reported" or "Verified". (US-12)

## 7. Your account

- [ ] **Sign in** opens a sign-in dialog. A wrong password shows an error message, and the dialog stays open.
- [ ] After signing in, your name replaces Sign in, and you're still on the same page.
- [ ] **Create an account** asks for your name, email and a password of at least 10 characters, shows the privacy
      notice, and needs your agreement.
- [ ] The account menu shows your name, email and account type (learner or administrator).
- [ ] **Download my data (JSON)** downloads a file with your records.
- [ ] **Delete my account** asks you to confirm, deletes the account and its records, and signs you out.
- [ ] **Sign out** signs you out, and your personal results leave the page. (US-02)
- [ ] Signing in or out in one tab shows in your other tabs.
- [ ] When a session expires, the page says to sign in again, and nothing it couldn't save is shown as saved.
      (US-14)
- [ ] `/beta/sign-in` signs you in on a page of its own, then returns you where you were going.

## 8. Skills Explorer (`/beta/skills`) (US-12)

- [ ] Opening the page doesn't send anything to Skills Bridge. (US-12)
- [ ] The page explains that only skill and role words are sent, never your sentence, name, email or records.
      (US-12)
- [ ] An empty box asks you to describe your skills. A sentence with no usable words, too many terms (more than
      25) or a very long term gets a message.
- [ ] The results show the terms searched, the source and when it was retrieved, how your words were treated
      (roles or skills), any terms not found, and **How your skills were understood**.
- [ ] Each occupation shows its match percentage (title match or skill match), described as not a readiness
      score, and open job posts when Skills Bridge records any.
- [ ] **Explore skills & qualifications** opens the occupation: its qualifications, a preview of its skills to
      tick off as ones you already have (with a running count), and its international mappings, described as not
      a certification equivalency. (US-12)
- [ ] **Find TESDA training & assessment options** shows the matching TESDA qualification, or says there's no
      match yet. **Show available sites** shows them on a map and in a list, and **Open in Training & Assessment**
      opens them there.
- [ ] When Skills Bridge can't answer, the page says so and reminds you the rest of TESDA Track still works.
- [ ] **Same as current:** the same sentence gives the same occupations and qualifications.

## 9. Reports (`/beta/reports`, administrators)

- [ ] Only administrators see Reports in the sidebar. Anyone else who opens the address is told it isn't
      available.
- [ ] **From** and **To** set the period. An end date before the start date shows a message and loads nothing.
      **Clear dates** removes both.
- [ ] The figures (learners, saved recommendations, readiness checks, average readiness, verified certifications,
      open assessment seats) match the current app for the same dates. **Same as current.**
- [ ] **Learner journey** shows each stage's count with a bar, or says there was no activity in the period.
- [ ] **Demand by qualification** lists the qualifications with activity in the period, busiest first, and says
      how many had none. The counts match the current app's non-zero rows. **Same as current.**
- [ ] **Skill gaps:** typing in **Qualification** finds a qualification. The table shows each competency's answers
      and gap rate, or says there were no responses.
- [ ] **Training and assessment supply by region** matches the current app. **Same as current.**
- [ ] The period and the chosen qualification stay in the address.

## Known differences (not problems)

The new app does these things differently on purpose:

- Each app has its own sign-in.
- Every page has its own address. Back, Forward, reloading and shared links work. The current app always goes
  back to Home.
- A journey in Find my pathway survives reloading the page, in the same browser tab.
- The readiness check asks you to rate every skill before it gives a result. The current app gave a result from
  the skills you'd rated.
- Applying for an assessment shows a review step before the application is sent, then a receipt.
- My Progress adds **Continue your journey**, comparing two readiness checks, and a confirmation before
  withdrawing an application.
- In Skills Explorer, each occupation has its own **Explore skills & qualifications** button. The current app
  has one list to pick from.
- Reports' demand table leaves out qualifications with no activity. The current app lists every qualification.
- The theme switch is in the sidebar. The current app's is in Streamlit's own menu.
- On a phone, the sidebar opens from the **Menu** button.

## Not in either app yet (don't report these as problems)

- Comparing a shortlist of two or three qualifications (US-05).
- Filipino interface text (US-15). Goals can already be written in Filipino or Taglish.
- An NC level filter in the Qualifications Library (US-04).
- Source and verification dates on each listing, and a notice that the listings are example data (US-12).

## Sign-off

| Tester | Date | Device and browser | Theme | Sections tested | Problems reported |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |
