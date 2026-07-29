import { expect, test } from "@playwright/test";
import { installDashboardMocks } from "./mock-dashboard";

test("dashboard v2 supports keyboard-only navigation and command palette flow", async ({ page }) => {
    const modKey = process.platform === "darwin" ? "Meta" : "Control";
    const paletteInput = page.getByPlaceholder("Search navigation, commands, apps, databases...");
    await installDashboardMocks(page);
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible();

    await page.keyboard.press(`${modKey}+K`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await paletteInput.fill("Observability API");
    await expect(page.getByRole("option", { name: /Observability API/i })).toBeVisible();
    await page.getByRole("option", { name: /Observability API/i }).press("Enter");
    await expect(page).toHaveURL(/\/apps\/mock-app-1$/);
    await expect(page.getByRole("heading", { name: /observability api/i })).toBeVisible();
    await expect(page.getByText(/abcdef1/i)).toBeVisible();

    await page.keyboard.press(`${modKey}+K`);
    await page.keyboard.type("Deploy Current App");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /deploying application/i })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.keyboard.press(`${modKey}+K`);
    await paletteInput.fill("Rollback Current App");
    await expect(page.getByRole("option", { name: /Rollback Current App/i })).toBeVisible();
    await page.getByRole("option", { name: /Rollback Current App/i }).press("Enter");
    await expect(page.getByRole("heading", { name: /rolling back deployment/i })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.keyboard.press(`${modKey}+K`);
    await page.keyboard.type("Open Runtime Logs");
    await page.keyboard.press("Enter");
    await expect(page.locator("#app-runtime-observability")).toBeVisible();

    await page.keyboard.press(`${modKey}+K`);
    await paletteInput.fill("Go to Monitoring");
    await expect(page.getByRole("option", { name: /Go to Monitoring/i })).toBeVisible();
    await page.getByRole("option", { name: /Go to Monitoring/i }).press("Enter");
    await expect(page).toHaveURL(/\/monitoring$/);
    await expect(page.getByText(/apps by cpu \/ memory/i)).toBeVisible();

    await page.keyboard.press(`${modKey}+K`);
    await paletteInput.fill("Go to Overview");
    await expect(page.getByRole("option", { name: /Go to Overview/i })).toBeVisible();
    await page.getByRole("option", { name: /Go to Overview/i }).press("Enter");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible();
});
