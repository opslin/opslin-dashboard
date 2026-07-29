import { expect, test } from "@playwright/test";

const requiredEnv = [
  "E2E_BASE_URL",
  "E2E_EMAIL",
  "E2E_PASSWORD",
  "E2E_TEST_APP_ID",
  "E2E_EXPECTED_PREVIEW_DOMAIN",
  "E2E_EXPECTED_CUSTOM_DOMAIN",
  "E2E_EXPECTED_APP_TEXT",
] as const;

function missingEnv() {
  return requiredEnv.filter((name) => !process.env[name]);
}

test("live domain behavior uses managed domains and correct URL scheme", async ({ page, context }) => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing env vars: ${missing.join(", ")}`);

  const baseUrl = process.env.E2E_BASE_URL!;
  const email = process.env.E2E_EMAIL!;
  const password = process.env.E2E_PASSWORD!;
  const appId = process.env.E2E_TEST_APP_ID!;
  const previewDomain = process.env.E2E_EXPECTED_PREVIEW_DOMAIN!;
  const customDomain = process.env.E2E_EXPECTED_CUSTOM_DOMAIN!;
  const expectedText = process.env.E2E_EXPECTED_APP_TEXT!;

  await page.goto(`${baseUrl}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(new RegExp(`${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?$`));

  await page.goto(`${baseUrl}/apps/${appId}`);
  await expect(page.getByRole("heading")).toBeVisible();

  const header = page.locator("body");
  await expect(header).toContainText(customDomain);

  const primaryLink = page.getByRole("link", { name: new RegExp(customDomain) }).first();
  const primaryHref = await primaryLink.getAttribute("href");
  expect(primaryHref).toBeTruthy();
  expect(primaryHref).not.toContain("3.110.182.212");

  await page.getByRole("tab", { name: /domains/i }).click();
  await expect(page.getByText(customDomain)).toBeVisible();
  await expect(page.getByText(previewDomain)).toBeVisible();

  const customLink = page.getByRole("link", { name: new RegExp(customDomain) }).first();
  const customHref = await customLink.getAttribute("href");
  expect(customHref).toMatch(new RegExp(`^https?://${customDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

  const customPagePromise = context.waitForEvent("page");
  await customLink.click();
  const customPage = await customPagePromise;
  await customPage.waitForLoadState("domcontentloaded");
  await expect(customPage.locator("body")).toContainText(expectedText);
  await customPage.close();

  const previewLink = page.getByRole("link", { name: new RegExp(previewDomain) }).first();
  if (await previewLink.count()) {
    const previewHref = await previewLink.getAttribute("href");
    expect(previewHref).toMatch(new RegExp(`^https?://${previewDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const previewPagePromise = context.waitForEvent("page");
    await previewLink.click();
    const previewPage = await previewPagePromise;
    await previewPage.waitForLoadState("domcontentloaded");
    await expect(previewPage.locator("body")).toContainText(expectedText);
    await previewPage.close();
  }
});
