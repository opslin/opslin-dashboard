import { test, expect } from "@playwright/test";
import { apiBaseUrl, readAuthToken, registerUser } from "./helpers";

test("register -> login -> dashboard -> /me", async ({ page, request }) => {
    test.skip(
        process.env.E2E_LIVE_AUTH !== "1",
        "Set E2E_LIVE_AUTH=1 when the local API/database auth stack is available"
    );

    const credentials = await registerUser(page, `${Date.now()}-auth`);
    const token = await readAuthToken(page);

    await page.goto("/login");
    await page.getByLabel("Email").fill(credentials.email);
    await page.getByLabel("Password").fill(credentials.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/$/);

    const meResponse = await request.get(`${apiBaseUrl()}/auth/me`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    expect(meResponse.ok()).toBeTruthy();

    const me = await meResponse.json();
    expect(me.email).toBe(credentials.email);
});
