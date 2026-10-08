import { expect, test } from "@playwright/test";
import { installDashboardMocks } from "./mock-dashboard";

test("agent update modal switches to queued tracking after approval", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "pro" });

  await page.goto("/servers/mock-server-1");
  await page.getByRole("button", { name: /update available|agent update/i }).click();
  await expect(page.getByText("What's new in v2.0.1")).toBeVisible();

  await page.getByRole("button", { name: "Update now" }).click();

  await expect(page.getByRole("heading", { name: "Updating agent" })).toBeVisible();
  await expect(page.getByText(/Queue position 1 · About 5s/)).toBeVisible();
});

test("new app flow shows secure deploy profile before first deploy", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "pro" });

  await page.goto("/apps/new?server=mock-server-1");
  await page.getByTestId("source-git-url").click();
  await page.getByTestId("manual-git-url").fill("https://github.com/acme/site.git");
  await page.getByTestId("manual-branch").fill("main");
  await page.getByTestId("continue-to-deploy").click();

  await expect(page.getByText("Secure deploy profile selected")).toBeVisible();
  await expect(page.getByText("Private 127.0.0.1")).toBeVisible();
  await expect(page.getByText("Managed Nginx edge", { exact: true })).toBeVisible();
  await expect(page.getByText("No public runtime ports")).toBeVisible();
});
