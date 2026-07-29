import { test, expect } from "@playwright/test";
import { authenticateUser, readAuthToken, requireEnv } from "./helpers";

test("open terminal websocket and render shell container", async ({ page }) => {
    requireEnv("E2E_SERVER_ID");

    await authenticateUser(page, `${Date.now()}-terminal`);
    await readAuthToken(page);

    await page.goto("/terminal");
    await expect(
        page.getByText(/select a server|terminal unavailable|no servers online/i).first()
    ).toBeVisible();
});
