import { api, User } from "./api";

const TOKEN_KEY = "token";

export function clearLegacyToken(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEY);
}

export const removeToken = clearLegacyToken;

export async function login(
    email: string,
    password: string
): Promise<{ token: string; user: User }> {
    return api.login(email, password);
}

export async function register(
    email: string,
    password: string,
    name: string
): Promise<{ token: string; user: User; devOtp?: string }> {
    return api.register(email, password, name);
}

export async function logout(): Promise<void> {
    await api.logout();
    clearLegacyToken();
}
