"use client";

/**
 * Premium attack map for the server security page.
 *
 * Uses the same Natural Earth 110m TopoJSON data as the agents page world map
 * for accurate country borders. Markers are placed at real country centroids
 * derived from the TopoJSON, sized by attack count, with an info-toned heat tint
 * applied to each attacking country's border.
 */

import { useEffect, useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath, geoCentroid } from "d3-geo";
import { feature } from "topojson-client";
import { cn } from "@/lib/utils";

type CountryPoint = {
    country: string; // ISO 2-letter code (US, IN, BR, etc.)
    count: number;
};

const MAP_WIDTH = 800;
const MAP_HEIGHT = 380;

// Numeric ISO 3166-1 → ISO alpha-2 lookup. Natural Earth TopoJSON uses
// numeric codes as feature ids; the API returns alpha-2 codes.
const NUMERIC_TO_ALPHA2: Record<string, string> = {
    "004": "AF", "008": "AL", "012": "DZ", "020": "AD", "024": "AO", "032": "AR", "036": "AU",
    "040": "AT", "044": "BS", "048": "BH", "050": "BD", "051": "AM", "052": "BB", "056": "BE",
    "060": "BM", "064": "BT", "068": "BO", "070": "BA", "072": "BW", "076": "BR", "084": "BZ",
    "090": "SB", "096": "BN", "100": "BG", "104": "MM", "108": "BI", "112": "BY", "116": "KH",
    "120": "CM", "124": "CA", "132": "CV", "140": "CF", "144": "LK", "148": "TD", "152": "CL",
    "156": "CN", "158": "TW", "170": "CO", "174": "KM", "178": "CG", "180": "CD", "188": "CR",
    "191": "HR", "192": "CU", "196": "CY", "203": "CZ", "204": "BJ", "208": "DK", "214": "DO",
    "218": "EC", "222": "SV", "226": "GQ", "231": "ET", "232": "ER", "233": "EE", "242": "FJ",
    "246": "FI", "250": "FR", "262": "DJ", "266": "GA", "268": "GE", "270": "GM", "276": "DE",
    "288": "GH", "300": "GR", "320": "GT", "324": "GN", "328": "GY", "332": "HT", "340": "HN",
    "344": "HK", "348": "HU", "352": "IS", "356": "IN", "360": "ID", "364": "IR", "368": "IQ",
    "372": "IE", "376": "IL", "380": "IT", "384": "CI", "388": "JM", "392": "JP", "398": "KZ",
    "400": "JO", "404": "KE", "408": "KP", "410": "KR", "414": "KW", "417": "KG", "418": "LA",
    "422": "LB", "426": "LS", "428": "LV", "430": "LR", "434": "LY", "438": "LI", "440": "LT",
    "442": "LU", "450": "MG", "454": "MW", "458": "MY", "466": "ML", "470": "MT", "478": "MR",
    "480": "MU", "484": "MX", "496": "MN", "498": "MD", "499": "ME", "504": "MA", "508": "MZ",
    "512": "OM", "516": "NA", "524": "NP", "528": "NL", "540": "NC", "548": "VU", "554": "NZ",
    "558": "NI", "562": "NE", "566": "NG", "578": "NO", "586": "PK", "591": "PA", "598": "PG",
    "600": "PY", "604": "PE", "608": "PH", "616": "PL", "620": "PT", "624": "GW", "626": "TL",
    "630": "PR", "634": "QA", "642": "RO", "643": "RU", "646": "RW", "682": "SA", "686": "SN",
    "688": "RS", "690": "SC", "694": "SL", "702": "SG", "703": "SK", "704": "VN", "705": "SI",
    "706": "SO", "710": "ZA", "716": "ZW", "724": "ES", "728": "SS", "729": "SD", "740": "SR",
    "748": "SZ", "752": "SE", "756": "CH", "760": "SY", "762": "TJ", "764": "TH", "768": "TG",
    "780": "TT", "784": "AE", "788": "TN", "792": "TR", "795": "TM", "800": "UG", "804": "UA",
    "807": "MK", "818": "EG", "826": "GB", "834": "TZ", "840": "US", "854": "BF", "858": "UY",
    "860": "UZ", "862": "VE", "882": "WS", "887": "YE", "894": "ZM",
};


// Module-level cache shared with AgentWorldMap for the same TopoJSON
type Topology = unknown;
let cachedTopology: Topology | null = null;
let topologyLoadPromise: Promise<Topology | null> | null = null;

async function loadTopology(): Promise<Topology | null> {
    if (cachedTopology) return cachedTopology;
    if (topologyLoadPromise) return topologyLoadPromise;
    topologyLoadPromise = (async () => {
        try {
            const res = await fetch("/maps/countries-110m.json");
            if (!res.ok) return null;
            const data = await res.json();
            cachedTopology = data;
            return data;
        } catch {
            return null;
        }
    })();
    return topologyLoadPromise;
}

function markerRadius(count: number, max: number) {
    const ratio = count / Math.max(max, 1);
    return 4 + ratio * 12;
}

export function FirewallAttackMap({ countries }: { countries: CountryPoint[] }) {
    const [topologyReady, setTopologyReady] = useState(Boolean(cachedTopology));

    useEffect(() => {
        let mounted = true;
        if (!cachedTopology) {
            loadTopology().then(() => {
                if (mounted) setTopologyReady(true);
            });
        }
        return () => { mounted = false; };
    }, []);

    // Build a lookup of attack counts by alpha-2 code (uppercase)
    const attackByCountry = useMemo(() => {
        const m = new Map<string, number>();
        for (const c of countries) {
            if (c.country) m.set(c.country.toUpperCase(), c.count);
        }
        return m;
    }, [countries]);

    const max = useMemo(() => Math.max(...countries.map(c => c.count), 1), [countries]);

    // Compute country paths, projection, and attack centroids from TopoJSON
    const { countryPaths, attackPoints } = useMemo(() => {
        if (!cachedTopology) return { countryPaths: null, attackPoints: [] };

        const topology = cachedTopology as { objects: { countries: unknown } };
        const geoFC = feature(topology as never, topology.objects.countries as never) as unknown as {
            features: Array<{
                id?: string | number;
                properties?: { name?: string };
                geometry: GeoJSON.Geometry;
            }>;
        };
        const proj = geoNaturalEarth1().fitSize([MAP_WIDTH, MAP_HEIGHT], geoFC as never);
        const pathGen = geoPath(proj);

        const paths = geoFC.features.map((f) => {
            const numericId = typeof f.id === "number" ? String(f.id).padStart(3, "0") : (f.id ? String(f.id).padStart(3, "0") : "");
            const alpha2 = NUMERIC_TO_ALPHA2[numericId] || "";
            const attackCount = alpha2 ? attackByCountry.get(alpha2) || 0 : 0;
            return {
                id: String(f.id ?? f.properties?.name ?? Math.random()),
                name: f.properties?.name ?? "",
                alpha2,
                attackCount,
                path: pathGen(f as never) ?? "",
                feature: f,
            };
        });

        // Build attack markers at country centroids
        const points = paths
            .filter(p => p.attackCount > 0)
            .map(p => {
                const centroid = geoCentroid(p.feature as never);
                const xy = proj(centroid);
                if (!xy) return null;
                return { country: p.alpha2, count: p.attackCount, name: p.name, x: xy[0], y: xy[1] };
            })
            .filter((m): m is { country: string; count: number; name: string; x: number; y: number } => m !== null);

        return { countryPaths: paths, attackPoints: points };
    }, [topologyReady, attackByCountry]);

    return (
        <div className={cn("relative w-full")}>
            <svg
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                className="w-full h-auto"
                role="img"
                aria-label="World map showing attack source countries"
                preserveAspectRatio="xMidYMid meet"
            >
                <defs>
                    <radialGradient id="attack-pulse" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="var(--opslin-info-default)" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="var(--opslin-info-default)" stopOpacity="0" />
                    </radialGradient>
                </defs>

                {/* Country borders — accurate Natural Earth TopoJSON */}
                {countryPaths ? (
                    <g>
                        {countryPaths.map((f) => {
                            const intensity = f.attackCount > 0 ? Math.min(f.attackCount / max, 1) : 0;
                            // Country fill: neutral by default, info-toned tint for attacking countries
                            const fill = intensity > 0
                                ? `color-mix(in srgb, var(--opslin-info-default) ${Math.round((0.15 + intensity * 0.45) * 100)}%, transparent)`
                                : "var(--opslin-bg-tertiary)";
                            const stroke = intensity > 0 ? "var(--opslin-info-default)" : "var(--opslin-border-strong)";
                            return (
                                <path
                                    key={f.id}
                                    d={f.path}
                                    fill={fill}
                                    stroke={stroke}
                                    strokeWidth={intensity > 0 ? 0.7 : 0.5}
                                    opacity="0.95"
                                />
                            );
                        })}
                    </g>
                ) : (
                    <g opacity="0.3">
                        <rect x="100" y="80" width="200" height="120" fill="var(--opslin-bg-tertiary)" rx="8" />
                        <rect x="380" y="60" width="180" height="140" fill="var(--opslin-bg-tertiary)" rx="8" />
                        <rect x="600" y="100" width="160" height="100" fill="var(--opslin-bg-tertiary)" rx="8" />
                        <rect x="450" y="220" width="120" height="100" fill="var(--opslin-bg-tertiary)" rx="8" />
                    </g>
                )}

                {/* Attack markers at country centroids */}
                {attackPoints.map((m) => {
                    const r = markerRadius(m.count, max);
                    const intensity = m.count / max;
                    return (
                        <g key={m.country}>
                            <circle cx={m.x} cy={m.y} r={r * 2.2} fill="url(#attack-pulse)" opacity={0.5 + intensity * 0.4} />
                            <circle cx={m.x} cy={m.y} r={r + 2} fill="none" stroke="var(--opslin-info-default)" strokeOpacity={0.4 + intensity * 0.5} strokeWidth="1" />
                            <circle cx={m.x} cy={m.y} r={r} fill="var(--opslin-info-default)" fillOpacity={0.85} stroke="var(--opslin-bg-inverse)" strokeWidth="1.2" />
                            <text x={m.x} y={m.y - r - 5} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--opslin-text-primary)">
                                {m.country}
                            </text>
                            <text x={m.x} y={m.y + r + 11} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--opslin-info-default)">
                                {m.count.toLocaleString()}
                            </text>
                        </g>
                    );
                })}
            </svg>

            {countryPaths && attackPoints.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-xs text-muted-foreground bg-card/80 px-3 py-1 rounded-md">
                        No attack telemetry recorded yet
                    </p>
                </div>
            )}
        </div>
    );
}
