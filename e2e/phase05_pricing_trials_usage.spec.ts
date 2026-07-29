import { expect, test } from "@playwright/test";
import { installDashboardMocks } from "./mock-dashboard";

test("pricing page renders all 5 plan cards", async ({ page }) => {
  await installDashboardMocks(page, { authenticated: false });

  await page.goto("/pricing");

  await expect(page.getByTestId("pricing-page")).toBeVisible();
  await expect(page.getByTestId("pricing-plan-grid")).toHaveClass(/sm:grid-cols-2/);
  await expect(page.getByTestId("pricing-plan-grid")).toHaveClass(/lg:grid-cols-3/);
  await expect(page.getByTestId("pricing-plan-grid")).toHaveClass(/2xl:grid-cols-5/);
  await expect(page.getByTestId("plan-card-free")).toBeVisible();
  await expect(page.getByTestId("plan-card-starter")).toBeVisible();
  await expect(page.getByTestId("plan-card-pro")).toBeVisible();
  await expect(page.getByTestId("plan-card-business")).toBeVisible();
  await expect(page.getByTestId("plan-card-enterprise")).toBeVisible();
});

test("starter trial badge shows in the dashboard header", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "starter", trialDaysRemaining: 5 });

  await page.goto("/pricing");

  await expect(page.getByTestId("trial-badge")).toBeVisible();
  await expect(page.getByTestId("trial-badge")).toContainText("Trial: 5 days left");
});

test("pricing page shows live usage meters", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "starter", trialDaysRemaining: 45 });

  await page.goto("/pricing");

  await expect(page.getByTestId("usage-meters")).toBeVisible();
  await expect(page.getByTestId("usage-meter-servers")).toContainText("1/1");
  await expect(page.getByTestId("usage-meter-apps")).toContainText("1/5");
});

test("starter selection success opens the plan activation result modal", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "free" });

  await page.goto("/pricing");
  await page.getByTestId("plan-card-starter").getByRole("button", { name: "Start 6-month trial" }).click();

  const dialog = page.getByTestId("plan-activation-result-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Congratulations!");
  await expect(dialog).toContainText("Your 6-month Starter trial is active.");
  await expect(dialog).toContainText("Plan");
  await expect(dialog).toContainText("Starter");
  await expect(dialog).toContainText("Trial ends on");
  await expect(dialog).toContainText("Free for 6 months");
  await expect(dialog).toHaveClass(/w-\[calc\(100vw-1rem\)\]/);
  await expect(dialog).toHaveClass(/max-h-\[90vh\]/);
  await expect(dialog).toHaveClass(/overflow-y-auto/);
});

test("selecting a paid tier opens the Phase 06 checkout path", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "free" });
  await page.addInitScript(() => {
    (window as any).Razorpay = function Razorpay(options: any) {
      return {
        open() {
          options.handler?.({
            razorpay_payment_id: "pay_mock",
            razorpay_subscription_id: "sub_pro_mock",
            razorpay_signature: "sig_mock",
          });
        },
      };
    };
  });

  await page.goto("/pricing");
  await page.getByTestId("plan-card-pro").getByRole("button", { name: "Subscribe" }).click();

  const dialog = page.getByTestId("plan-activation-result-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Your Pro subscription is active.");
  await expect(dialog).toContainText("Subscription ID");
  await expect(dialog).toContainText("sub_pro_mock");
  await expect(dialog).toContainText("Renews on");
  await expect(dialog).toContainText("Available after Razorpay confirms the subscription cycle");
  await expect(dialog).toContainText("₹943/month");
});

test("payment cancellation opens an error modal and keeps the plan unchanged", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "free" });
  await page.addInitScript(() => {
    (window as any).Razorpay = function Razorpay(options: any) {
      return {
        open() {
          options.modal?.ondismiss?.();
        },
      };
    };
  });

  await page.goto("/pricing");
  await page.getByTestId("plan-card-pro").getByRole("button", { name: "Subscribe" }).click();

  const dialog = page.getByTestId("plan-activation-result-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Payment was not completed");
  await expect(dialog).toContainText("Your plan was not changed. Please try again, or contact support if money was debited.");
  await expect(page.getByTestId("plan-current-free")).toBeVisible();
});

test("enterprise contact form submits from the pricing page", async ({ page }) => {
  await installDashboardMocks(page);

  await page.goto("/pricing");
  await page.getByTestId("plan-card-enterprise").getByRole("button", { name: "Contact sales" }).click();
  await page.getByLabel("Name").fill("Sayan Mondal");
  await page.getByLabel("Work email").fill("sayan@example.com");
  await page.getByLabel("Company").fill("Opslin");
  await page.getByLabel("Deployment requirements").fill("Need enterprise controls.");
  await page.getByRole("button", { name: "Send inquiry" }).click();

  await expect(page.getByText("Enterprise inquiry submitted")).toBeVisible();
});

test("trial banner warns when only one day remains", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "starter", trialDaysRemaining: 1 });

  await page.goto("/pricing");

  await expect(page.getByTestId("trial-banner").first()).toBeVisible();
  await expect(page.getByText("Starter trial ends tomorrow").first()).toBeVisible();
});

test("plan limit failures in app creation open the upgrade prompt", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "free" });
  await page.route("**/servers/mock-server-1/apps", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: "PLAN_LIMIT_REACHED",
        message: "Free plan app quota reached",
        resource: "app",
        current: 3,
        limit: 3,
        plan: "Free",
        upgradeUrl: "/pricing",
      }),
    });
  });

  await page.goto("/apps/new");
  await page.getByTestId("source-git-url").click();
  await page.getByTestId("manual-git-url").fill("https://github.com/acme/image-generator.git");
  await page.getByTestId("continue-to-deploy").click();
  await page.locator("select[required]").selectOption("mock-server-1");
  await page.getByTestId("deploy-button").click();

  await expect(page.getByTestId("upgrade-prompt")).toBeVisible();
  await expect(page.getByTestId("upgrade-prompt")).toHaveClass(/w-\[calc\(100vw-1rem\)\]/);
  await expect(page.getByTestId("upgrade-prompt")).toHaveClass(/max-h-\[90vh\]/);
  await expect(page.getByTestId("upgrade-prompt")).toHaveClass(/overflow-y-auto/);
  await expect(page.getByTestId("upgrade-plan-grid")).toHaveClass(/sm:grid-cols-2/);
  await expect(page.getByTestId("upgrade-plan-grid")).toHaveClass(/xl:grid-cols-3/);
  await expect(page.getByText(/You hit the app limit on Free/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Open pricing/i })).toBeVisible();
});
