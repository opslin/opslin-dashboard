import { expect, test } from "@playwright/test";
import { apiBaseUrl } from "./helpers";
import { installDashboardMocks } from "./mock-dashboard";

test("Pro checkout opens Razorpay with the GST-inclusive total", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "free" });
  await page.addInitScript(() => {
    (window as any).__razorpayOptions = null;
    (window as any).Razorpay = function Razorpay(options: any) {
      (window as any).__razorpayOptions = options;
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
  await expect(dialog).toContainText("Available after Razorpay confirms the subscription cycle");
  await expect(dialog).toHaveClass(/w-\[calc\(100vw-1rem\)\]/);
  await expect(dialog).toHaveClass(/max-h-\[90vh\]/);
  await expect(dialog).toHaveClass(/overflow-y-auto/);
  const options = await page.evaluate(() => (window as any).__razorpayOptions);
  expect(options.subscription_id).toBe("sub_pro_mock");
  expect(options.amount).toBe(943);
  expect(options.notes).toMatchObject({
    baseAmount: "799",
    gstAmount: "144",
    totalAmount: "943",
  });
});

test("paid checkout tolerates missing invoice fields from checkout response", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "free" });
  await page.route("**/billing/checkout", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        keyId: "rzp_test_mock",
        subscriptionId: "sub_pro_mock",
        planSlug: "pro",
        amount: 943,
        currency: "INR",
      }),
    });
  });
  await page.addInitScript(() => {
    (window as any).__razorpayOptions = null;
    (window as any).Razorpay = function Razorpay(options: any) {
      (window as any).__razorpayOptions = options;
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

  await expect(page.getByTestId("plan-activation-result-dialog")).toContainText("Your Pro subscription is active.");
  await expect(page.getByText(/Cannot read properties/)).toHaveCount(0);
  const options = await page.evaluate(() => (window as any).__razorpayOptions);
  expect(options.notes).toMatchObject({
    baseAmount: "799",
    gstAmount: "144",
    totalAmount: "943",
  });
});

test("paid checkout shows Razorpay configuration errors without opening a broken checkout", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "free" });
  await page.route("**/billing/checkout", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 400,
        error: { description: "The ID provided is invalid or could not be found." },
      }),
    });
  });
  await page.addInitScript(() => {
    (window as any).__razorpayOpened = false;
    (window as any).Razorpay = function Razorpay() {
      (window as any).__razorpayOpened = true;
      return { open() {} };
    };
  });

  await page.goto("/pricing");
  await page.getByTestId("plan-card-pro").getByRole("button", { name: "Subscribe" }).click();

  await expect(page.getByTestId("plan-activation-result-dialog")).toContainText("Payment was not completed");
  const opened = await page.evaluate(() => (window as any).__razorpayOpened);
  expect(opened).toBe(false);
});

test("Business checkout success opens the activation result modal", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "free" });
  await page.addInitScript(() => {
    (window as any).Razorpay = function Razorpay(options: any) {
      return {
        open() {
          options.handler?.({
            razorpay_payment_id: "pay_business_mock",
            razorpay_subscription_id: "sub_business_mock",
            razorpay_signature: "sig_business_mock",
          });
        },
      };
    };
  });

  await page.goto("/pricing");
  await page.getByTestId("plan-card-business").getByRole("button", { name: "Subscribe" }).click();

  const dialog = page.getByTestId("plan-activation-result-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Your Business subscription is active.");
  await expect(dialog).toContainText("sub_business_mock");
  await expect(dialog).toContainText("₹1,769/month");
});

test("Free and Starter never initialize Razorpay checkout", async ({ page }) => {
  await installDashboardMocks(page, { planSlug: "free" });
  await page.addInitScript(() => {
    (window as any).__razorpayOpened = false;
    (window as any).Razorpay = function Razorpay() {
      (window as any).__razorpayOpened = true;
      return { open() {} };
    };
  });

  await page.goto("/pricing");
  await page.getByTestId("plan-card-starter").getByRole("button", { name: "Start 6-month trial" }).click();
  await expect(page.getByTestId("plan-activation-result-dialog")).toContainText("Your 6-month Starter trial is active.");

  const opened = await page.evaluate(() => (window as any).__razorpayOpened);
  expect(opened).toBe(false);
});

test("Enterprise uses contact sales instead of checkout", async ({ page }) => {
  await installDashboardMocks(page);

  await page.goto("/pricing");
  await page.getByTestId("plan-card-enterprise").getByRole("button", { name: "Contact sales" }).click();
  await page.getByLabel("Name").fill("Sayan Mondal");
  await page.getByLabel("Work email").fill("sayan@example.com");
  await page.getByLabel("Company").fill("Opslin");
  await page.getByLabel("Team size").fill("25");
  await page.getByLabel("Deployment requirements").fill("Need SSO and compliance controls.");
  await page.getByRole("button", { name: "Send inquiry" }).click();

  await expect(page.getByText("Enterprise inquiry submitted")).toBeVisible();
});

test("docs and legal pages are public", async ({ page }) => {
  await page.goto("/docs/connect-github");
  await expect(page.getByRole("heading", { name: "Connect GitHub" })).toBeVisible();

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();

  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
});

test("cookie consent persists and health endpoint is unauthenticated", async ({ page }) => {
  await page.route("**/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ status: "ok", checks: { database: { status: "ok" }, redis: { status: "ok" } } }),
    });
  });

  await page.goto("/privacy");
  await expect(page.getByTestId("cookie-banner")).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("cookie-banner")).toHaveCount(0);

  await page.goto(`${apiBaseUrl()}/health`);
  await expect(page.locator("body")).toContainText('"status":"ok"');
});
