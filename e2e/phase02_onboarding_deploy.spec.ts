import { expect, test } from "@playwright/test";
import { installDashboardMocks } from "./mock-dashboard";

test("new users without servers see the onboarding wizard", async ({ page }) => {
  await installDashboardMocks(page, { onboardingCompleted: false, serverMode: "none" });

  await page.goto("/apps");

  await expect(page.getByTestId("onboarding-step-server")).toBeVisible();
  await expect(page.getByText("Connect your first server")).toBeVisible();
  await expect(page.locator("code", { hasText: /\/agent\/install \| sudo bash$/ })).toBeVisible();
  await expect(page.locator("code", { hasText: /\/agent\/install\/macos \| bash$/ })).toBeVisible();
});

test("new users without servers can open settings before onboarding", async ({ page }) => {
  await installDashboardMocks(page, {
    onboardingCompleted: false,
    serverMode: "none",
    emailVerified: false,
  });

  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.locator("[data-slot='card-title']", { hasText: "Profile" })).toBeVisible();
  await expect(page.locator("[data-slot='card-title']", { hasText: "Email Verification" })).toBeVisible();
  await expect(page.getByTestId("plan-settings")).toBeVisible();
  await expect(page.getByTestId("session-manager")).toBeVisible();
  await expect(page.getByTestId("onboarding-step-server")).toHaveCount(0);
  await expect(page.getByText("Connect your first server")).toHaveCount(0);
});

test("new users without servers can open pricing before onboarding", async ({ page }) => {
  await installDashboardMocks(page, { onboardingCompleted: false, serverMode: "none" });

  await page.goto("/pricing");

  await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();
  await expect(page.getByTestId("pricing-plan-grid")).toBeVisible();
  await expect(page.getByTestId("onboarding-step-server")).toHaveCount(0);
});

test("returning users bypass onboarding", async ({ page }) => {
  await installDashboardMocks(page);

  await page.goto("/apps");

  await expect(page.getByTestId("onboarding-step-server")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Apps" })).toBeVisible();
});

test("simplified app creation auto-generates name and starts deploy", async ({ page }) => {
  await installDashboardMocks(page);

  await page.goto("/apps/new");
  await page.getByTestId("source-git-url").click();
  await page.getByTestId("manual-git-url").fill("https://github.com/acme/image-generator.git");
  await page.getByTestId("continue-to-deploy").click();

  await expect(page.getByTestId("app-name")).toHaveValue("image-generator");
  await page.locator("select[required]").selectOption("mock-server-1");

  const createRequest = page.waitForRequest((request) =>
    request.method() === "POST" &&
    request.url().endsWith("/servers/mock-server-1/apps")
  );
  await page.getByTestId("deploy-button").click();

  const request = await createRequest;
  const body = JSON.parse(request.postData() || "{}");
  expect(body).toMatchObject({
    name: "image-generator",
    gitUrl: "https://github.com/acme/image-generator.git",
    branch: "main",
  });
  await expect(page).toHaveURL(/\/apps\/mock-app-created$/);
});

test("deploy action opens the progress stepper", async ({ page }) => {
  await installDashboardMocks(page, { appStatus: "stopped" });

  await page.goto("/apps/mock-app-1");
  await page.getByRole("button", { name: /^Deploy$/ }).click();

  await expect(page.getByTestId("deploy-progress")).toBeVisible();
  await expect(page.getByTestId("deploy-stage-cloning")).toBeVisible();
  await expect(page.getByTestId("deploy-stage-building")).toBeVisible();
});

test("deploy progress exposes expandable build logs", async ({ page }) => {
  await installDashboardMocks(page, { appStatus: "stopped" });

  await page.goto("/apps/mock-app-1");
  await page.getByRole("button", { name: /^Deploy$/ }).click();
  await page.getByTestId("build-logs-toggle").click();

  await expect(page.getByTestId("build-log-panel")).toBeVisible();
  await expect(page.getByTestId("build-log-panel").getByText("Booting server")).toBeVisible({ timeout: 5000 });
});
