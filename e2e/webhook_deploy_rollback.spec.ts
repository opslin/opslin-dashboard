import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
    apiBaseUrl,
    authenticateUser,
    postJson,
    readAuthToken,
    requireEnv,
} from "./helpers";

function githubSignature(body: string, secret: string) {
    return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

test("webhook -> deploy -> rollback renders deployment history flow", async ({ page, request }) => {
    const serverId = requireEnv("E2E_SERVER_ID");
    const gitUrl = requireEnv("E2E_DEPLOY_GIT_URL");
    const webhookSecret = requireEnv("E2E_WEBHOOK_SECRET");
    const rollbackVersion = requireEnv("E2E_ROLLBACK_VERSION");
    const branch = process.env.E2E_DEPLOY_BRANCH || "main";

    await authenticateUser(page, `${Date.now()}-webhook`);
    const token = await readAuthToken(page);

    const createResponse = await postJson(
        request,
        `/servers/${serverId}/apps`,
        token,
        {
            name: `pw-webhook-${Date.now()}`,
            gitUrl,
            branch,
            envVars: {
                GITHUB_WEBHOOK_SECRET: webhookSecret,
            },
        }
    );
    expect(createResponse.ok()).toBeTruthy();

    const createdApp = await createResponse.json();
    const sha = `pw${Date.now().toString(36)}`;
    const rawBody = JSON.stringify({
        ref: `refs/heads/${branch}`,
        after: sha,
        sender: { login: "playwright" },
    });

    const webhookResponse = await request.post(
        `${apiBaseUrl()}/hooks/${serverId}/${createdApp.id}/deploy`,
        {
            data: rawBody,
            headers: {
                "content-type": "application/json",
                "x-hub-signature-256": githubSignature(rawBody, webhookSecret),
            },
        }
    );
    expect(webhookResponse.ok()).toBeTruthy();

    await page.goto(`/apps/${createdApp.id}`);
    await expect(page.getByRole("heading", { name: /deployment history/i })).toBeVisible();
    await expect(page.getByText(sha.slice(0, 7))).toBeVisible();

    const rollbackResponse = await postJson(
        request,
        `/apps/${createdApp.id}/rollback`,
        token,
        {
            toVersion: rollbackVersion,
        }
    );
    expect(rollbackResponse.ok()).toBeTruthy();

    await page.reload();
    await expect(page.getByRole("heading", { name: /deployment history/i })).toBeVisible();
});
