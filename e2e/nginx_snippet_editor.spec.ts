import { expect, test } from "@playwright/test";
import { authenticateUser, requireEnv } from "./helpers";

test("nginx snippet editor validates and saves a snippet", async ({ page }) => {
    const appId = requireEnv("E2E_NGINX_APP_ID");
    const shortcut = process.platform === "darwin" ? "Meta+A" : "Control+A";

    await authenticateUser(page, `${Date.now()}-nginx`);
    await page.goto(`/apps/${appId}/nginx`);

    await expect(page.getByRole("heading", { name: /nginx engine/i })).toBeVisible();

    const editor = page.locator(".monaco-editor").first();
    await editor.click({ position: { x: 120, y: 16 } });
    await page.keyboard.press(shortcut);
    await page.keyboard.insertText("add_header X-Phase4 play always;");

    await page.getByRole("button", { name: /validate/i }).click();
    await expect(page.getByText(/validation passed/i)).toBeVisible();

    await page.getByRole("button", { name: /save \+ reload/i }).click();
    await expect(page.getByText(/saved and reloaded/i)).toBeVisible();
});
