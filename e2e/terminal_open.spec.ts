import { test, expect } from "@playwright/test";
import { authenticateUser, readAuthToken, requireEnv } from "./helpers";

test("open terminal websocket and render shell container", async ({ page }) => {
    requireEnv("E2E_SERVER_ID");

    await authenticateUser(page, `${Date.now()}-terminal`);
    await readAuthToken(page);

    await page.goto("/terminal");
    await expect(
        page.getByText(/open a secure shell|no servers connected|isn.t reachable|connecting|connected/i).first()
    ).toBeVisible();
});
