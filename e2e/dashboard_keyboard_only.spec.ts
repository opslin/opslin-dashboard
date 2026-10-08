import { expect, test } from "@playwright/test";
import { installDashboardMocks } from "./mock-dashboard";

test("dashboard v2 supports keyboard-only navigation and command palette flow", async ({ page }) => {
    const modKey = process.platform === "darwin" ? "Meta" : "Control";
    const paletteInput = page.getByPlaceholder("Search navigation, commands, apps, databases...");
    await installDashboardMocks(page);
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /^apps$/i, level: 1 })).toBeVisible();

    await page.keyboard.press(`${modKey}+K`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await paletteInput.fill("Observability API");
    await expect(page.getByRole("option", { name: /Observability API/i })).toBeVisible();
    await page.getByRole("option", { name: /Observability API/i }).press("Enter");
    // First visit compiles /apps/[id] under `next dev`, which can exceed the default 5s.
    await expect(page).toHaveURL(/\/apps\/mock-app-1$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /observability api/i, level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/abcdef1/i).first()).toBeVisible();

    await page.keyboard.press(`${modKey}+K`);
    await page.keyboard.type("Deploy Current App");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /^deploying /i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.keyboard.press(`${modKey}+K`);
    await paletteInput.fill("Rollback Current App");
    await expect(page.getByRole("option", { name: /Rollback Current App/i })).toBeVisible();
    await page.getByRole("option", { name: /Rollback Current App/i }).press("Enter");
    // Rollback asks for confirmation first (an alertdialog) before any progress UI.
    await expect(page.getByRole("heading", { name: /^roll back to version/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();

    await page.keyboard.press(`${modKey}+K`);
    await page.keyboard.type("Open Runtime Logs");
    await page.keyboard.press("Enter");
    await expect(page.locator("#deployment-logs")).toBeVisible();

    await page.keyboard.press(`${modKey}+K`);
    await paletteInput.fill("Go to Monitoring");
    await expect(page.getByRole("option", { name: /Go to Monitoring/i })).toBeVisible();
    await page.getByRole("option", { name: /Go to Monitoring/i }).press("Enter");
    await expect(page).toHaveURL(/\/monitoring$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /system monitor/i, level: 1 })).toBeVisible();

    await page.keyboard.press(`${modKey}+K`);
    await paletteInput.fill("Go to Overview");
    await expect(page.getByRole("option", { name: /Go to Overview/i })).toBeVisible();
    await page.getByRole("option", { name: /Go to Overview/i }).press("Enter");
    await expect(page).toHaveURL(/\/overview$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /^overview$/i, level: 1 })).toBeVisible();
});
