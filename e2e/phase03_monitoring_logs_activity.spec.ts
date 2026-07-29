import { expect, test } from "@playwright/test";
import { installDashboardMocks } from "./mock-dashboard";

test("app detail renders the live monitor with current container metrics", async ({ page }) => {
  await installDashboardMocks(page);

  await page.goto("/apps/mock-app-1");

  const monitor = page.getByTestId("app-live-monitor");
  await expect(monitor).toBeVisible();
  await expect(monitor.getByText("37.0%")).toBeVisible();
  await expect(monitor.getByText("container-mock-app-1")).toBeVisible();
});

test("deployment logs use the enhanced virtualized viewer", async ({ page }) => {
  await installDashboardMocks(page);

  await page.goto("/apps/mock-app-1");
  await page.getByRole("button", { name: /view logs/i }).click();

  const deploymentLogs = page.getByTestId("enhanced-log-viewer").nth(1);
  await expect(deploymentLogs).toBeVisible();
  await expect(deploymentLogs.getByTestId("log-line-count")).toContainText("4 of 4 lines");
});

test("enhanced log viewer filters by level and searches text", async ({ page }) => {
  await installDashboardMocks(page);

  await page.goto("/apps/mock-app-1");
  await page.getByRole("button", { name: /view logs/i }).click();
  const deploymentLogs = page.getByTestId("enhanced-log-viewer").nth(1);
  await deploymentLogs.getByLabel("Log level filter").selectOption("error");

  await expect(deploymentLogs.getByTestId("log-line-count")).toContainText("1 of 4 lines");
  await expect(deploymentLogs.getByText("Image generation worker failed")).toBeVisible();

  await deploymentLogs.getByPlaceholder("Search logs").fill("worker failed");
  await expect(deploymentLogs.getByTestId("log-line-count")).toContainText("1 of 4 lines");
});

test("activity page renders and filters organization events", async ({ page }) => {
  await installDashboardMocks(page);

  await page.goto("/activity");

  await expect(page.getByTestId("activity-feed")).toBeVisible();
  await expect(page.getByText("Deployment started for Observability API")).toBeVisible();

  await page.getByLabel("Filter activity by event").fill("server.claim");
  await page.getByRole("button", { name: /apply/i }).click();

  await expect(page.getByText("Server Primary VPS was claimed")).toBeVisible();
  await expect(page.getByText("Deployment started for Observability API")).toHaveCount(0);
});

test("overview shows the mini activity feed", async ({ page }) => {
  await installDashboardMocks(page);

  await page.goto("/");

  await expect(page.getByTestId("mini-activity-feed")).toBeVisible();
  await expect(page.getByText("Deployment started for Observability API")).toBeVisible();
});
