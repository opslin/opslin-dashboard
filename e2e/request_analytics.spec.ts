import { expect, test } from "@playwright/test";
import { authenticateUser, requireEnv } from "./helpers";

test("request analytics panels render on the app detail page", async ({ page }) => {
    const appId = requireEnv("E2E_REQUEST_ANALYTICS_APP_ID");

    await authenticateUser(page, `${Date.now()}-request-analytics`);
    await page.goto(`/apps/${appId}`);

    await expect(page.getByText(/request analytics/i)).toBeVisible();
    await expect(page.getByText(/live feed/i)).toBeVisible();
    await expect(page.getByText(/latency percentiles/i)).toBeVisible();
    await expect(page.getByText(/slowest endpoints/i)).toBeVisible();
});
