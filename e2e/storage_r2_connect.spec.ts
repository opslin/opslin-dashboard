import { expect, test } from "@playwright/test";
import { authenticateUser } from "./helpers";

// DIL Phase 15 — R2 Storage page. Modeled on teams_rbac_backup.spec.ts's
// lighter "render + key elements visible" shape rather than
// database_create_query.spec.ts's full create-and-poll flow: the full
// connect -> create bucket -> wire -> redeploy path needs a real,
// disposable Cloudflare account (same external dependency Phases 12/13
// logged as unresolved — see DEPLOY_INTELLIGENCE_LAYER_BUILD_STATE.md).
// This spec proves the page and its connect form render and are wired to
// the real API; the founder (or a future session with real Cloudflare
// credentials) should extend it with an E2E_CLOUDFLARE_TOKEN-gated flow
// once one exists, the same way database_create_query.spec.ts needs
// E2E_SERVER_ID.

test("storage page renders the Cloudflare connect form when nothing is connected", async ({ page }) => {
    await authenticateUser(page, `${Date.now()}-storage`);

    await page.goto("/storage");
    await expect(page.getByRole("heading", { name: "Storage" })).toBeVisible();
    await expect(page.getByText(/cloudflare account/i)).toBeVisible();
    await expect(page.getByLabel(/cloudflare api token/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /verify token/i })).toBeVisible();

    // Connect must stay disabled until a token is verified — mirrors
    // backups' own "never save an unverified credential" gating.
    await expect(page.getByRole("button", { name: /^connect$/i })).toBeDisabled();
});

test("an invalid token is rejected by the real API with a visible error, and Connect never becomes enabled", async ({ page }) => {
    await authenticateUser(page, `${Date.now()}-storage-invalid`);

    await page.goto("/storage");
    await page.getByLabel(/cloudflare api token/i).fill("obviously-fake-token-not-real");
    await page.getByRole("button", { name: /verify token/i }).click();

    await expect(page.getByText(/could not verify|invalid|not active/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^connect$/i })).toBeDisabled();
});
