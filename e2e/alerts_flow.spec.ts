import { expect, test } from "@playwright/test";
import { apiBaseUrl, authenticateUser, requireEnv, readAuthToken } from "./helpers";

test("alerts dashboard and public status surfaces render", async ({ page, request }) => {
    const appId = requireEnv("E2E_ALERTS_APP_ID");

    await authenticateUser(page, `${Date.now()}-alerts`);
    await page.goto("/alerts");

    await expect(page.getByText(/firing now/i)).toBeVisible();
    await expect(page.getByText(/rule editor/i)).toBeVisible();
    await expect(page.getByText(/configured rules/i)).toBeVisible();

    const token = await readAuthToken(page);
    const appsResponse = await request.get(`${apiBaseUrl()}/servers`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    expect(appsResponse.ok()).toBeTruthy();

    const statusResponse = await request.get(`${apiBaseUrl()}/status/${appId}`);
    expect(statusResponse.status()).toBe(200);
    expect(statusResponse.headers()["cache-control"]).toContain("s-maxage=60");
});
