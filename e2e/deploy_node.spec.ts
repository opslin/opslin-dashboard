import { test, expect } from "@playwright/test";
import {
    authenticateUser,
    getJson,
    postJson,
    readAuthToken,
    requireEnv,
} from "./helpers";

test("create app from repo -> deploy -> progress modal appears", async ({ page, request }) => {
    const serverId = requireEnv("E2E_SERVER_ID");
    const gitUrl = requireEnv("E2E_DEPLOY_GIT_URL");

    await authenticateUser(page, `${Date.now()}-deploy`);
    const token = await readAuthToken(page);

    const createResponse = await postJson(
        request,
        `/servers/${serverId}/apps`,
        token,
        {
            name: `pw-node-${Date.now()}`,
            gitUrl,
            branch: process.env.E2E_DEPLOY_BRANCH || "main",
        }
    );
    expect(createResponse.ok()).toBeTruthy();

    const createdApp = await createResponse.json();
    await page.goto(`/apps/${createdApp.id}`);
    await page.getByRole("button", { name: /^Deploy$/ }).click();
    await expect(page.getByText("Deploying Application")).toBeVisible();

    const logsResponse = await getJson(
        request,
        `/servers/${serverId}/apps/${createdApp.id}/logs`,
        token
    );
    expect(logsResponse.ok()).toBeTruthy();
});
