// /storage (Buckets, Backups and Opslin Media) needs only a Cloudflare account, never a server or a first
// deployment, so it must not be gated behind the "connect a server, deploy once" wizard. /media stays
// because it is the address the Cloudflare sign-in returns to before it redirects into /storage/media.
const onboardingBypassRoutes = ["/settings", "/pricing", "/docs", "/media", "/storage"];
const emailVerificationBypassRoutes = ["/verify-email", "/settings", "/pricing", "/docs", "/help"];

function matchesRoute(pathname: string, routes: string[]) {
    return routes.some((route) => (
        pathname === route || pathname.startsWith(`${route}/`)
    ));
}

export function shouldBypassOnboarding(pathname: string) {
    return matchesRoute(pathname, onboardingBypassRoutes);
}

export function shouldBypassEmailVerification(pathname: string) {
    return matchesRoute(pathname, emailVerificationBypassRoutes);
}
