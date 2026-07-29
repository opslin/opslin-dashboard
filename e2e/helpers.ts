import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

export function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        test.skip(true, `${name} must be set for this Playwright scenario`);
    }
    return value!;
}

export function apiBaseUrl(): string {
    return process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
}

export async function registerUser(page: Page, suffix: string) {
    const credentials = {
        name: "Playwright User",
        email: `pw-${suffix}@example.com`,
        password: "TestPassword123!",
    };

    await page.goto("/register");
    await page.getByLabel("Name").fill(credentials.name);
    await page.getByLabel("Email").fill(credentials.email);
    await page.getByLabel("Password").fill(credentials.password);
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/$/);

    return credentials;
}

export async function loginUser(page: Page, email: string, password: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/$/);
}

export async function authenticateUser(page: Page, suffix: string) {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;

    if (email && password) {
        await loginUser(page, email, password);
        return { email, password };
    }

    return registerUser(page, suffix);
}

export async function readAuthToken(page: Page) {
    const token = await page.evaluate(() => localStorage.getItem("token"));
    if (!token) {
        throw new Error("expected auth token in localStorage after login");
    }
    return token;
}

export async function postJson(
    request: APIRequestContext,
    path: string,
    token: string,
    payload: unknown
) {
    return request.post(`${apiBaseUrl()}${path}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        data: payload,
    });
}

export async function getJson(
    request: APIRequestContext,
    path: string,
    token: string
) {
    return request.get(`${apiBaseUrl()}${path}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
}
