import type { User } from "@/lib/api";

const POST_VERIFY_REDIRECT_KEY = "opslin.postVerifyRedirect";
const UNSAFE_AUTH_REDIRECT_PATHS = new Set([
    "/forgot-password",
    "/login",
    "/register",
    "/reset-password",
    "/verify-email",
]);

function isSafeLocalPath(path: string | null | undefined) {
    if (!path || !path.startsWith("/") || path.startsWith("//")) {
        return false;
    }

    try {
        const target = new URL(path, "https://opslin.local");
        return !UNSAFE_AUTH_REDIRECT_PATHS.has(target.pathname);
    } catch {
        return false;
    }
}

export function getAuthRedirectTarget(path: string | null | undefined, fallback = "/dashboard") {
    return isSafeLocalPath(path) ? path as string : fallback;
}

export function getVerifyEmailRedirectTarget(path: string | null | undefined) {
    if (typeof window !== "undefined" && isSafeLocalPath(path)) {
        sessionStorage.setItem(POST_VERIFY_REDIRECT_KEY, path as string);
    }
    return "/verify-email";
}

export function getPostVerificationRedirect(fallback = "/dashboard") {
    if (typeof window === "undefined") {
        return fallback;
    }

    const stored = sessionStorage.getItem(POST_VERIFY_REDIRECT_KEY);
    if (stored) {
        sessionStorage.removeItem(POST_VERIFY_REDIRECT_KEY);
        return getAuthRedirectTarget(stored, fallback);
    }

    const nextPath = new URLSearchParams(window.location.search).get("next");
    return getAuthRedirectTarget(nextPath, fallback);
}

export function getPostAuthRedirect(user: Pick<User, "emailVerified">, nextPath: string | null | undefined) {
    if (user.emailVerified === false) {
        return getVerifyEmailRedirectTarget(nextPath);
    }

    return getAuthRedirectTarget(nextPath);
}

export function canShowDevOtp() {
    return process.env.NODE_ENV !== "production";
}
