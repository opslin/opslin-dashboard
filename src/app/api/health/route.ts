import { NextResponse } from "next/server";

// Liveness only: confirms the Next.js server is up and serving requests.
// Does not check the API backend — that's the api container's own healthcheck.
export function GET() {
  return NextResponse.json({ status: "ok" });
}
