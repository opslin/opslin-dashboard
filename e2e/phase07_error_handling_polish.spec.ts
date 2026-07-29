import { expect, test } from "@playwright/test";
import { installDashboardMocks } from "./mock-dashboard";

test("failed deployments show the classified error card", async ({ page }) => {
  await installDashboardMocks(page, { appStatus: "error" });

  await page.goto("/apps/mock-app-1");

  await expect(page.getByTestId("deploy-error-card")).toBeVisible();
  await expect(page.getByText("HEALTH_CHECK_FAILED")).toBeVisible();
  await expect(page.getByText(/Ensure the health path returns HTTP 200/)).toBeVisible();
});

test("retry deploy triggers a new deployment request from the error card", async ({ page }) => {
  await installDashboardMocks(page, { appStatus: "error" });

  await page.goto("/apps/mock-app-1");
  await expect(page.getByTestId("deploy-error-card")).toBeVisible();

  const deployRequest = page.waitForResponse((response) =>
    response.url().includes("/servers/mock-server-1/apps/mock-app-1/deploy") &&
    response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /retry deploy/i }).click();

  await expect((await deployRequest).status()).toBe(200);
});

test("API key creation flow shows the generated key once", async ({ page }) => {
  await installDashboardMocks(page);

  await page.goto("/settings");
  const manager = page.getByTestId("api-key-manager");
  await expect(manager).toBeVisible();
  await manager.getByLabel("Name").fill("GitHub Actions deploy key");
  await manager.getByTestId("create-api-key-button").click();

  await expect(manager.getByText(/opl_live_mockSecret/)).toBeVisible();
  await expect(manager.getByText("GitHub Actions deploy key")).toBeVisible();
});

test("unverified users are blocked from creating apps with a verification prompt", async ({ page }) => {
  await installDashboardMocks(page, { emailVerified: false });

  await page.goto("/apps/new?server=mock-server-1");
  await page.getByTestId("source-git-url").click();
  await page.getByTestId("manual-git-url").fill("https://github.com/acme/unverified-app.git");
  await page.getByTestId("continue-to-deploy").click();
  await page.getByTestId("deploy-button").click();

  await expect(page.getByText("Verify your email before creating apps.")).toBeVisible();
});
