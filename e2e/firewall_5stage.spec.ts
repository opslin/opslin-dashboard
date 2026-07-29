import { expect, test } from "@playwright/test";
import { authenticateUser, requireEnv } from "./helpers";

test("firewall five-stage surface renders and builds a preview", async ({ page }) => {
    const serverId = requireEnv("E2E_FIREWALL_SERVER_ID");

    await authenticateUser(page, `${Date.now()}-firewall`);
    await page.goto(`/servers/${serverId}/security`);

    await expect(page.getByRole("heading", { name: /security/i })).toBeVisible();
    await expect(page.getByText(/1\. discovery/i)).toBeVisible();
    await expect(page.getByText(/2\. policy/i)).toBeVisible();
    await expect(page.getByText(/3\. preview/i)).toBeVisible();
    await expect(page.getByText(/4\. confirmed-commit/i)).toBeVisible();
    await expect(page.getByText(/5\. monitoring/i)).toBeVisible();

    await page.getByRole("button", { name: /scan listening ports/i }).click();
    await page.getByRole("button", { name: /build preview/i }).click();

    await expect(page.getByLabel(/firewall preview commands/i)).toBeVisible();

    if (process.env.E2E_FIREWALL_ALLOW_APPLY === "1") {
        await page.getByRole("button", { name: /apply firewall/i }).click();
        await expect(page.getByText(/job:/i)).toBeVisible();
    }
});
