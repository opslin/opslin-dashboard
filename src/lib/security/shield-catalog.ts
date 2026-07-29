/**
 * Closed Shield catalog — the single source of truth for all recognized
 * protection identifiers, their display metadata, and canonical ordering.
 *
 * Requirements: 3.4, 12.1
 * Design: closed Shield catalog decision; supports Properties P2, P11
 */

/**
 * The nine recognized Shield identifiers in canonical order.
 * This tuple is the authoritative source for the Shield union type.
 */
export const SHIELDS = Object.freeze([
  "Firewall_Shield",
  "Route_Guard",
  "Edge_Protection",
  "Runtime_Isolation",
  "Traffic_Guard",
  "Threat_Shield",
  "DDoS_Guard",
  "SSL_Shield",
  "Policy_Lock",
] as const);

/**
 * Union type of all recognized Shield identifiers.
 */
export type Shield = (typeof SHIELDS)[number];

/**
 * Canonical ordering of Shields used by Active and Locked bundle sections.
 * Alias of SHIELDS for semantic clarity in consumer code.
 */
export const SHIELD_ORDER: readonly Shield[] = SHIELDS;

/**
 * Metadata descriptor for a single Shield entry in the catalog.
 */
export interface ShieldDescriptor {
  /** The Shield identifier. */
  id: Shield;
  /** User-facing display label (e.g. "Firewall Shield"). */
  displayLabel: string;
  /** Key mapped to a lucide-react icon component in ShieldTile. */
  iconKey: string;
  /**
   * Plain-language helper text (≤140 chars).
   * No unexpanded acronyms from the blocklist.
   */
  helperText: string;
  /** Stable priority for iteration (1..9, unique per shield). */
  priority: number;
}

/**
 * The complete Shield catalog keyed by Shield identifier.
 * Frozen at runtime to prevent accidental mutation.
 */
export const SHIELD_CATALOG: Readonly<Record<Shield, ShieldDescriptor>> = Object.freeze({
  Firewall_Shield: {
    id: "Firewall_Shield",
    displayLabel: "Firewall Shield",
    iconKey: "shield",
    helperText:
      "Blocks unauthorized network traffic before it reaches your app, keeping unwanted visitors out.",
    priority: 1,
  },
  Route_Guard: {
    id: "Route_Guard",
    displayLabel: "Route Guard",
    iconKey: "route",
    helperText:
      "Validates every incoming request path so only legitimate routes are served to visitors.",
    priority: 2,
  },
  Edge_Protection: {
    id: "Edge_Protection",
    displayLabel: "Edge Protection",
    iconKey: "globe",
    helperText:
      "Filters malicious traffic at the network edge before it enters your infrastructure.",
    priority: 3,
  },
  Runtime_Isolation: {
    id: "Runtime_Isolation",
    displayLabel: "Runtime Isolation",
    iconKey: "box",
    helperText:
      "Runs your app in a sandboxed container so a compromise cannot spread to other services.",
    priority: 4,
  },
  Traffic_Guard: {
    id: "Traffic_Guard",
    displayLabel: "Traffic Guard",
    iconKey: "activity",
    helperText:
      "Monitors request volume and throttles abusive patterns to keep your app responsive.",
    priority: 5,
  },
  Threat_Shield: {
    id: "Threat_Shield",
    displayLabel: "Threat Shield",
    iconKey: "shield-alert",
    helperText:
      "Detects known attack signatures in real time and blocks them before they cause harm.",
    priority: 6,
  },
  DDoS_Guard: {
    id: "DDoS_Guard",
    displayLabel: "DDoS Guard",
    iconKey: "shield-off",
    helperText:
      "Absorbs distributed denial-of-service (DDoS) floods so your app stays online under attack.",
    priority: 7,
  },
  SSL_Shield: {
    id: "SSL_Shield",
    displayLabel: "SSL Shield",
    iconKey: "lock",
    helperText:
      "Encrypts all data in transit with Transport Layer Security (TLS) certificates managed for you.",
    priority: 8,
  },
  Policy_Lock: {
    id: "Policy_Lock",
    displayLabel: "Policy Lock",
    iconKey: "file-lock",
    helperText:
      "Enforces organization-wide security policies so no app can bypass your compliance rules.",
    priority: 9,
  },
});
