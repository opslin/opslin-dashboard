import { expect, test } from "@playwright/test";
import { authenticateUser, requireEnv } from "./helpers";

test("monitoring dashboard and app observability surfaces render", async ({ page }) => {
    const appId = requireEnv("E2E_OBSERVABILITY_APP_ID");

    await authenticateUser(page, `${Date.now()}-observability`);

    await page.goto("/monitoring");
    await expect(page.getByText(/apps by cpu \/ memory/i)).toBeVisible();

    await page.goto(`/apps/${appId}`);
    await expect(page.getByText(/runtime observability/i)).toBeVisible();
    await expect(page.getByText(/runtime logs/i)).toBeVisible();
});
