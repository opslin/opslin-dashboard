import { expect, test, type Page } from "@playwright/test";

const mockUser = {
    id: "user-1",
    email: "phase04@example.com",
    name: "Phase 04 User",
    onboardingCompleted: true,
    createdAt: "2026-04-26T01:00:00.000Z",
    organizationId: "personal-user-1",
    organizationName: "Personal Organization",
    organizationSlug: "personal-user-1",
    orgRole: "OWNER",
    memberships: [{
        organizationId: "personal-user-1",
        name: "Personal Organization",
        slug: "personal-user-1",
        role: "OWNER",
    }],
};

async function mockAuthenticatedSettings(page: Page) {
    await page.addInitScript(() => {
        localStorage.setItem("token", "phase04-token");
    });

    await page.route("**/servers", async (route) => {
        if (route.request().resourceType() === "document") {
            return route.fallback();
        }
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([]),
        });
    });

    await page.route("**/auth/me", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(mockUser),
        });
    });

    await page.route("**/plans/current", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                plan: {
                    id: "plan-business",
                    slug: "business",
                    name: "Business",
                    priceMonthly: 1499,
                    gstPercent: 18,
                    priceWithGst: 1769,
                    currency: "INR",
                    maxServers: 10,
                    maxApps: 50,
                    maxDatabases: 10,
                    features: {
                        ssl: true,
                        gitDeploy: true,
                        backups: true,
                        alerts: true,
                        rbac: true,
                        auditLog: true,
                        prioritySupport: true,
                        monitoring: "extended",
                    },
                    isPublic: true,
                    sortOrder: 3,
                },
                pendingPlan: null,
                subscription: {
                    id: "subscription-1",
                    status: "active",
                    paymentRequired: false,
                    trialStart: null,
                    trialEnd: null,
                    currentPeriodEnd: null,
                    cancelledAt: null,
                },
                usage: {
                    servers: 0,
                    apps: 0,
                    databases: 0,
                },
                trial: null,
            }),
        });
    });

    await page.route("**/plans/usage", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                usage: {
                    servers: 0,
                    apps: 0,
                    databases: 0,
                },
                limits: {
                    servers: -1,
                    apps: -1,
                    databases: -1,
                },
                plan: {
                    id: "plan-business",
                    slug: "business",
                    name: "Business",
                    priceMonthly: 1499,
                    gstPercent: 18,
                    priceWithGst: 1769,
                    currency: "INR",
                    maxServers: 10,
                    maxApps: 50,
                    maxDatabases: 10,
                    features: {
                        ssl: true,
                        gitDeploy: true,
                        backups: true,
                        alerts: true,
                        rbac: true,
                        auditLog: true,
                        prioritySupport: true,
                        monitoring: "extended",
                    },
                    isPublic: true,
                    sortOrder: 3,
                },
            }),
        });
    });
}

test.describe("phase 04 security UX", () => {
    test("session list shows in settings", async ({ page }) => {
        await mockAuthenticatedSettings(page);
        await page.route("**/auth/sessions", async (route) => {
            if (route.request().method() !== "GET") {
                return route.fallback();
            }
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([
                    {
                        id: "session-1",
                        device: "Chrome on macOS",
                        ip: "127.0.0.1",
                        lastActive: "2026-04-26T01:10:00.000Z",
                        createdAt: "2026-04-26T01:00:00.000Z",
                        isCurrent: true,
                    },
                ]),
            });
        });

        await page.goto("/settings");
        await expect(page.getByTestId("session-manager")).toBeVisible();
        await expect(page.getByText("Chrome on macOS")).toBeVisible();
    });

    test("log out all redirects to login", async ({ page }) => {
        await mockAuthenticatedSettings(page);
        await page.route("**/auth/sessions", async (route) => {
            const method = route.request().method();
            if (method === "GET") {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        {
                            id: "session-1",
                            device: "Chrome on macOS",
                            ip: "127.0.0.1",
                            lastActive: "2026-04-26T01:10:00.000Z",
                            createdAt: "2026-04-26T01:00:00.000Z",
                            isCurrent: true,
                        },
                    ]),
                });
                return;
            }

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ success: true, revokedSessions: 1 }),
            });
        });

        await page.goto("/settings");
        await page.getByTestId("revoke-all-sessions").click();
        await expect(page).toHaveURL(/\/login$/);
    });

    test("agent version warning shows on the server card", async ({ page }) => {
        await mockAuthenticatedSettings(page);
        await page.route("**/servers", async (route) => {
            if (route.request().resourceType() === "document") {
                return route.fallback();
            }
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([
                    {
                        id: "server-1",
                        name: "Legacy Agent",
                        ip: "10.0.0.12",
                        status: "connected",
                        isLiveConnected: true,
                        agentVersion: "2.0.9",
                        agentVersionWarning: true,
                        createdAt: "2026-04-26T01:00:00.000Z",
                    },
                ]),
            });
        });

        await page.goto("/servers");
        await expect(page.getByText("Upgrade agent")).toBeVisible();
    });
});
