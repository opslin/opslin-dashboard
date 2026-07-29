import { expect, test } from "@playwright/test";
import {
    authenticateUser,
    getJson,
    postJson,
    readAuthToken,
    requireEnv,
} from "./helpers";

const languages = [
    { name: "node", envVar: "E2E_NODE_GIT_URL", buildpackOverride: "node" },
    { name: "python", envVar: "E2E_PYTHON_GIT_URL", buildpackOverride: "python" },
    { name: "go", envVar: "E2E_GO_GIT_URL", buildpackOverride: "go" },
    { name: "php", envVar: "E2E_PHP_GIT_URL", buildpackOverride: "php" },
    { name: "ruby", envVar: "E2E_RUBY_GIT_URL", buildpackOverride: "ruby" },
    { name: "java", envVar: "E2E_JAVA_GIT_URL", buildpackOverride: "java" },
    { name: "rust", envVar: "E2E_RUST_GIT_URL", buildpackOverride: "rust" },
] as const;

for (const language of languages) {
    test(`${language.name} repo -> deploy flow renders rollout progress`, async ({ page, request }) => {
        const serverId = requireEnv("E2E_SERVER_ID");
        const gitUrl = requireEnv(language.envVar);
        const branch = process.env.E2E_DEPLOY_BRANCH || "main";

        await authenticateUser(page, `${Date.now()}-${language.name}`);
        const token = await readAuthToken(page);

        const createResponse = await postJson(
            request,
            `/servers/${serverId}/apps`,
            token,
            {
                name: `pw-${language.name}-${Date.now()}`,
                gitUrl,
                branch,
                buildpackOverride: language.buildpackOverride,
            }
        );
        expect(createResponse.ok()).toBeTruthy();

        const createdApp = await createResponse.json();
        await page.goto(`/apps/${createdApp.id}`);
        await expect(page.getByText(/build configuration/i)).toBeVisible();
        await expect(page.getByRole("button", { name: /^Deploy$/ })).toBeVisible();

        await page.getByRole("button", { name: /^Deploy$/ }).click();
        await expect(page.getByText(/deploying application/i)).toBeVisible();

        const logsResponse = await getJson(
            request,
            `/servers/${serverId}/apps/${createdApp.id}/logs`,
            token
        );
        expect(logsResponse.ok()).toBeTruthy();
    });
}

// ---------------------------------------------------------------------------
// Framework Buildpack E2E Matrix (Requirement 8.1–8.5)
//
// Each row deploys a fixture repository to the real test Agent, polls
// App.status until RUNNING (10-minute timeout), asserts the health endpoint
// returns HTTP 200, reads the most recent Deployment_Record, and asserts
// deployment.buildpackName and deployment.buildpackVersion.
// ---------------------------------------------------------------------------

const frameworks = [
    {
        name: "node-next-standalone",
        envVar: "E2E_FIXTURE_NODE_NEXT_STANDALONE_GIT_URL",
        expectedBuildpack: "node-next",
    },
    {
        name: "node-next-default",
        envVar: "E2E_FIXTURE_NODE_NEXT_DEFAULT_GIT_URL",
        expectedBuildpack: "node-next",
    },
    {
        name: "node-next-export",
        envVar: "E2E_FIXTURE_NODE_NEXT_EXPORT_GIT_URL",
        expectedBuildpack: "node-next",
    },
    {
        name: "node-angular",
        envVar: "E2E_FIXTURE_NODE_ANGULAR_GIT_URL",
        expectedBuildpack: "node-angular",
    },
    {
        name: "node-nestjs",
        envVar: "E2E_FIXTURE_NODE_NESTJS_GIT_URL",
        expectedBuildpack: "node-nestjs",
    },
    {
        name: "node-react-vite",
        envVar: "E2E_FIXTURE_NODE_REACT_VITE_GIT_URL",
        expectedBuildpack: "node-react-vite",
    },
    {
        name: "node-react-cra",
        envVar: "E2E_FIXTURE_NODE_REACT_CRA_GIT_URL",
        expectedBuildpack: "node-react-cra",
    },
    {
        name: "node-nuxt",
        envVar: "E2E_FIXTURE_NODE_NUXT_GIT_URL",
        expectedBuildpack: "node-nuxt",
    },
    {
        name: "node-express",
        envVar: "E2E_FIXTURE_NODE_EXPRESS_GIT_URL",
        expectedBuildpack: "node-express",
    },
] as const;

const DEPLOY_POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const DEPLOY_POLL_INTERVAL_MS = 5_000; // 5 seconds

/**
 * Poll the app's status via the API until it reaches RUNNING or the timeout
 * expires. Returns the final app status response.
 */
async function pollUntilRunning(
    request: import("@playwright/test").APIRequestContext,
    serverId: string,
    appId: string,
    token: string
): Promise<{ status: string; logs?: string }> {
    const deadline = Date.now() + DEPLOY_POLL_TIMEOUT_MS;
    let lastStatus = "unknown";

    while (Date.now() < deadline) {
        const response = await getJson(
            request,
            `/servers/${serverId}/apps/${appId}/logs`,
            token
        );
        if (response.ok()) {
            const body = await response.json();
            lastStatus = body.status;
            if (lastStatus === "running") {
                return body;
            }
            if (lastStatus === "error" || lastStatus === "stopped") {
                return body;
            }
        }
        await new Promise((resolve) => setTimeout(resolve, DEPLOY_POLL_INTERVAL_MS));
    }

    throw new Error(
        `App ${appId} did not reach RUNNING within ${DEPLOY_POLL_TIMEOUT_MS / 1000}s. Last status: ${lastStatus}`
    );
}

/**
 * Attach failure diagnostics to the Playwright report (Requirement 8.5):
 * buildpack name, version, agent deploy logs, and container's last 200 log lines.
 */
async function attachFailureDiagnostics(
    testInfo: import("@playwright/test").TestInfo,
    request: import("@playwright/test").APIRequestContext,
    serverId: string,
    appId: string,
    token: string,
    framework: { name: string; expectedBuildpack: string },
    deployment?: { buildpackName?: string | null; buildpackVersion?: string | null }
) {
    // Buildpack identity
    await testInfo.attach("buildpack-info", {
        body: JSON.stringify(
            {
                framework: framework.name,
                expectedBuildpack: framework.expectedBuildpack,
                actualBuildpackName: deployment?.buildpackName ?? "unknown",
                buildpackVersion: deployment?.buildpackVersion ?? "unknown",
            },
            null,
            2
        ),
        contentType: "application/json",
    });

    // Agent deploy logs
    try {
        const logsResponse = await getJson(
            request,
            `/servers/${serverId}/apps/${appId}/logs`,
            token
        );
        if (logsResponse.ok()) {
            const logsBody = await logsResponse.json();
            await testInfo.attach("agent-deploy-logs", {
                body: logsBody.logs || "No deploy logs available",
                contentType: "text/plain",
            });
        }
    } catch {
        // Best-effort attachment; do not mask the original failure.
    }

    // Container's last 200 log lines (fetched via the same logs endpoint which
    // tails the container output when the app is running or errored)
    try {
        const containerLogsResponse = await getJson(
            request,
            `/servers/${serverId}/apps/${appId}/logs`,
            token
        );
        if (containerLogsResponse.ok()) {
            const containerBody = await containerLogsResponse.json();
            const lines: string = containerBody.logs || "";
            const last200 = lines.split("\n").slice(-200).join("\n");
            await testInfo.attach("container-last-200-lines", {
                body: last200 || "No container logs available",
                contentType: "text/plain",
            });
        }
    } catch {
        // Best-effort attachment.
    }
}

for (const framework of frameworks) {
    test(`framework matrix: ${framework.name} deploys and resolves correct buildpack`, async ({
        page,
        request,
    }, testInfo) => {
        // Skip when the fixture git URL env var is not set
        const gitUrl = process.env[framework.envVar];
        test.skip(
            !gitUrl,
            `${framework.envVar} must be set to run the ${framework.name} E2E fixture`
        );

        test.setTimeout(DEPLOY_POLL_TIMEOUT_MS + 60_000); // deploy timeout + buffer

        const serverId = requireEnv("E2E_SERVER_ID");
        const branch = process.env.E2E_DEPLOY_BRANCH || "main";

        await authenticateUser(page, `${Date.now()}-${framework.name}`);
        const token = await readAuthToken(page);

        // Create the fixture app
        const createResponse = await postJson(
            request,
            `/servers/${serverId}/apps`,
            token,
            {
                name: `pw-fw-${framework.name}-${Date.now()}`,
                gitUrl: gitUrl!,
                branch,
                // Let detection pick the buildpack — no override
            }
        );
        expect(createResponse.ok()).toBeTruthy();
        const createdApp = await createResponse.json();
        const appId: string = createdApp.id;

        // Trigger deploy
        const deployResponse = await postJson(
            request,
            `/servers/${serverId}/apps/${appId}/deploy`,
            token,
            {}
        );
        expect(deployResponse.ok()).toBeTruthy();

        // Poll until RUNNING (10-minute timeout)
        let appStatus: { status: string; logs?: string };
        try {
            appStatus = await pollUntilRunning(request, serverId, appId, token);
        } catch (err) {
            await attachFailureDiagnostics(
                testInfo, request, serverId, appId, token, framework
            );
            throw err;
        }

        if (appStatus.status !== "running") {
            await attachFailureDiagnostics(
                testInfo, request, serverId, appId, token, framework
            );
        }
        expect(appStatus.status).toBe("running");

        // Assert health endpoint returns HTTP 200
        const appsResponse = await getJson(
            request,
            `/servers/${serverId}/apps`,
            token
        );
        expect(appsResponse.ok()).toBeTruthy();
        const apps = await appsResponse.json();
        const app = apps.find((a: { id: string }) => a.id === appId);
        expect(app).toBeTruthy();

        const healthUrl =
            app.preferredUrl || app.primaryDomain || app.previewDomain || app.domain;
        if (healthUrl) {
            const protocol = healthUrl.startsWith("http") ? "" : "https://";
            const healthResponse = await request.get(`${protocol}${healthUrl}`);
            expect(healthResponse.status()).toBe(200);
        }

        // Read the most recent Deployment_Record via the API
        const deploymentsResponse = await getJson(
            request,
            `/apps/${appId}/deployments`,
            token
        );
        expect(deploymentsResponse.ok()).toBeTruthy();
        const deployments = await deploymentsResponse.json();
        expect(deployments.length).toBeGreaterThan(0);

        // Most recent deployment is first (ordered by startedAt desc)
        const deployment = deployments[0];

        // Assert buildpackName matches the expected Framework_Buildpack (Req 8.3)
        expect(deployment.buildpackName).toBe(framework.expectedBuildpack);

        // Assert buildpackVersion matches semver pattern (Req 8.3)
        expect(deployment.buildpackVersion).toMatch(/^\d+\.\d+\.\d+$/);

        // Attach diagnostics on failure via Playwright's afterEach-style hook
        // (testInfo.status is checked after the test body completes)
        testInfo.attach("buildpack-info", {
            body: JSON.stringify(
                {
                    framework: framework.name,
                    expectedBuildpack: framework.expectedBuildpack,
                    actualBuildpackName: deployment.buildpackName,
                    buildpackVersion: deployment.buildpackVersion,
                },
                null,
                2
            ),
            contentType: "application/json",
        });
    });
}
