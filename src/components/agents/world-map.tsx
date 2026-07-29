"use client";

/**
 * Premium quality world map for the Agents page.
 *
 * Uses the official Natural Earth 110m TopoJSON (~107KB) loaded once and
 * cached. Renders 177 countries with accurate borders (including India)
 * using d3-geo's natural earth projection.
 *
 * Lightweight:
 * - d3-geo: ~10KB gzipped
 * - topojson-client: ~2KB gzipped
 * - countries-110m.json: ~107KB (cached after first load)
 * - Renders as ~177 SVG paths (one per country)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// IP → region lookup (offline)
// ---------------------------------------------------------------------------

interface RegionLocation {
  city: string;
  country: string;
  lat: number;
  lng: number;
}

const KNOWN_REGIONS: Array<{ prefix: string; loc: RegionLocation }> = [
  // AWS Mumbai
  { prefix: "13.232.", loc: { city: "Mumbai", country: "IN", lat: 19.076, lng: 72.877 } },
  { prefix: "13.233.", loc: { city: "Mumbai", country: "IN", lat: 19.076, lng: 72.877 } },
  { prefix: "13.234.", loc: { city: "Mumbai", country: "IN", lat: 19.076, lng: 72.877 } },
  { prefix: "13.235.", loc: { city: "Mumbai", country: "IN", lat: 19.076, lng: 72.877 } },
  { prefix: "65.0.", loc: { city: "Mumbai", country: "IN", lat: 19.076, lng: 72.877 } },
  { prefix: "65.1.", loc: { city: "Mumbai", country: "IN", lat: 19.076, lng: 72.877 } },
  // AWS Singapore
  { prefix: "13.212.", loc: { city: "Singapore", country: "SG", lat: 1.352, lng: 103.819 } },
  { prefix: "13.213.", loc: { city: "Singapore", country: "SG", lat: 1.352, lng: 103.819 } },
  { prefix: "13.214.", loc: { city: "Singapore", country: "SG", lat: 1.352, lng: 103.819 } },
  // AWS US-East-1
  { prefix: "3.80.", loc: { city: "N. Virginia", country: "US", lat: 38.946, lng: -77.444 } },
  { prefix: "3.81.", loc: { city: "N. Virginia", country: "US", lat: 38.946, lng: -77.444 } },
  { prefix: "3.82.", loc: { city: "N. Virginia", country: "US", lat: 38.946, lng: -77.444 } },
  { prefix: "3.83.", loc: { city: "N. Virginia", country: "US", lat: 38.946, lng: -77.444 } },
  { prefix: "54.80.", loc: { city: "N. Virginia", country: "US", lat: 38.946, lng: -77.444 } },
  // AWS US-West-2
  { prefix: "34.208.", loc: { city: "Oregon", country: "US", lat: 45.875, lng: -119.27 } },
  { prefix: "35.160.", loc: { city: "Oregon", country: "US", lat: 45.875, lng: -119.27 } },
  // AWS EU
  { prefix: "3.248.", loc: { city: "Dublin", country: "IE", lat: 53.349, lng: -6.260 } },
  { prefix: "3.249.", loc: { city: "Dublin", country: "IE", lat: 53.349, lng: -6.260 } },
  { prefix: "3.64.", loc: { city: "Frankfurt", country: "DE", lat: 50.110, lng: 8.682 } },
  { prefix: "18.184.", loc: { city: "Frankfurt", country: "DE", lat: 50.110, lng: 8.682 } },
  { prefix: "3.8.", loc: { city: "London", country: "GB", lat: 51.507, lng: -0.127 } },
  { prefix: "3.9.", loc: { city: "London", country: "GB", lat: 51.507, lng: -0.127 } },
  { prefix: "18.130.", loc: { city: "London", country: "GB", lat: 51.507, lng: -0.127 } },
  // AWS APAC
  { prefix: "3.112.", loc: { city: "Tokyo", country: "JP", lat: 35.689, lng: 139.692 } },
  { prefix: "13.112.", loc: { city: "Tokyo", country: "JP", lat: 35.689, lng: 139.692 } },
  { prefix: "3.104.", loc: { city: "Sydney", country: "AU", lat: -33.868, lng: 151.209 } },
  { prefix: "13.236.", loc: { city: "Sydney", country: "AU", lat: -33.868, lng: 151.209 } },
  // DigitalOcean NY
  { prefix: "159.89.", loc: { city: "New York", country: "US", lat: 40.713, lng: -74.006 } },
  { prefix: "165.227.", loc: { city: "New York", country: "US", lat: 40.713, lng: -74.006 } },
  { prefix: "167.99.", loc: { city: "New York", country: "US", lat: 40.713, lng: -74.006 } },
  { prefix: "104.131.", loc: { city: "New York", country: "US", lat: 40.713, lng: -74.006 } },
  // Localhost
  { prefix: "127.", loc: { city: "Local", country: "??", lat: 0, lng: 0 } },
  { prefix: "192.168.", loc: { city: "Local", country: "??", lat: 0, lng: 0 } },
  { prefix: "10.", loc: { city: "Local", country: "??", lat: 0, lng: 0 } },
  { prefix: "172.16.", loc: { city: "Local", country: "??", lat: 0, lng: 0 } },
];

export function locationForIp(ip?: string | null): RegionLocation | null {
  if (!ip) return null;
  for (const { prefix, loc } of KNOWN_REGIONS) {
    if (ip.startsWith(prefix)) return loc;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Map dimensions
// ---------------------------------------------------------------------------

const MAP_WIDTH = 800;
const MAP_HEIGHT = 380;

// Module-level cache for topology — loaded once, reused everywhere
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

// ---------------------------------------------------------------------------
// Marker types
// ---------------------------------------------------------------------------

export interface AgentMapMarker {
  id: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  online: boolean;
  agentCount: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentWorldMap({
  markers,
  highlightedId,
  className,
}: {
  markers: AgentMapMarker[];
  highlightedId?: string | null;
  className?: string;
}) {
  // Use a counter to trigger re-render when topology loads
  const [topologyReady, setTopologyReady] = useState(Boolean(cachedTopology));

  useEffect(() => {
    let mounted = true;
    if (!cachedTopology) {
      loadTopology().then(() => {
        if (mounted) setTopologyReady(true);
      });
    }
    return () => {
      mounted = false;
    };
  }, []);

  // Build country paths and projection from cached topology — recomputed
  // only when topology becomes available.
  const { countryPaths, projector } = useMemo(() => {
    if (!cachedTopology) {
      return { countryPaths: null, projector: null };
    }
    const topology = cachedTopology as {
      objects: { countries: unknown };
    };
    const geoFC = feature(topology as any, topology.objects.countries as any) as unknown as {
      features: Array<{
        id?: string | number;
        properties?: { name?: string };
        geometry: GeoJSON.Geometry;
      }>;
    };
    const proj = geoNaturalEarth1().fitSize([MAP_WIDTH, MAP_HEIGHT], geoFC as any);
    const pathGen = geoPath(proj);
    const paths = geoFC.features.map((f) => ({
      id: String(f.id ?? f.properties?.name ?? Math.random()),
      name: f.properties?.name ?? "",
      path: pathGen(f as any) ?? "",
    }));
    return { countryPaths: paths, projector: proj };
  }, [topologyReady]);

  // Cluster markers within ~5° of each other
  const clusters = useMemo(() => {
    const merged: AgentMapMarker[] = [];
    for (const m of markers) {
      const existing = merged.find(
        (x) => Math.abs(x.lat - m.lat) < 5 && Math.abs(x.lng - m.lng) < 5
      );
      if (existing) {
        existing.agentCount += m.agentCount;
        if (!existing.online && m.online) existing.online = true;
      } else {
        merged.push({ ...m });
      }
    }
    return merged;
  }, [markers]);

  // Project markers to SVG coords (only when projector is ready)
  const projectedMarkers = useMemo(() => {
    if (!projector) return [];
    return clusters
      .map((m) => {
        try {
          const xy = projector([m.lng, m.lat]);
          if (!xy) return null;
          return { ...m, x: xy[0], y: xy[1] };
        } catch {
          return null;
        }
      })
      .filter((m): m is AgentMapMarker & { x: number; y: number } => m !== null);
  }, [clusters, projector]);

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="World map showing agent locations"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="transparent" />

        {/* Country borders */}
        {countryPaths ? (
          <g>
            {countryPaths.map((f) => (
              <path
                key={f.id}
                d={f.path}
                fill="#e2e8f0"
                stroke="#cbd5e1"
                strokeWidth="0.5"
                opacity="0.9"
              />
            ))}
          </g>
        ) : (
          <g opacity="0.3">
            <rect x="100" y="80" width="200" height="120" fill="#e2e8f0" rx="8" />
            <rect x="380" y="60" width="180" height="140" fill="#e2e8f0" rx="8" />
            <rect x="600" y="100" width="160" height="100" fill="#e2e8f0" rx="8" />
            <rect x="450" y="220" width="120" height="100" fill="#e2e8f0" rx="8" />
          </g>
        )}

        {/* Markers */}
        {projectedMarkers.map((m) => {
          const isHighlighted = highlightedId === m.id;
          const color = m.online ? "#10b981" : "#94a3b8";
          return (
            <g key={m.id}>
              {m.online && (
                <circle cx={m.x} cy={m.y} r={12} fill={color} opacity="0.2">
                  <animate attributeName="r" from="6" to="18" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.4" to="0" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={m.x} cy={m.y} r={isHighlighted ? 7 : 5.5} fill="white" stroke={color} strokeWidth="2" />
              <circle cx={m.x} cy={m.y} r={isHighlighted ? 3.5 : 2.5} fill={color} />

              <g transform={`translate(${m.x + 10}, ${m.y - 8})`}>
                <rect
                  x={0}
                  y={0}
                  width={Math.max(56, m.city.length * 5.5 + 26)}
                  height={28}
                  rx={5}
                  fill="white"
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
                <text x={6} y={11} fontSize="9" fill="#0f172a" fontWeight="600">
                  {m.city}
                </text>
                <text x={6} y={22} fontSize="8" fill="#64748b">
                  {m.agentCount} agent{m.agentCount === 1 ? "" : "s"}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {countryPaths && projectedMarkers.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-xs text-slate-400 bg-white/80 px-3 py-1 rounded-md">
            No agent locations detected
          </p>
        </div>
      )}
    </div>
  );
}
