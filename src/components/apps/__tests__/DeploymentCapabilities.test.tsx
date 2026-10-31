import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapabilityList } from "../DeploymentCapabilities";
describe("honest feature readiness", () => {
 it("shows missing storage separately from a scheduled but unverified backup", () => {
  render(<CapabilityList capabilities={[
   {kind:"storage",state:"needs_setup",message:"Connect application storage.",actionHref:"/storage"},
   {kind:"backups",state:"scheduled",message:"First backup and restore verification are still pending.",actionHref:"/backups"}
  ]} />);
  expect(screen.getByText("Setup needed")).toBeVisible();
  expect(screen.getByText("Scheduled")).toBeVisible();
  expect(screen.getByText(/First backup and restore verification/)).toBeVisible();
  expect(screen.queryByText("Verified")).not.toBeInTheDocument();
  expect(screen.getByRole("link",{name:"Storage settings"})).toHaveAttribute("href","/storage");
 });
});
