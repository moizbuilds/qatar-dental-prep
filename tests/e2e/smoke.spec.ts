import { test, expect } from "@playwright/test";

/**
 * End-to-end smoke test: log in, run a short topic drill, reach a score.
 * Requires the app running (npm run dev) with the DB loaded and APP_PASSCODE
 * set. Run with: npx playwright test (see playwright.config.ts).
 */

const PASSCODE = process.env.APP_PASSCODE ?? "dentalprep2026";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

test("login, take a 3-question drill, see a score", async ({ page }) => {
  // Unauthenticated visit is redirected to the login page.
  await page.goto(BASE + "/");
  await expect(page).toHaveURL(/\/login/);

  // Log in.
  await page.getByPlaceholder("Enter passcode").fill(PASSCODE);
  await page.getByRole("button", { name: /log in|enter|submit/i }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?$`));

  // Start a 3-question periodontics topic drill.
  await page.goto(BASE + "/quiz");
  await page.getByLabel("Category").selectOption("periodontics");
  await page.getByLabel("Number of questions").fill("3");
  await page.getByRole("button", { name: "Start topic drill" }).click();

  // Answer each question: pick the first choice, submit, advance.
  for (let i = 0; i < 3; i++) {
    await expect(page.getByRole("heading").first()).toBeVisible();
    // The choice buttons are the answer options; click the first one.
    await page.getByRole("button").filter({ hasNotText: /Submit|Next|Finish/ }).first().click();
    await page.getByRole("button", { name: "Submit" }).click();
    const next = page.getByRole("button", { name: i < 2 ? "Next question" : "Finish" });
    await expect(next).toBeVisible();
    await next.click();
  }

  // Score screen shows a percentage and a Pass/Fail verdict.
  await expect(page.getByText(/of 3 correct/i)).toBeVisible();
  await expect(page.getByText(/^(Pass|Fail)$/)).toBeVisible();
});
