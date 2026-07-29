import { test, expect } from "@playwright/test";
import { authenticateUser, requireEnv } from "./helpers";

test("install -> agent registers -> claim page claims server", async ({ page }) => {
    const claimToken = requireEnv("E2E_CLAIM_TOKEN");

    await authenticateUser(page, `${Date.now()}-claim`);
    await page.goto(`/claim/${claimToken}`);
    await expect(page.getByRole("button", { name: /claim this server/i })).toBeVisible();
    await page.getByRole("button", { name: /claim this server/i }).click();
    await expect(page).toHaveURL(/\/servers/);
});
