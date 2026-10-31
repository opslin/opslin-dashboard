import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanPreviewRows, planBlocksDeploy } from "../PlanPreview";
import type { PlanPreview } from "@/lib/deploy-route-types";

const ready: PlanPreview = {
    verdict: "ready",
    services: [{ id: "apps-backend", role: "backend", path: "apps/backend" }, { id: "apps-web", role: "frontend", path: "apps/web" }, { id: "apps-backend-worker", role: "worker", path: "apps/backend" }],
    resources: [{ id: "postgres", kind: "postgres", usedBy: ["apps-backend"] }, { id: "redis", kind: "redis", usedBy: ["apps-backend"] }],
    skipped: [],
    steps: [{ kind: "migrate", service: "apps-backend", command: "npx prisma migrate deploy" }],
    questions: [],
    persistent: [],
};

describe("PlanPreviewRows (doc 64 S1.8)", () => {
    it("shows the apps, what Opslin creates with real logos, and the release step", () => {
        const { container } = render(<PlanPreviewRows plan={ready} />);
        expect(screen.getByText("3 apps")).toBeTruthy();
        expect(screen.getByText("API, website, background worker")).toBeTruthy();
        expect(screen.getByText("PostgreSQL, Redis")).toBeTruthy();
        expect([...container.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toEqual(["/brands/postgresql.svg", "/brands/redis.svg"]);
        expect(screen.getByText("On every release")).toBeTruthy();
        expect(screen.getByText("Database migration").getAttribute("title")).toBe("npx prisma migrate deploy");
        expect(screen.queryByText(/Not created/)).toBeNull();
        expect(planBlocksDeploy(ready)).toBe(false);
    });

    // Doc 67: a deploy no longer creates a storage bucket; the owner connects storage after the deploy.
    it("lists object storage as something the owner connects, not something Opslin creates", () => {
        const plan: PlanPreview = { ...ready, resources: [{ id: "postgres", kind: "postgres", usedBy: ["api"] }, { id: "object_storage", kind: "object_storage", usedBy: ["api"] }] };
        render(<PlanPreviewRows plan={plan} />);
        expect(screen.getByText("PostgreSQL")).toBeTruthy();
        expect(screen.queryByText(/Cloudflare R2 bucket/)).toBeNull();
        expect(screen.getByText("You connect after deploy")).toBeTruthy();
        expect(screen.getByText("Storage (Cloudflare R2 or S3)")).toBeTruthy();
    });

    it("names a skipped resource with its reason behind Why", () => {
        render(<PlanPreviewRows plan={{ ...ready, skipped: [{ kind: "redis", reason: "the app's own configuration does not use Redis (QUEUE_CONNECTION=sync)" }] }} />);
        expect(screen.getByText("Not created")).toBeTruthy();
        expect(screen.getByText(/QUEUE_CONNECTION=sync/)).toBeTruthy();
    });

    it("shows a question that needs an answer, without blocking", () => {
        const plan: PlanPreview = { ...ready, verdict: "needs_input", questions: [{ code: "ambiguous_backend", severity: "needs_input", message: "apps-web reads API_URL, but two backends exist." }] };
        render(<PlanPreviewRows plan={plan} />);
        expect(screen.getByText("Needs an answer")).toBeTruthy();
        expect(screen.getByText("apps-web reads API_URL, but two backends exist.")).toBeTruthy();
        expect(planBlocksDeploy(plan)).toBe(false);
    });

    it("keeps an unsupported project visible, locked, with the reason (DESIGN P4)", () => {
        const plan: PlanPreview = { verdict: "unsupported", services: [], resources: [], skipped: [], steps: [], persistent: [], questions: [{ code: "unsupported", severity: "unsupported", message: "Unsupported: this repository has 8 or more separately built services (src/a, src/b). Nothing was created." }] };
        render(<PlanPreviewRows plan={plan} />);
        expect(screen.getByText("Opslin can't deploy this project yet")).toBeTruthy();
        expect(screen.getByText(/^this repository has 8 or more separately built services/i)).toBeTruthy();
        expect(screen.queryByText("Opslin creates")).toBeNull();
        expect(planBlocksDeploy(plan)).toBe(true);
    });
});

describe("kept folders (doc 64 S2.3)", () => {
    it("shows the folders kept across releases", () => {
        render(<PlanPreviewRows plan={{ ...ready, persistent: [{ service: "apps-backend", path: "uploads" }, { service: "apps-backend", path: "storage/app" }] }} />);
        expect(screen.getByText("Kept across releases")).toBeTruthy();
        expect(screen.getByText("uploads, storage/app")).toBeTruthy();
    });
    it("shows no row when nothing is kept", () => {
        render(<PlanPreviewRows plan={ready} />);
        expect(screen.queryByText("Kept across releases")).toBeNull();
    });
});

describe("PlanPreviewRows for Kubernetes files (doc 64 S4)", () => {
    const running = ["frontend", "cartservice", "redis-cart"].map((name) => ({ name, image: `${name}:v1`, memoryMb: 128, oneShot: false }));
    const k8s: PlanPreview = {
        verdict: "ready",
        services: running.map((s) => ({ id: s.name, role: s.name === "frontend" ? "frontend" : "unknown", path: s.name })),
        resources: [], skipped: [], steps: [], questions: [], persistent: [],
        kubernetes: {
            files: ["release/kubernetes-manifests.yaml"],
            services: [...running, { name: "loadgenerator-init-1", image: "busybox:1", memoryMb: null, oneShot: true }],
            publicService: { name: "frontend", port: 8080 },
            transforms: ["emailservice: Service port 5000 reaches container port 8080; addresses using emailservice:5000 now use 8080.", "loadgenerator: runs 1 copy instead of 2."],
            refusals: [],
            memoryMb: 384,
        },
    };

    it("shows the translated services, the public one and what changed for one server", () => {
        render(<PlanPreviewRows plan={k8s} />);
        expect(screen.getByText("3 services")).toBeTruthy();
        expect(screen.getByText("From Kubernetes files · frontend is public")).toBeTruthy();
        expect(screen.getByText("Changed for one server")).toBeTruthy();
        expect(screen.getByText(/runs 1 copy instead of 2/)).toBeTruthy();
        expect(screen.getByText("0.4 GB declared")).toBeTruthy();
        expect(screen.queryByText(/apps$/)).toBeNull();
        expect(planBlocksDeploy(k8s)).toBe(false);
    });
});
