import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FailureReportDialog } from "./failure-report-dialog";
import { parseFailureReport, type FailureReport } from "@/lib/failure-report";

// Doc 75 M6. When a deploy fails or pauses, the owner reads one plain explanation in a dialog: what is missing in a highlighted
// box, what the app said in its own words, what Opslin already did, what to do next, and the technical details hidden.

const base = {
  version: 1, stage: "verify", cause: "missing_settings", outcome: "needs_configuration",
  title: "This app needs one setting before it can start: WHATSAPP_AUTH_MASTER_KEY",
  summary: "The app itself reported this setting as missing, so it cannot run until you give it.",
  missing: [{ kind: "setting", name: "WHATSAPP_AUTH_MASTER_KEY", why: "WHATSAPP_AUTH_MASTER_KEY is not set, and the app stops at start without it.", foundIn: "src/server/env.ts", howToFix: "Add it under the app's Environment settings, then deploy again.", generate: null }],
  appSaid: "Invalid environment configuration: WHATSAPP_AUTH_MASTER_KEY", opslinDid: ["Opslin tried 2 automatic fixes. They could not help."],
  nextSteps: ["Open the app's Environment settings and fix the setting(s) listed above.", "Press Deploy again (or restart the app)."], technical: "Error: Invalid environment configuration at getEnv",
};
const report = (over: Record<string, unknown> = {}): FailureReport => parseFailureReport({ ...base, ...over })!;
const setup = (r: FailureReport, extra: Partial<React.ComponentProps<typeof FailureReportDialog>> = {}) => {
  const props = { report: r, open: true, onOpenChange: vi.fn(), onFillSettings: vi.fn(), onDeployAgain: vi.fn(), ...extra };
  render(<FailureReportDialog {...props} />);
  return props;
};

describe("FailureReportDialog", () => {
  it("shows the title, the summary and a plain status for who has to act", () => {
    setup(report());
    expect(screen.getByRole("dialog", { name: /needs one setting/i })).toBeTruthy();
    expect(screen.getByText(/cannot run until you give it/i)).toBeTruthy();
    expect(screen.getByText("Needs your input")).toBeTruthy();
  });

  it("puts what is missing in its own highlighted box, with where it was found and how to fix it", () => {
    setup(report());
    const box = screen.getByTestId("failure-missing");
    expect(within(box).getByText("What is missing")).toBeTruthy();
    expect(within(box).getByText("WHATSAPP_AUTH_MASTER_KEY")).toBeTruthy();
    expect(within(box).getByText(/stops at start without it/i)).toBeTruthy();
    expect(within(box).getByText("src/server/env.ts")).toBeTruthy();
    expect(within(box).getByText(/Add it under the app's Environment settings/)).toBeTruthy();
  });

  it("quotes what the app said, and lists what Opslin already did and the next steps", () => {
    setup(report());
    expect(screen.getByText("What the app said")).toBeTruthy();
    expect(screen.getByText("Invalid environment configuration: WHATSAPP_AUTH_MASTER_KEY")).toBeTruthy();
    expect(screen.getByText("What Opslin already did")).toBeTruthy();
    expect(screen.getByText(/Opslin tried 2 automatic fixes/)).toBeTruthy();
    const steps = screen.getByTestId("failure-steps");
    expect(within(steps).getAllByRole("listitem")).toHaveLength(2);
  });

  it("leaves out the sections that have nothing in them", () => {
    setup(report({ missing: [], appSaid: null, opslinDid: [], nextSteps: [], outcome: "unknown" }));
    for (const heading of ["What is missing", "What the app said", "What Opslin already did", "What to do next"]) expect(screen.queryByText(heading)).toBeNull();
    expect(screen.getByText("Could not tell exactly")).toBeTruthy();
  });

  it("keeps the technical details closed until asked, and shows them as text", () => {
    setup(report({ technical: "<img src=x onerror=alert(1)> raw log" }));
    const details = screen.getByText("Technical details").closest("details")!;
    expect(details.hasAttribute("open")).toBe(false);
    expect(screen.getByText(/<img src=x onerror=alert\(1\)> raw log/)).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("a missing setting offers one main action that hands the names to the deploy form, then closes", () => {
    const props = setup(report());
    fireEvent.click(screen.getByRole("button", { name: "Add the settings and deploy again" }));
    expect(props.onFillSettings).toHaveBeenCalledWith([{ name: "WHATSAPP_AUTH_MASTER_KEY", why: expect.stringContaining("not set") }]);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onDeployAgain).not.toHaveBeenCalled();
  });

  it("without any setting to add, the main action is Deploy again", () => {
    const props = setup(report({ outcome: "opslin_defect", missing: [], title: "Opslin could not finish this deploy" }));
    expect(screen.queryByRole("button", { name: "Add the settings and deploy again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Deploy again" }));
    expect(props.onDeployAgain).toHaveBeenCalled();
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("a missing file is a fix in the owner's repository: no input is offered for it", () => {
    setup(report({ outcome: "application_defect", missing: [{ kind: "file", name: "drizzle/meta/_journal.json", why: "Drizzle needs it.", howToFix: "Commit it." }] }));
    expect(screen.getByText("Fix in your project")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add the settings and deploy again" })).toBeNull();
    expect(screen.getByText("drizzle/meta/_journal.json")).toBeTruthy();
  });

  it("Close closes it, and a closed dialog renders nothing", () => {
    const props = setup(report());
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("each outcome has its own plain label", () => {
    const labels: Array<[string, string]> = [["needs_configuration", "Needs your input"], ["application_defect", "Fix in your project"], ["opslin_defect", "Problem on Opslin's side"], ["infrastructure", "Problem with the server"], ["unknown", "Could not tell exactly"]];
    for (const [outcome, label] of labels) {
      const { unmount } = render(<FailureReportDialog report={report({ outcome, missing: [] })} open onOpenChange={vi.fn()} onFillSettings={vi.fn()} onDeployAgain={vi.fn()} />);
      expect(screen.getByText(label)).toBeTruthy();
      unmount();
    }
  });
});

describe("FailureReportDialog: add and continue (doc 75 M3)", () => {
  const resumable = () => report({ resume: { serverId: "srv-1", appId: "app-1" }, missing: [
    { kind: "setting", name: "WHATSAPP_AUTH_MASTER_KEY", why: "Not set.", howToFix: "Add it." },
    { kind: "setting", name: "OWNER_EMAIL", why: "Not set.", howToFix: "Add it." },
    { kind: "file", name: "x.json", why: "Missing.", howToFix: "Commit it." },
  ] });

  it("asks for each missing setting right in the dialog, hiding secret-looking values, and none for a file", () => {
    setup(resumable(), { onContinue: vi.fn() });
    expect((screen.getByLabelText("WHATSAPP_AUTH_MASTER_KEY") as HTMLInputElement).type).toBe("password");
    expect((screen.getByLabelText("OWNER_EMAIL") as HTMLInputElement).type).toBe("text");
    expect(screen.queryByLabelText("x.json")).toBeNull();
  });

  it("Add and continue stays disabled until every value is typed, then hands the values over", () => {
    const props = setup(resumable(), { onContinue: vi.fn() });
    const go = screen.getByRole("button", { name: "Add and continue" });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText("WHATSAPP_AUTH_MASTER_KEY"), { target: { value: "k".repeat(44) } });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText("OWNER_EMAIL"), { target: { value: " me@example.com " } });
    expect(go).toBeEnabled();
    fireEvent.click(go);
    expect(props.onContinue).toHaveBeenCalledWith({ WHATSAPP_AUTH_MASTER_KEY: "k".repeat(44), OWNER_EMAIL: "me@example.com" });
  });

  it("shows a working state and the error when saving fails, and keeps what was typed", async () => {
    const onContinue = vi.fn(async () => { throw new Error("Could not save"); });
    setup(resumable(), { onContinue });
    fireEvent.change(screen.getByLabelText("WHATSAPP_AUTH_MASTER_KEY"), { target: { value: "abc" } });
    fireEvent.change(screen.getByLabelText("OWNER_EMAIL"), { target: { value: "a@b.c" } });
    fireEvent.click(screen.getByRole("button", { name: "Add and continue" }));
    expect(await screen.findByText("Could not save")).toBeTruthy();
    expect((screen.getByLabelText("WHATSAPP_AUTH_MASTER_KEY") as HTMLInputElement).value).toBe("abc");
    expect(screen.getByRole("button", { name: "Add and continue" })).toBeEnabled();
  });

  it("without a resume target the earlier behaviour stays (names go to the deploy form)", () => {
    setup(report(), { onContinue: vi.fn() });
    expect(screen.queryByRole("button", { name: "Add and continue" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add the settings and deploy again" })).toBeTruthy();
  });
});
