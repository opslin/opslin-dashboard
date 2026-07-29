import type { Page, Route } from "@playwright/test";
import { apiBaseUrl } from "./helpers";

const now = "2026-04-23T12:00:00.000Z";
const base = apiBaseUrl().replace(/\/$/, "");

type MutableState = {
  user: {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    orgRole: "OWNER";
    preferences: { newDashboard: boolean };
    onboardingCompleted: boolean;
    memberships: Array<{
      organizationId: string;
      name: string;
      slug: string;
      role: "OWNER";
    }>;
    emailVerified: boolean;
  };
  appStatus: "running" | "deploying" | "stopped" | "error";
  appHealth: "healthy" | "unhealthy" | "unknown";
  serverMode: "connected" | "none";
  planSlug: "free" | "starter" | "pro" | "business";
  pendingPlanSlug: "pro" | "business" | null;
  trialDaysRemaining: number | null;
  apiKeys: Array<{
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
  }>;
  agentUpdateJob: null | {
    id: string;
    type: string;
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
    createdAt: string;
    startedAt: string | null;
    endedAt: string | null;
    queueState: string;
    queuePosition: number | null;
    jobsAhead: number | null;
    estimatedStartSeconds: number | null;
    progress: {
      phase: string | null;
      percent: number | null;
      message: string | null;
      status: string | null;
      elapsedMs: number | null;
    } | null;
    result?: unknown;
    error?: string | null;
  };
};

const planCatalog = {
  free: {
    id: "plan-free",
    slug: "free",
    name: "Free",
    priceMonthly: 0,
    gstPercent: 18,
    priceWithGst: 0,
    currency: "INR",
    maxServers: 1,
    maxApps: 3,
    maxDatabases: 0,
    features: {
      ssl: false,
      gitDeploy: false,
      backups: false,
      alerts: false,
      rbac: false,
      auditLog: false,
      prioritySupport: false,
      monitoring: "basic",
      sso: false,
      sla: false,
      compliance: false,
    },
    isPublic: true,
    sortOrder: 0,
  },
  starter: {
    id: "plan-starter",
    slug: "starter",
    name: "Starter",
    priceMonthly: 299,
    gstPercent: 18,
    priceWithGst: 353,
    currency: "INR",
    maxServers: 1,
    maxApps: 5,
    maxDatabases: 2,
    features: {
      ssl: true,
      gitDeploy: true,
      backups: false,
      alerts: false,
      rbac: false,
      auditLog: false,
      prioritySupport: false,
      monitoring: "basic",
      sso: false,
      sla: false,
      compliance: false,
    },
    isPublic: true,
    sortOrder: 1,
  },
  pro: {
    id: "plan-pro",
    slug: "pro",
    name: "Pro",
    priceMonthly: 799,
    gstPercent: 18,
    priceWithGst: 943,
    currency: "INR",
    maxServers: 3,
    maxApps: 15,
    maxDatabases: 5,
    features: {
      ssl: true,
      gitDeploy: true,
      backups: true,
      alerts: true,
      rbac: false,
      auditLog: false,
      prioritySupport: false,
      monitoring: "extended",
      sso: false,
      sla: false,
      compliance: false,
    },
    isPublic: true,
    sortOrder: 2,
  },
  business: {
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
      sso: false,
      sla: false,
      compliance: false,
    },
    isPublic: true,
    sortOrder: 3,
  },
} as const;

function currentUsage(state: MutableState) {
  const hasServer = state.serverMode !== "none";
  return {
    servers: hasServer ? 1 : 0,
    apps: hasServer ? 1 : 0,
    databases: hasServer && state.planSlug !== "free" ? 1 : 0,
  };
}

function currentPlanResponse(state: MutableState) {
  const plan = planCatalog[state.planSlug];
  const pendingPlan = state.pendingPlanSlug ? planCatalog[state.pendingPlanSlug] : null;
  const startedAt = state.trialDaysRemaining === null ? null : "2026-01-01T00:00:00.000Z";
  const endsAt = state.trialDaysRemaining === null
    ? null
    : new Date(Date.parse(now) + state.trialDaysRemaining * 24 * 60 * 60 * 1000).toISOString();

  return {
    plan,
    pendingPlan,
    subscription: {
      id: "subscription-1",
      status: state.trialDaysRemaining === null ? "active" : "trialing",
      paymentRequired: Boolean(state.pendingPlanSlug),
      trialStart: startedAt,
      trialEnd: endsAt,
      currentPeriodEnd: endsAt,
      cancelledAt: null,
    },
    usage: currentUsage(state),
    trial: state.trialDaysRemaining === null
      ? null
      : {
          status: "trialing",
          startedAt,
          endsAt,
          daysRemaining: state.trialDaysRemaining,
          isExpired: state.trialDaysRemaining < 0,
          isInGracePeriod: state.trialDaysRemaining < 0 && state.trialDaysRemaining > -14,
          graceEndsAt: new Date(Date.parse(endsAt || now) + 14 * 24 * 60 * 60 * 1000).toISOString(),
          warningLevel: state.trialDaysRemaining <= 1 ? "1d" : state.trialDaysRemaining <= 7 ? "7d" : null,
        },
  };
}

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

function currentServerMetrics() {
  return {
    timestamp: now,
    cpu: { percent: 42, cores: 8, loadAvg: [1.42, 1.13, 0.92] },
    memory: { used: 7_100_000_000, free: 8_900_000_000, total: 16_000_000_000, cached: 2_100_000_000, percent: 44 },
    disk: { used: 180_000_000_000, total: 512_000_000_000, percent: 35 },
    network: { bytesIn: 123_000_000, bytesOut: 94_000_000 },
    uptime: 432000,
  };
}

function serverHistory() {
  const timestamps = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.parse(now) - (11 - index) * 5 * 60 * 1000);
    return date.toISOString();
  });

  return {
    range: "1h",
    startTime: timestamps[0],
    endTime: timestamps.at(-1),
    dataPoints: timestamps.length,
    series: {
      timestamps,
      cpu: [31, 34, 38, 35, 41, 43, 48, 45, 44, 46, 42, 40],
      memoryPercent: [41, 42, 42, 43, 44, 45, 45, 44, 43, 44, 44, 43],
      diskPercent: [35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35],
      netIn: [11, 13, 17, 12, 15, 21, 20, 18, 17, 15, 12, 10],
      netOut: [9, 8, 12, 11, 10, 14, 13, 12, 11, 10, 9, 8],
      loadAvg1m: [0.9, 1.0, 1.2, 1.1, 1.3, 1.5, 1.7, 1.4, 1.3, 1.2, 1.1, 1.0],
    },
    peak: { cpu: 48, memory: 45, disk: 35 },
  };
}

function appCurrentMetrics(state: MutableState) {
  return {
    id: "mock-app-1",
    name: "Observability API",
    status: state.appStatus,
    healthStatus: state.appHealth,
    healthCheckedAt: now,
    healthPath: "/health",
    timestamp: now,
    cpuPercent: 37,
    memoryUsed: 412_000_000,
    memoryLimit: 1_024_000_000,
    memoryPercent: 40,
    netInput: 250_000,
    netOutput: 490_000,
    blockInput: 12_000,
    blockOutput: 8_000,
    restartCount: 1,
    containerId: "container-mock-app-1",
    message: "Healthy",
  };
}

function appHistory() {
  const timestamps = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.parse(now) - (11 - index) * 5 * 60 * 1000);
    return date.toISOString();
  });

  return {
    range: "1h",
    series: {
      timestamps,
      cpu: [23, 28, 31, 29, 33, 35, 38, 41, 37, 34, 32, 30],
      memoryPercent: [33, 34, 35, 36, 37, 39, 41, 42, 40, 39, 38, 37],
      restartCount: [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
    },
    healthStatus: "healthy",
  };
}

function requestAnalytics() {
  return {
    feed: {
      appId: "mock-app-1",
      window: "1h",
      events: Array.from({ length: 6 }, (_, index) => ({
        requestId: `req-${index + 1}`,
        timestamp: new Date(Date.parse(now) - index * 15_000).toISOString(),
        method: index % 2 === 0 ? "GET" : "POST",
        path: index % 2 === 0 ? `/v1/orders/${1000 + index}` : "/v1/orders",
        pathNormalized: "/v1/orders/:id",
        query: "",
        status: index === 0 ? 500 : 200,
        responseMs: 120 + index * 15,
        upstreamMs: 70 + index * 10,
        bytesSent: 2048 + index * 128,
        ip: "203.0.113.10",
        userAgent: "MockBrowser/1.0",
        country: "IN",
      })),
    },
    latency: {
      appId: "mock-app-1",
      window: "1h",
      series: Array.from({ length: 8 }, (_, index) => ({
        bucket: new Date(Date.parse(now) - (7 - index) * 5 * 60 * 1000).toISOString(),
        p50: 90 + index * 2,
        p95: 180 + index * 4,
        p99: 260 + index * 6,
      })),
    },
    errors: {
      appId: "mock-app-1",
      window: "1h",
      rows: [
        { pathNormalized: "/v1/orders/:id", status: 500, count: 4, samplePath: "/v1/orders/1234" },
        { pathNormalized: "/health", status: 503, count: 1, samplePath: "/health" },
      ],
    },
    heatmap: {
      appId: "mock-app-1",
      rows: Array.from({ length: 24 }, (_, hour) => ({
        bucket: new Date(Date.parse(now) - (23 - hour) * 60 * 60 * 1000).toISOString(),
        pathNormalized: "/v1/orders/:id",
        count: 20 + (hour % 6) * 7,
      })),
    },
    slowest: {
      appId: "mock-app-1",
      window: "1h",
      rows: [
        { pathNormalized: "/v1/orders/:id", p95: 410, requests: 280 },
        { pathNormalized: "/v1/reports/:id", p95: 360, requests: 94 },
      ],
    },
  };
}

function activityEvents() {
  return {
    events: [
      {
        id: "activity-1",
        event: "deploy.started",
        icon: "rocket",
        description: "Deployment started for Observability API",
        actor: { id: "mock-user-1", type: "USER", name: "Sayan Mondal", email: "sayan@example.com" },
        target: { type: "app", id: "mock-app-1" },
        metadata: { appName: "Observability API" },
        createdAt: now,
      },
      {
        id: "activity-2",
        event: "server.claim",
        icon: "server",
        description: "Server Primary VPS was claimed",
        actor: { id: "mock-user-1", type: "USER", name: "Sayan Mondal", email: "sayan@example.com" },
        target: { type: "server", id: "mock-server-1" },
        metadata: { serverName: "Primary VPS" },
        createdAt: "2026-04-23T11:45:00.000Z",
      },
      {
        id: "activity-3",
        event: "app.stop",
        icon: "box",
        description: "Application Worker was stopped",
        actor: { id: "mock-user-1", type: "USER", name: "Sayan Mondal", email: "sayan@example.com" },
        target: { type: "app", id: "mock-app-2" },
        metadata: { appName: "Worker" },
        createdAt: "2026-04-23T11:30:00.000Z",
      },
    ],
    nextCursor: null,
  };
}

export async function installDashboardMocks(
  page: Page,
  options: {
    authenticated?: boolean;
    onboardingCompleted?: boolean;
    serverMode?: "connected" | "none";
    appStatus?: MutableState["appStatus"];
    planSlug?: MutableState["planSlug"];
    pendingPlanSlug?: MutableState["pendingPlanSlug"];
    trialDaysRemaining?: number | null;
    emailVerified?: boolean;
  } = {}
) {
  const state: MutableState = {
    user: {
      id: "mock-user-1",
      email: "operator@example.com",
      name: "Operator One",
      createdAt: now,
      organizationId: "mock-org-1",
      organizationName: "Acme Operations",
      organizationSlug: "acme-operations",
      orgRole: "OWNER",
      preferences: { newDashboard: true },
      onboardingCompleted: options.onboardingCompleted ?? true,
      emailVerified: options.emailVerified ?? true,
      memberships: [
        {
          organizationId: "mock-org-1",
          name: "Acme Operations",
          slug: "acme-operations",
          role: "OWNER",
        },
      ],
    },
    appStatus: options.appStatus ?? "running",
    appHealth: "healthy",
    serverMode: options.serverMode ?? "connected",
    planSlug: options.planSlug ?? "free",
    pendingPlanSlug: options.pendingPlanSlug ?? null,
    trialDaysRemaining: options.trialDaysRemaining ?? null,
    apiKeys: [],
    agentUpdateJob: null,
  };

  if (options.authenticated !== false) {
    await page.addInitScript(() => {
      window.localStorage.setItem("token", "mock-token");
    });
  }

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();
  const analytics = requestAnalytics();
  const activity = activityEvents();
    if (pathname === "/badge/mock-app-1" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        headers: { "cache-control": "public, max-age=60" },
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="20"><text x="4" y="14">Opslin deployed</text></svg>`,
      });
    }

    if (request.resourceType() === "document") {
      return route.fallback();
    }

    const server = {
      id: "mock-server-1",
      name: "Prod VPS 01",
      ip: "203.0.113.10",
      hostname: "prod-vps-01",
      os: "Ubuntu 24.04",
      arch: "x86_64",
      status: "connected",
      isLiveConnected: true,
      agentVersion: "2.0.0",
      connectedAt: now,
      lastSeenAt: now,
      createdAt: "2026-04-01T00:00:00.000Z",
    };

    const app = {
      id: "mock-app-1",
      name: "Observability API",
      domain: "api.example.com",
      publicStatus: true,
      status: state.appStatus,
      healthStatus: state.appHealth,
      gitUrl: "https://github.com/acme/observability-api",
      branch: "main",
      port: 8080,
      envVars: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
      },
      buildpackOverride: null,
      hasDockerfileOverride: true,
      registryCredentials: {
        registry: "ghcr.io",
        username: "acme-ci",
      },
      createdAt: "2026-04-03T12:00:00.000Z",
    };

    const allApps = [
      {
        ...app,
        server: { id: server.id, name: server.name, hostname: server.hostname },
      },
      {
        ...app,
        id: "mock-app-2",
        name: "Customer Portal",
        domain: "portal.example.com",
        healthStatus: "unknown",
        status: "deploying",
        server: { id: server.id, name: server.name, hostname: server.hostname },
      },
    ];

    const failedDeployment = {
      id: "dep-failed",
      sha: "abcdef1234567890",
      status: "failed",
      startedAt: "2026-04-23T11:20:00.000Z",
      finishedAt: "2026-04-23T11:24:00.000Z",
      healthLog: "candidate removed after failed healthcheck: status code 503",
      triggeredBy: "operator@example.com",
      errorClassification: {
        category: "HEALTH_CHECK_FAILED",
        title: "Health check failed",
        summary: "The container started but did not return a healthy response before the rollout timeout.",
        suggestion: "Ensure the health path returns HTTP 200 and that the app listens on the expected host and port.",
        logSnippet: "candidate removed after failed healthcheck: status code 503",
        docsLink: "/docs/deployments/troubleshooting#health-check",
      },
      triggerMeta: {
        source: "dashboard",
        errorClassification: {
          category: "HEALTH_CHECK_FAILED",
          title: "Health check failed",
          summary: "The container started but did not return a healthy response before the rollout timeout.",
          suggestion: "Ensure the health path returns HTTP 200 and that the app listens on the expected host and port.",
          logSnippet: "candidate removed after failed healthcheck: status code 503",
          docsLink: "/docs/deployments/troubleshooting#health-check",
        },
      },
      previousSha: "1234567890abcdef",
    };

    const deployments = [
      state.appStatus === "error" ? failedDeployment : {
        id: "dep-current",
        sha: "abcdef1234567890",
        status: "succeeded",
        startedAt: "2026-04-23T11:20:00.000Z",
        finishedAt: "2026-04-23T11:24:00.000Z",
        healthLog: "Healthy",
        triggeredBy: "operator@example.com",
        triggerMeta: { source: "dashboard" },
        previousSha: "1234567890abcdef",
      },
      {
        id: "dep-previous",
        sha: "1234567890abcdef",
        status: "succeeded",
        startedAt: "2026-04-22T15:10:00.000Z",
        finishedAt: "2026-04-22T15:15:00.000Z",
        healthLog: "Healthy",
        triggeredBy: "operator@example.com",
        triggerMeta: { source: "dashboard" },
        previousSha: "fedcba0987654321",
      },
    ];

    const databases = [
      {
        id: "mock-db-1",
        name: "Primary Postgres",
        type: "postgresql",
        status: "running",
        port: 5432,
        hostPort: 15432,
        username: "opslin",
        exposure: "internal",
        readOnly: false,
        cpuLimit: 1,
        memoryLimit: 1024,
        createdAt: "2026-04-05T09:00:00.000Z",
      },
    ];

    if (pathname === "/auth/me" && method === "GET") {
      return json(route, state.user);
    }

    if (pathname === "/auth/preferences" && method === "PATCH") {
      const body = JSON.parse(request.postData() || "{}");
      state.user.preferences.newDashboard = Boolean(body.newDashboard);
      return json(route, state.user);
    }

    if (pathname === "/auth/onboarding" && method === "PATCH") {
      const body = JSON.parse(request.postData() || "{}");
      state.user.onboardingCompleted = Boolean(body.onboardingCompleted);
      return json(route, state.user);
    }

    if (pathname === "/auth/verify-email" && method === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      if (body.code !== "123456") {
        return json(route, { message: "Invalid or expired verification code" }, 400);
      }
      state.user.emailVerified = true;
      return json(route, { success: true, emailVerified: true });
    }

    if (pathname === "/auth/resend-verification" && method === "POST") {
      return json(route, {
        success: true,
        message: "If verification is required, a code has been sent.",
        emailVerified: state.user.emailVerified,
      });
    }

    if (pathname === "/auth/logout" && method === "POST") {
      return json(route, { success: true });
    }

    if (pathname === "/auth/sessions" && method === "GET") {
      return json(route, [{
        id: "session-1",
        device: "Chrome on macOS",
        ip: "127.0.0.1",
        lastActive: now,
        createdAt: now,
        isCurrent: true,
      }]);
    }

    if (pathname === "/auth/sessions" && method === "DELETE") {
      return json(route, { success: true, revokedSessions: 1 });
    }

    if (pathname === "/plans" && method === "GET") {
      return json(route, {
        plans: Object.values(planCatalog).filter((plan) => plan.isPublic),
      });
    }

    if (pathname === "/plans/current" && method === "GET") {
      return json(route, currentPlanResponse(state));
    }

    if (pathname === "/plans/usage" && method === "GET") {
      const usage = currentUsage(state);
      const plan = planCatalog[state.planSlug];
      return json(route, {
        usage,
        limits: {
          servers: plan.maxServers,
          apps: plan.maxApps,
          databases: plan.maxDatabases,
        },
        plan,
      });
    }

    if (pathname === "/plans/trial-status" && method === "GET") {
      return json(route, currentPlanResponse(state).trial);
    }

    if (pathname === "/plans/select" && method === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      if (body.slug === "free" || body.slug === "starter") {
        state.planSlug = body.slug;
        state.pendingPlanSlug = null;
        state.trialDaysRemaining = body.slug === "starter" ? 180 : null;
        return json(route, {
          requiresPayment: false,
          subscription: currentPlanResponse(state).subscription,
        });
      }

      if (body.slug === "pro" || body.slug === "business") {
        state.pendingPlanSlug = body.slug;
        return json(route, {
          requiresPayment: true,
          planSlug: body.slug,
          subscription: currentPlanResponse(state).subscription,
        });
      }

      return json(route, {
        success: true,
        message: "Enterprise inquiry submitted",
      }, 202);
    }

    if (pathname === "/plans/enterprise-contact" && method === "POST") {
      return json(route, {
        success: true,
        message: "Enterprise inquiry submitted",
      }, 202);
    }

    if (pathname === "/billing/checkout" && method === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      if (body.planSlug !== "pro" && body.planSlug !== "business") {
        return json(route, { message: "Free and Starter do not use Razorpay checkout" }, 400);
      }
      state.pendingPlanSlug = body.planSlug;
      const plan = planCatalog[body.planSlug as "pro" | "business"];
      return json(route, {
        keyId: "rzp_test_mock",
        subscriptionId: `sub_${body.planSlug}_mock`,
        planSlug: body.planSlug,
        amount: plan.priceWithGst,
        currency: plan.currency,
        invoice: {
          baseAmount: plan.priceMonthly,
          gstAmount: plan.priceWithGst - plan.priceMonthly,
          gstPercent: plan.gstPercent,
          totalAmount: plan.priceWithGst,
          currency: plan.currency,
        },
      });
    }

    if (pathname === "/billing/success" && method === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      if (!body.razorpay_payment_id || !body.razorpay_subscription_id || !body.razorpay_signature) {
        return json(route, { message: "Invalid billing success payload" }, 400);
      }
      if (state.pendingPlanSlug) {
        state.planSlug = state.pendingPlanSlug;
        state.pendingPlanSlug = null;
        state.trialDaysRemaining = null;
      }
      return json(route, {
        success: true,
        subscription: {
          id: "subscription-1",
          status: "active",
          paymentRequired: false,
          razorpaySubId: body.razorpay_subscription_id,
          planSlug: state.planSlug,
        },
        invoice: {
          baseAmount: planCatalog[state.planSlug].priceMonthly,
          gstAmount: planCatalog[state.planSlug].priceWithGst - planCatalog[state.planSlug].priceMonthly,
          gstPercent: planCatalog[state.planSlug].gstPercent,
          totalAmount: planCatalog[state.planSlug].priceWithGst,
          currency: planCatalog[state.planSlug].currency,
        },
      });
    }

    if (pathname === "/billing/invoices" && method === "GET") {
      return json(route, {
        invoices: [
          {
            id: "invoice-1",
            planSlug: "pro",
            baseAmount: 799,
            gstAmount: 144,
            gstPercent: 18,
            totalAmount: 943,
            currency: "INR",
            status: "paid",
            razorpayInvoiceId: "inv_mock",
            razorpayPaymentId: "pay_mock",
            paidAt: now,
            createdAt: now,
          },
        ],
      });
    }

    if (pathname === "/api-keys" && method === "GET") {
      return json(route, {
        apiKeys: state.apiKeys,
        availableScopes: ["apps:read", "apps:write", "apps.deploy:write", "servers:read"],
      });
    }

    if (pathname === "/api-keys" && method === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      const apiKey = {
        id: `api-key-${state.apiKeys.length + 1}`,
        name: body.name || "API key",
        prefix: "opl_live",
        scopes: body.scopes || ["apps:read"],
        lastUsedAt: null,
        expiresAt: null,
        createdAt: now,
      };
      state.apiKeys.unshift(apiKey);
      return json(route, {
        apiKey,
        key: `opl_live_mockSecret${state.apiKeys.length}`,
      }, 201);
    }

    if (pathname.startsWith("/api-keys/") && method === "DELETE") {
      const keyId = pathname.split("/").at(-1);
      state.apiKeys = state.apiKeys.filter((apiKey) => apiKey.id !== keyId);
      return json(route, { success: true });
    }

    if (pathname === "/servers" && method === "GET") {
      return json(route, state.serverMode === "none" ? [] : [server]);
    }

    if (pathname === `/servers/${server.id}` && method === "GET") {
      return json(route, server);
    }

    if (pathname === `/servers/${server.id}/agent-update` && method === "GET") {
      return json(route, {
        serverId: server.id,
        currentVersion: "2.0.0",
        latestVersion: "2.0.1",
        minimumSelfUpdateVersion: "0.2.0",
        minimumSecureControlVersion: "2.0.0",
        updateAvailable: true,
        canSelfUpdate: true,
        isSelfUpdateCapable: true,
        isSecureControlCapable: true,
        manualUpdateRequired: false,
        connected: true,
        canQueueUpdate: !state.agentUpdateJob,
        blockedReason: state.agentUpdateJob ? "An agent update is already queued or running." : null,
        helperStatus: "active",
        manualFallbackCommand: "curl -fsSL http://localhost:4000/agent/install | sudo bash",
        activeUpdateJob: state.agentUpdateJob,
        lastUpdateJob: state.agentUpdateJob,
        release: {
          version: "2.0.1",
          channel: "stable",
          releasedAt: now,
          commit: "mock",
          criticality: "recommended",
          whyUpdate: ["Fixes public IP preview routing."],
          bugFixes: ["Fixes static-site deployments."],
          newFunctions: ["Adds visible update tracking."],
          vpsChanges: ["Restarts only the Opslin agent."],
          securityNotes: ["Verifies SHA-256 before replacement."],
        },
        artifact: {
          os: "linux",
          arch: "amd64",
          downloadUrl: "http://localhost:4000/agent/releases/2.0.1/agent-linux-amd64",
          sha256: "d".repeat(64),
          sizeBytes: 123456,
        },
      });
    }

    if (pathname === `/servers/${server.id}/agent-update` && method === "POST") {
      state.agentUpdateJob = {
        id: "agent-update-mock-server-1",
        type: "AGENT_UPDATE",
        status: "PENDING",
        createdAt: now,
        startedAt: null,
        endedAt: null,
        queueState: "waiting",
        queuePosition: 1,
        jobsAhead: 0,
        estimatedStartSeconds: 5,
        progress: {
          phase: "queued",
          percent: 5,
          message: "Queue position 1; About 5s.",
          status: "queued",
          elapsedMs: null,
        },
      };
      return json(route, {
        jobId: state.agentUpdateJob.id,
        serverId: server.id,
        version: "2.0.1",
        status: "queued",
        queuePosition: 1,
        jobsAhead: 0,
        estimatedStartSeconds: 5,
      }, 202);
    }

    if (state.agentUpdateJob && pathname === `/servers/${server.id}/jobs/${state.agentUpdateJob.id}` && method === "GET") {
      return json(route, state.agentUpdateJob);
    }

    if (pathname === `/servers/${server.id}/agent-control` && method === "GET") {
      return json(route, {
        serverId: server.id,
        connected: true,
        currentVersion: "2.0.0",
        latestVersion: "2.0.1",
        minimumSecureControlVersion: "2.0.0",
        isSecureControlCapable: true,
        helperStatus: "active",
        secureControl: true,
        runningJob: state.agentUpdateJob,
        lastPrivilegedAction: null,
        actions: ["agent_status", "agent_logs", "agent_restart", "docker_ps", "system_health"],
      });
    }

    if (pathname === `/servers/${server.id}/apps` && method === "GET") {
      return json(route, [app]);
    }

    if (pathname === `/servers/${server.id}/apps` && method === "POST") {
      if (!state.user.emailVerified) {
        return json(route, {
          code: "EMAIL_NOT_VERIFIED",
          message: "Verify your email before creating apps.",
        }, 403);
      }
      const body = JSON.parse(request.postData() || "{}");
      return json(route, {
        ...app,
        id: "mock-app-created",
        name: body.name || "Created App",
        gitUrl: body.gitUrl || null,
        branch: body.branch || "main",
        githubInstallationId: body.githubInstallationId || null,
        envVars: body.envVars || {},
        createdAt: now,
      });
    }

    if (pathname === "/github/repos" && method === "GET") {
      return json(route, {
        repositories: [
          {
            id: 101,
            name: "api",
            fullName: "acme/api",
            owner: "acme",
            private: false,
            htmlUrl: "https://github.com/acme/api",
            cloneUrl: "https://github.com/acme/api.git",
            sshUrl: "git@github.com:acme/api.git",
            defaultBranch: "main",
            language: "TypeScript",
            updatedAt: now,
            installationId: "00000000-0000-4000-8000-000000000001",
            installationAccount: "acme",
          },
          {
            id: 102,
            name: "worker",
            fullName: "acme/worker",
            owner: "acme",
            private: true,
            htmlUrl: "https://github.com/acme/worker",
            cloneUrl: "https://github.com/acme/worker.git",
            sshUrl: "git@github.com:acme/worker.git",
            defaultBranch: "develop",
            language: "Go",
            updatedAt: now,
            installationId: "00000000-0000-4000-8000-000000000001",
            installationAccount: "acme",
          },
        ],
      });
    }

    if (pathname === "/github/repos/acme/api/branches" && method === "GET") {
      return json(route, {
        branches: [
          { name: "main", sha: "abc123", protected: true },
          { name: "develop", sha: "def456", protected: false },
        ],
      });
    }

    if (pathname === `/servers/${server.id}/databases` && method === "GET") {
      return json(route, databases);
    }

    if (pathname === `/servers/${server.id}/firewall` && method === "GET") {
      return json(route, {
        server: { id: server.id, name: server.name, ip: server.ip, status: server.status },
        cloudflare: { configured: true, tokenName: "prod-token", status: "active", scopes: ["zone.read"] },
        apps: [{ id: app.id, name: app.name, domain: app.domain, cloudflareZoneId: "zone_123" }],
        commits: [],
      });
    }

    if (pathname === `/servers/${server.id}/apps/${app.id}/logs` && method === "GET") {
      return json(route, {
        id: app.id,
        name: app.name,
        status: state.appStatus,
        deployedAt: deployments[0].finishedAt,
        logs: [
          "2026-04-23T11:26:00.000Z INFO Booting server",
          "2026-04-23T11:26:01.000Z INFO Listening on :8080",
          "2026-04-23T11:26:02.000Z WARN Slow query threshold exceeded",
          "2026-04-23T11:26:03.000Z \u001b[31mERROR Image generation worker failed\u001b[0m",
        ].join("\n"),
      });
    }

    if (pathname === `/servers/${server.id}/apps/${app.id}/deploy` && method === "POST") {
      state.appStatus = "deploying";
      return json(route, { id: app.id, name: app.name, status: "deploying", message: "Deploy started", jobId: "job-deploy-1" });
    }

    if (pathname === `/servers/${server.id}/apps/mock-app-created/deploy` && method === "POST") {
      state.appStatus = "deploying";
      return json(route, {
        id: "mock-app-created",
        name: "Created App",
        status: "deploying",
        message: "Deploy started",
        jobId: "job-deploy-created",
      });
    }

    if (pathname === `/servers/${server.id}/apps/${app.id}/stop` && method === "POST") {
      state.appStatus = "stopped";
      return json(route, { id: app.id, name: app.name, status: "stopped", message: "Stop started", jobId: "job-stop-1" });
    }

    if (pathname === `/apps/${app.id}/deployments` && method === "GET") {
      return json(route, deployments);
    }

    if (pathname === `/apps/${app.id}/rollback` && method === "POST") {
      state.appStatus = "deploying";
      return json(route, {
        appId: app.id,
        jobId: "job-rollback-1",
        deploymentId: "dep-rollback-1",
        status: "running",
        toVersion: "1234567890abcdef",
      });
    }

    if (pathname === "/apps/all" && method === "GET") {
      return json(route, allApps);
    }

    if (pathname === "/metrics/apps/overview" && method === "GET") {
      return json(route, [
        {
          id: app.id,
          name: app.name,
          status: state.appStatus,
          healthStatus: state.appHealth,
          domain: app.domain,
          server: { id: server.id, name: server.name },
          cpuPercent: 37,
          memoryUsed: 412_000_000,
          memoryLimit: 1_024_000_000,
          memoryPercent: 40,
          restartCount: 1,
          updatedAt: now,
        },
      ]);
    }

    if (pathname === "/activity" && method === "GET") {
      const event = url.searchParams.get("event");
      const limit = Number(url.searchParams.get("limit") || activity.events.length);
      return json(route, {
        events: activity.events
          .filter((entry) => !event || entry.event === event)
          .slice(0, limit),
        nextCursor: null,
      });
    }

    if (pathname === "/admin" && method === "GET") {
      return json(route, {
        totals: {
          users: 25,
          servers: 12,
          apps: 31,
          deployments24h: 9,
          activeSubscriptions: 7,
        },
        performance: {
          successRate: 88.9,
          avgDeployTimeMs: 215000,
        },
        revenue: {
          mrr: 11243,
          currency: "INR",
        },
        engagement: {
          dau: 11,
          wau: 23,
        },
        deploys30d: Array.from({ length: 30 }, (_, index) => ({
          date: new Date(Date.parse(now) - (29 - index) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          total: index % 5,
          succeeded: index % 4,
          failed: index % 5 === 0 ? 1 : 0,
        })),
        generatedAt: now,
      });
    }

    if (pathname === "/demo/start" && method === "POST") {
      return json(route, {
        token: "mock-demo-token",
        expiresAt: "2026-04-23T12:30:00.000Z",
        loginUrl: "/",
        user: {
          id: "demo-user-1",
          email: "demo+mock@opslin.local",
          name: "Opslin Demo",
        },
        organization: {
          id: "demo-org-1",
          name: "Opslin Demo's Organization",
          slug: "opslin-demo",
        },
        server: {
          id: "mock-server-1",
          name: "Demo VPS",
          status: "connected",
        },
        app: {
          id: "mock-app-1",
          name: "Demo API",
          status: "running",
        },
      });
    }

    if (pathname === "/metrics/public" && method === "GET") {
      return json(route, {
        totalDeploys: 245,
        avgDeployTimeMs: 214000,
        uptimePercent: 99.92,
        generatedAt: now,
      });
    }

    if (pathname === "/status/mock-app-1" && method === "GET") {
      return json(route, {
        app: {
          id: app.id,
          name: app.name,
          status: state.appStatus,
          healthStatus: state.appHealth,
          healthCheckedAt: now,
          deployedAt: now,
        },
        currentStatus: state.appHealth === "unhealthy" ? "Down" : "Operational",
        uptimePercent: 99.92,
        healthHistory: Array.from({ length: 6 }, (_, index) => ({
          timestamp: new Date(Date.parse(now) - (5 - index) * 10 * 60 * 1000).toISOString(),
          status: "running",
          healthStatus: "healthy",
        })),
        incidents: [],
        generatedAt: now,
      });
    }

    if (pathname === `/metrics/${server.id}/current` && method === "GET") {
      return json(route, currentServerMetrics());
    }

    if (pathname === `/metrics/${server.id}/history` && method === "GET") {
      return json(route, serverHistory());
    }

    if (pathname === `/metrics/apps/${app.id}/current` && method === "GET") {
      return json(route, appCurrentMetrics(state));
    }

    if (pathname === `/metrics/apps/${app.id}/history` && method === "GET") {
      return json(route, appHistory());
    }

    if (pathname === `/metrics/apps/${app.id}/requests/feed` && method === "GET") {
      return json(route, analytics.feed);
    }

    if (pathname === `/metrics/apps/${app.id}/requests/latency` && method === "GET") {
      return json(route, analytics.latency);
    }

    if (pathname === `/metrics/apps/${app.id}/requests/errors` && method === "GET") {
      return json(route, analytics.errors);
    }

    if (pathname === `/metrics/apps/${app.id}/requests/heatmap` && method === "GET") {
      return json(route, analytics.heatmap);
    }

    if (pathname === `/metrics/apps/${app.id}/requests/slowest` && method === "GET") {
      return json(route, analytics.slowest);
    }

    if (pathname === "/alerts/events" && method === "GET") {
      return json(route, [
        {
          id: "alert-event-1",
          openedAt: "2026-04-23T11:45:00.000Z",
          resolvedAt: null,
          peakValue: 96,
          lastValue: 91,
          notifiedChannels: [],
          status: "firing",
          rule: {
            id: "alert-rule-1",
            metric: "cpu",
            metricLabel: "CPU saturation",
            threshold: 90,
            severity: "critical",
            app: { id: app.id, name: app.name, domain: app.domain ?? null },
            server: null,
          },
        },
      ]);
    }

    if (pathname === "/alerts/timeline" && method === "GET") {
      return json(route, Array.from({ length: 12 }, (_, index) => ({
        date: new Date(Date.parse(now) - (11 - index) * 24 * 60 * 60 * 1000).toISOString(),
        firing: index % 3 === 0 ? 2 : 0,
        resolved: index % 4 === 0 ? 1 : 0,
        silenced: index % 5 === 0 ? 1 : 0,
      })));
    }

    return route.fallback();
  });

  return { baseApiUrl: base };
}
