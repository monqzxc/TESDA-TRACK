const {
  chromium,
  expect,
} = require("../frontend/node_modules/@playwright/test");
const { AxeBuilder } = require("../frontend/node_modules/@axe-core/playwright");
const fs = require("node:fs"),
  path = require("node:path");
const OUT = path.join(__dirname, "../reports/us20-20261106"),
  BASE = "http://127.0.0.1:5187";
const results = [];
async function journey(browser, tsp, signedIn = false) {
  const result = {
    journey: signedIn ? "account" : tsp ? "tsp" : "regular",
    mocked: false,
    errors: [],
    apiErrors: [],
    screenshots: [],
    checks: {},
  };
  results.push(result);
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("tesda-track.privacy-notice", "2026-10-21");
    if (!localStorage.getItem("tesda-track.theme"))
      localStorage.setItem("tesda-track.theme", "light");
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);
  let analysisCalls = 0;
  page.on("pageerror", (e) => result.errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") result.errors.push(m.text());
  });
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /(\/analysis\/(goal|matches|readiness|pathway)|\/recommendations\/report)$/.test(
        r.url(),
      )
    )
      analysisCalls++;
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400)
      result.apiErrors.push({ url: r.url(), status: r.status() });
  });
  try {
    if (signedIn) {
      const credentials = JSON.parse(
        fs.readFileSync(
          path.join(
            process.env.USERPROFILE,
            ".codex/private/tesda-track-phase5-reviewer.json",
          ),
          "utf8",
        ),
      );
      await page.goto(BASE + "/sign-in?next=" + encodeURIComponent("/find"));
      await page.locator('input[name="email"]').fill(credentials.email);
      await page.locator('input[name="password"]').fill(credentials.password);
      await page
        .locator("form")
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await page.waitForURL("**/find");
    }
    await page.goto(BASE + (tsp ? "/tsp/webview" : "/find"));
    await page
      .getByLabel("Your career interests or skills")
      .fill("web developer");
    await page
      .getByRole("button", {
        name: tsp ? "Find my match" : "Find my pathways",
        exact: true,
      })
      .click();
    if (tsp)
      await page
        .getByRole("button", { name: "Show my matches", exact: true })
        .click();
    await page
      .getByRole("button", {
        name: tsp ? "Am I ready?" : "Check my readiness",
        exact: true,
      })
      .first()
      .click();
    if (tsp) {
      for (let i = 0; i < 100; i++) {
        await page
          .getByRole("button", { name: "A little", exact: true })
          .click();
        const next = page.getByRole("button", {
          name: /^Next skill$|^See recommendation$/,
        });
        const last = (await next.innerText()) === "See recommendation";
        await next.click();
        if (last) break;
      }
    } else {
      for (let part = 0; part < 6; part++) {
        const groups = page.locator('[data-tour="readiness-question"]');
        await groups.first().waitFor();
        for (const group of await groups.all())
          await group
            .getByText("I have some experience", { exact: true })
            .click();
        const next = page.getByRole("button", {
          name: /^Next:|^Analyze my skills$/,
        });
        const last = (await next.innerText()) === "Analyze my skills";
        await next.click();
        if (last) break;
      }
    }
    await page.waitForURL(
      tsp ? "**/tsp/webview/recommendation" : "**/find/pathway",
    );
    const region = page.locator('[data-tour="related-occupations"]');
    await region.waitFor();
    await page
      .getByText(/^Preparing your report/)
      .first()
      .waitFor({ state: "hidden", timeout: 60000 });
    await expect(
      page.getByRole("heading", {
        name: "TESDA qualifications for your pathway",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      region.getByRole("link", { name: /^Find training centers:/ }).first(),
    ).toBeVisible();
    await expect(page.getByLabel('Labor-market region')).toHaveCount(0);
    await expect(region.getByText(/^Source and document references/)).toHaveCount(0);
    const evidence=await (await ctx.request.get(BASE+'/api/v1/labor-market/indicators?qualification_code=WEB-DEVELOPMENT-NC-III&region_code=NCR')).json();
    const expectedDemandOccupations=new Set(evidence.items.map(item=>item.occupation_key));
    await expect(region.locator('[data-tour="occupation-demand"]')).toHaveCount(expectedDemandOccupations.size);
    await expect(
      region.getByRole("button", {
        name: "Set as My Goal: Web Developer",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      region.getByRole("button", {
        name: "Set as My Goal: Programming",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      region
        .getByRole("link", {
          name: "Occupation source: TESDA Skills Map with Training Regulations (2020)",
        })
        .first(),
    ).toBeVisible();
    result.checksNational = {
      regionSelectorRemoved: true,
      sourceDisclosureRemoved: true,
      noUnapprovedDemandClaim: true,
      sourceBackedOccupation: true,
    };
    await page.setViewportSize({ width: 1440, height: 1600 });
    await region.scrollIntoViewIfNeeded();
    await region.screenshot({
      path: path.join(OUT, `${result.journey}-web-developer.png`),
    });
    const titles = await region
      .getByRole("button", { name: /^Set as My Goal:/ })
      .evaluateAll((els) =>
        els.map((e) =>
          e.getAttribute("aria-label").replace("Set as My Goal: ", ""),
        ),
      );
    expect(titles.length).toBeGreaterThan(1);
    result.occupations = titles;
    const state = () =>
      page.evaluate(
        () => JSON.parse(sessionStorage.getItem("tesda-track.finder")).state,
      );
    const before = await state();
    await page.waitForTimeout(500);
    const callsBefore = analysisCalls;
    const goalsBefore = signedIn
      ? await (await ctx.request.get(BASE + "/api/v1/me/goals")).json()
      : null;
    await region
      .getByRole("button", {
        name: `Set as My Goal: ${titles[0]}`,
        exact: true,
      })
      .click();
    await expect(
      region.getByRole("button", {
        name: `Goal Selected: ${titles[0]}`,
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await region
      .getByRole("button", {
        name: `Set as My Goal: ${titles[1]}`,
        exact: true,
      })
      .click();
    await expect(
      region.getByRole("button", { name: /^Goal Selected:/ }),
    ).toHaveCount(1);
    await expect(
      region.getByRole("button", {
        name: `Set as My Goal: ${titles[0]}`,
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.waitForTimeout(500);
    expect(analysisCalls).toBe(callsBefore);
    if (signedIn) {
      const accountGoals = await (
        await ctx.request.get(BASE + "/api/v1/me/goals")
      ).json();
      expect(accountGoals.length).toBe(goalsBefore.length + 1);
      const created = accountGoals.find(
        (g) => !goalsBefore.some((old) => old.id === g.id),
      );
      expect(created.title).toBe(titles[1]);
      expect(created.target_qualification.code).toBe(before.selected);
      result.accountPersistence = {
        oneGoalCreated: true,
        switchUpdatedSameGoal: true,
        goalId: created.id,
      };
    }
    const after = await state();
    expect(after.journey).toEqual(before.journey);
    expect(after.selected).toBe(before.selected);
    expect(after.checks).toEqual(before.checks);
    expect(after.answers).toEqual(before.answers);
    result.checks = {
      removedStandalone: true,
      oneActiveGoal: true,
      goalSwitch: true,
      noAnalysisRerun: true,
      preservedReadiness: true,
    };
    await page.reload();
    await region.waitFor();
    await page
      .getByText(/^Preparing your report/)
      .first()
      .waitFor({ state: "hidden", timeout: 60000 });
    await expect(
      region.getByRole("button", {
        name: `Goal Selected: ${titles[1]}`,
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    result.checks.refreshPersistence = true;
    // The saved goal is also the default expanded occupation after refresh.
    if (
      await page
        .getByRole("button", { name: "Hide for now", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "Hide for now", exact: true })
        .click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: path.join(OUT, `${result.journey}-desktop-light.png`),
      fullPage: true,
    });
    result.screenshots.push(`${result.journey}-desktop-light.png`);
    await page.setViewportSize({ width: 1440, height: 1400 });
    await region.scrollIntoViewIfNeeded();
    await region.screenshot({
      path: path.join(OUT, `${result.journey}-occupations-desktop.png`),
    });
    const desktop = await new AxeBuilder({ page })
      .include('[data-tour="related-occupations"]')
      .analyze();
    result.desktopAccessibility = desktop.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.failureSummary),
    }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      localStorage.setItem("tesda-track.theme", "dark");
    });
    await page.reload();
    await region.waitFor();
    await page
      .getByText(/^Preparing your report/)
      .first()
      .waitFor({ state: "hidden", timeout: 60000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    result.checks.mobileNoOverflow = true;
    if (
      await page
        .getByRole("button", { name: "Hide for now", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "Hide for now", exact: true })
        .click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: path.join(OUT, `${result.journey}-mobile-dark.png`),
      fullPage: true,
    });
    result.screenshots.push(`${result.journey}-mobile-dark.png`);
    const mobile = await new AxeBuilder({ page })
      .include('[data-tour="related-occupations"]')
      .analyze();
    result.mobileAccessibility = mobile.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.failureSummary),
    }));
    // Restore light and check filtered training navigation, then return to the saved selection.
    const link = region
      .getByRole("link", { name: /^Find training centers:/ })
      .first();
    result.trainingHref = await link.getAttribute("href");
    expect(
      new URL(result.trainingHref, BASE).searchParams.get("qualification"),
    ).toBe(after.selected);
    await link.click();
    await page.waitForURL(tsp ? "**/tsp/webview/training**" : "**/training**");
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    result.checks.trainingNavigation = true;
    await page.goBack();
    await region.waitFor();
    await page
      .getByText(/^Preparing your report/)
      .first()
      .waitFor({ state: "hidden", timeout: 60000 });
    await expect(
      region.getByRole("button", {
        name: `Goal Selected: ${titles[1]}`,
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    result.checks.backPersistence = true;
    result.status = "passed";
  } catch (e) {
    result.status = "failed";
    result.failure = e.stack;
    await page
      .screenshot({
        path: path.join(OUT, `${result.journey}-failure.png`),
        fullPage: true,
      })
      .catch(() => {});
  } finally {
    fs.writeFileSync(
      path.join(OUT, "browser-results.json"),
      JSON.stringify(results, null, 2),
    );
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await journey(browser, false);
    await journey(browser, true);
    await journey(browser, false, true);
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some((r) => r.status !== "passed")) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
