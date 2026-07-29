import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installDashboardMocks } from "./mock-dashboard";

const routes = [
  { path: "/", heading: /overview/i },
  { path: "/servers/mock-server-1", heading: /prod vps 01/i },
  { path: "/deployments", heading: /deployments/i },
  { path: "/monitoring", heading: /system monitor/i },
  { path: "/settings", heading: /settings/i },
];

test.describe("dashboard accessibility", () => {
  for (const routeConfig of routes) {
    test(`axe has no serious violations on ${routeConfig.path}`, async ({ page }) => {
      await installDashboardMocks(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(routeConfig.path);
      await expect(page.getByRole("heading", { name: routeConfig.heading })).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
