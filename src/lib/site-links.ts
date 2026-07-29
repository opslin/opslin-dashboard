const landingUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://opslin.opslin.com";
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.opslin.com";
const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? "https://admin.opslin.com";
const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? "https://docs.opslin.com";

export const siteLinks = {
  landing: landingUrl,
  dashboard: process.env.NEXT_PUBLIC_DASHBOARD_URL ?? appUrl,
  app: appUrl,
  admin: adminUrl,
  api: process.env.NEXT_PUBLIC_API_URL ?? "https://api.opslin.com",
  docs: `${docsUrl}/docs`,
  login: `${appUrl}/login`,
  register: `${appUrl}/register`,
  contactEmail: "hello@opslin.com",
};
