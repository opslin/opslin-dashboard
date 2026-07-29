import { expect, test } from "@playwright/test";
import { authenticateUser, requireEnv } from "./helpers";

test("teams page and database backup controls render", async ({ page }) => {
    const databaseId = requireEnv("E2E_DATABASE_ID");
    const serverId = requireEnv("E2E_SERVER_ID");

    await authenticateUser(page, `${Date.now()}-teams-backup`);

    await page.goto("/teams");
    await expect(page.getByText(/team members/i)).toBeVisible();
    await expect(page.getByText(/pending invites/i)).toBeVisible();

    await page.goto(`/databases/${databaseId}?server=${serverId}`);
    await expect(page.getByText(/backups/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /save schedule/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /run backup now/i })).toBeVisible();
});
