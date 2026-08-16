const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Fire-and-forget by design: a tracking call failing (network blip, API
// down, ad blocker) must never surface to the user or block navigation.
// `keepalive: true` lets the request survive the page unloading mid-flight
// on a route change, same as a `sendBeacon`-style call.
export function trackEvent(event: "page_view", detail: { path: string }): void {
    try {
        fetch(`${API_URL}/user-activity/track`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            keepalive: true,
            body: JSON.stringify({ event, ...detail }),
        }).catch(() => undefined);
    } catch {
        // ignore — tracking must never throw into the caller
    }
}
