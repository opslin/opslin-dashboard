import type { MediaCloudflareAccount, MediaCloudflareZone, MediaSetupInput } from "@/lib/api";

/** Images are served from a dedicated subdomain of the chosen domain, so the rest of the domain is untouched. */
export const MEDIA_IMAGE_SUBDOMAIN = "img";

export function mediaImageHostname(zone: Pick<MediaCloudflareZone, "name">): string {
    return `${MEDIA_IMAGE_SUBDOMAIN}.${zone.name}`;
}

/** Builds the setup request; with no zone the domain step simply waits for the customer (NEEDS_INPUT). */
export function buildMediaSetupInput(
    account: Pick<MediaCloudflareAccount, "id" | "name">,
    zone: Pick<MediaCloudflareZone, "id" | "name"> | undefined,
): MediaSetupInput {
    return {
        cloudflareAccountId: account.id,
        cloudflareAccountName: account.name,
        ...(zone ? { zoneId: zone.id, hostname: mediaImageHostname(zone) } : {}),
    };
}
