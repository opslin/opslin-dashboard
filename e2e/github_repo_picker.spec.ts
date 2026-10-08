import { test, expect } from "@playwright/test";
import { installDashboardMocks } from "./mock-dashboard";

async function openImport(page: Parameters<typeof installDashboardMocks>[0]) {
  await installDashboardMocks(page);
  await page.goto("/apps/new");
  await expect(page.getByRole("heading", { name: "Let's deploy your project" })).toBeVisible({ timeout: 30_000 });
}

test("import step offers GitHub, Drop files and Git URL", async ({ page }) => {
  await openImport(page);

  await expect(page.getByTestId("source-github")).toBeVisible();
  await expect(page.getByTestId("source-upload")).toBeVisible();
  await expect(page.getByTestId("source-git")).toBeVisible();
  await expect(page.getByText("Or drop a folder or .zip here")).toBeVisible();
});

test("repo list can be searched and one click opens the review step", async ({ page }) => {
  await openImport(page);

  await page.getByLabel("Search your repositories").fill("api");
  await expect(page.getByTestId("repo-acme/api")).toBeVisible();
  await expect(page.getByTestId("repo-acme/worker")).toBeHidden();

  await page.getByTestId("repo-acme/api").click();
  await expect(page.getByRole("heading", { name: "Looks good. Ready to go live?" })).toBeVisible();
  await expect(page.getByText("acme/api")).toBeVisible();
  await expect(page.getByTestId("deploy-server")).toHaveText("Prod VPS 01");
});

test("manual Git URL still creates a classic Git app", async ({ page }) => {
  await openImport(page);

  await page.getByTestId("source-git").click();
  await page.getByTestId("manual-git-url").fill("https://github.com/manual/project.git");
  await page.getByLabel("Branch").fill("release");
  await page.getByTestId("continue-button").click();
  await page.getByLabel("Project name").fill("Manual Git App");

  const createRequest = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/servers/mock-server-1/apps"));
  await page.getByTestId("deploy-button").click();

  const body = JSON.parse((await createRequest).postData() || "{}");
  expect(body).toMatchObject({ name: "Manual Git App", gitUrl: "https://github.com/manual/project.git", branch: "release" });
  expect(body.githubInstallationId).toBeUndefined();
  await expect(page).toHaveURL(/\/apps\/mock-app-created$/, { timeout: 30_000 });
});
