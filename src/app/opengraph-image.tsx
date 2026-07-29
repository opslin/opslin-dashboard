import { ImageResponse } from "next/og";

export const alt = "Opslin dark deployment dashboard preview";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0A0A0A",
          color: "#FFFFFF",
          fontFamily: "Inter, Arial, sans-serif",
          padding: 72,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 72% 72%, rgba(99,102,241,0.24), transparent 38%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            border: "1px solid #1F1F1F",
            borderRadius: 32,
            background: "rgba(17,17,17,0.82)",
            padding: 56,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em" }}>Opslin</div>
            <div
              style={{
                border: "1px solid #312E81",
                borderRadius: 999,
                color: "#C7D2FE",
                fontSize: 22,
                padding: "10px 18px",
              }}
            >
              VPS control plane
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 820 }}>
            <div
              style={{
                margin: 0,
                fontSize: 76,
                lineHeight: 1.03,
                letterSpacing: "-0.04em",
                fontWeight: 700,
              }}
            >
              Deploy apps on your own VPS without DevOps complexity.
            </div>
            <p style={{ margin: 0, color: "#A1A1AA", fontSize: 30, lineHeight: 1.35 }}>
              Git deploys, SSL, logs, monitoring, databases, and rollback from one dashboard.
            </p>
          </div>
          <div style={{ display: "flex", gap: 18, color: "#A1A1AA", fontSize: 22 }}>
            <span>Git deploys</span>
            <span>SSL automation</span>
            <span>Outbound-only agent</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
