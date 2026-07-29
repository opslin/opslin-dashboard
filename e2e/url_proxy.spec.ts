import { expect, test } from "@playwright/test";
import { authenticateUser, requireEnv } from "./helpers";

test("url proxy supports happy-path and blocks unsafe upstreams", async ({ page }) => {
    const appId = requireEnv("E2E_NGINX_APP_ID");
    const suffix = Date.now();
    const proxyPath = `/httpbin-${suffix}`;
    const blockedPath = `/blocked-${suffix}`;

    await authenticateUser(page, `${Date.now()}-proxy`);
    await page.goto(`/apps/${appId}/nginx`);

    await expect(page.getByRole("heading", { name: /url proxies/i })).toBeVisible();

    await page.getByLabel("Path").fill(proxyPath);
    await page.getByLabel("Upstream URL").fill("https://httpbin.org/anything");
    await page.getByRole("button", { name: /add proxy/i }).click();
    await expect(page.getByText(proxyPath, { exact: true })).toBeVisible();

    await page.getByLabel("Path").fill(blockedPath);
    await page.getByLabel("Upstream URL").fill("http://169.254.169.254");
    await page.getByRole("button", { name: /add proxy/i }).click();
    await expect(page.getByText(/blocked address|not allowed|embedded credentials/i)).toBeVisible();
});
