import { test, expect } from "@playwright/test";
import { installDashboardMocks } from "./mock-dashboard";

async function openGitSource(page: Parameters<typeof installDashboardMocks>[0]) {
  await installDashboardMocks(page);
  await page.goto("/apps/new");
  await page.getByTestId("source-github").click();
}

test("GitHub connect button is visible on the new app page", async ({ page }) => {
  await openGitSource(page);

  await expect(page.getByTestId("github-repo-picker")).toBeVisible();
  await expect(page.getByTestId("github-connect-button")).toBeVisible();
});

test("repo picker shows search and repository list", async ({ page }) => {
  await openGitSource(page);

  await expect(page.getByTestId("repo-search")).toBeVisible();
  await expect(page.getByTestId("repo-list")).toBeVisible();

  await page.getByTestId("repo-search").fill("api");
  await expect(page.getByTestId("repo-item-acme-api")).toBeVisible();
  await expect(page.getByTestId("repo-item-acme-worker")).toBeHidden();
});

test("branch dropdown populates after selecting a repository", async ({ page }) => {
  await openGitSource(page);

  await page.getByTestId("repo-item-acme-api").click();

  await expect(page.getByTestId("manual-git-url")).toHaveValue("https://github.com/acme/api.git");
  await expect(page.getByTestId("branch-select")).toBeVisible();
  await expect(page.getByTestId("branch-select")).toContainText("develop");

  await page.getByTestId("branch-select").selectOption("develop");
  await expect(page.getByTestId("branch-select")).toHaveValue("develop");
});

test("manual Git URL fallback still creates a Git app", async ({ page }) => {
  await openGitSource(page);

  await page.getByTestId("source-git-url").click();
  await page.getByTestId("manual-git-url").fill("https://github.com/manual/project.git");
  await page.getByTestId("manual-branch").fill("release");
  await page.getByTestId("continue-to-deploy").click();
  await page.locator("select[required]").selectOption("mock-server-1");
  await page.getByLabel("App Name").fill("Manual Git App");

  const createRequest = page.waitForRequest((request) =>
    request.method() === "POST" &&
    request.url().endsWith("/servers/mock-server-1/apps")
  );
  await page.getByTestId("deploy-button").click();

  const request = await createRequest;
  const body = JSON.parse(request.postData() || "{}");
  expect(body).toMatchObject({
    name: "Manual Git App",
    gitUrl: "https://github.com/manual/project.git",
    branch: "release",
  });
  expect(body.githubInstallationId).toBeUndefined();
  await expect(page).toHaveURL(/\/apps\/mock-app-created$/);
});
