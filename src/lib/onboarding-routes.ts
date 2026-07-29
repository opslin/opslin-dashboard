const onboardingBypassRoutes = ["/settings", "/pricing", "/docs"];
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
