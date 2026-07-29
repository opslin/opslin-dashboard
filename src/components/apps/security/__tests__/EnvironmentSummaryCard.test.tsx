import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EnvironmentSummaryCard } from "../EnvironmentSummaryCard";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("EnvironmentSummaryCard", () => {
  const APP_ID = "test-app-123";

  describe("count display (Requirement 9.1)", () => {
    it("renders count 0 when envVars is an empty object", () => {
      render(<EnvironmentSummaryCard envVars={{}} appId={APP_ID} />);

      const countEl = screen.getByTestId("env-count");
      expect(countEl).toBeInTheDocument();
      expect(countEl.textContent).toContain("0");
    });

    it("renders count 1 when envVars has one entry", () => {
      render(
        <EnvironmentSummaryCard envVars={{ SECRET_KEY: "s3cr3t" }} appId={APP_ID} />
      );

      const countEl = screen.getByTestId("env-count");
      expect(countEl.textContent).toContain("1");
    });

    it("renders count N when envVars has N entries", () => {
      const envVars: Record<string, string> = {
        DB_HOST: "localhost",
        DB_PORT: "5432",
        DB_USER: "admin",
        DB_PASS: "password123",
        API_KEY: "abc-xyz-789",
      };
      render(<EnvironmentSummaryCard envVars={envVars} appId={APP_ID} />);

      const countEl = screen.getByTestId("env-count");
      expect(countEl.textContent).toContain("5");
    });

    it("renders count exactly once", () => {
      render(
        <EnvironmentSummaryCard
          envVars={{ A: "1", B: "2", C: "3" }}
          appId={APP_ID}
        />
      );

      const countElements = screen.getAllByTestId("env-count");
      expect(countElements).toHaveLength(1);
    });

    it("renders count 0 when envVars is null", () => {
      render(<EnvironmentSummaryCard envVars={null} appId={APP_ID} />);

      const countEl = screen.getByTestId("env-count");
      expect(countEl.textContent).toContain("0");
    });
  });

  describe("no env-var keys or values exposed (Requirement 9.2)", () => {
    it("does not render any key from envVars in the DOM text", () => {
      const envVars: Record<string, string> = {
        MY_SECRET_KEY: "super-secret-value",
        DATABASE_URL: "postgres://user:pass@host/db",
        STRIPE_API_KEY: "sk_live_abc123",
      };
      render(<EnvironmentSummaryCard envVars={envVars} appId={APP_ID} />);

      const container = screen.getByTestId("env-count").closest("[class]")!
        .parentElement!.parentElement!;
      const textContent = container.textContent ?? "";

      for (const key of Object.keys(envVars)) {
        expect(textContent).not.toContain(key);
      }
    });

    it("does not render any value from envVars in the DOM text", () => {
      const envVars: Record<string, string> = {
        MY_SECRET_KEY: "super-secret-value",
        DATABASE_URL: "postgres://user:pass@host/db",
        STRIPE_API_KEY: "sk_live_abc123",
      };
      render(<EnvironmentSummaryCard envVars={envVars} appId={APP_ID} />);

      const container = screen.getByTestId("env-count").closest("[class]")!
        .parentElement!.parentElement!;
      const textContent = container.textContent ?? "";

      for (const value of Object.values(envVars)) {
        expect(textContent).not.toContain(value);
      }
    });
  });

  describe("encryption-at-rest statement (Requirement 9.5)", () => {
    it("renders the encryption statement exactly once", () => {
      render(
        <EnvironmentSummaryCard envVars={{ KEY: "val" }} appId={APP_ID} />
      );

      const statements = screen.getAllByTestId("env-encryption-statement");
      expect(statements).toHaveLength(1);
    });

    it("mentions AES-256-GCM in the encryption statement", () => {
      render(
        <EnvironmentSummaryCard envVars={{ KEY: "val" }} appId={APP_ID} />
      );

      const statement = screen.getByTestId("env-encryption-statement");
      expect(statement.textContent).toContain("AES-256-GCM");
    });

    it("mentions encrypted at rest in the statement", () => {
      render(
        <EnvironmentSummaryCard envVars={{ KEY: "val" }} appId={APP_ID} />
      );

      const statement = screen.getByTestId("env-encryption-statement");
      expect(statement.textContent).toContain("encrypted at rest");
    });
  });

  describe("navigation control (Requirements 9.3, 9.4)", () => {
    it("renders the navigation control exactly once", () => {
      render(
        <EnvironmentSummaryCard envVars={{ KEY: "val" }} appId={APP_ID} />
      );

      const links = screen.getAllByTestId("env-manage-link");
      expect(links).toHaveLength(1);
    });

    it("routes to the env-var settings entry point", () => {
      render(
        <EnvironmentSummaryCard envVars={{ KEY: "val" }} appId={APP_ID} />
      );

      const link = screen.getByTestId("env-manage-link");
      expect(link).toHaveAttribute("href", `/apps/${APP_ID}?settings=environment`);
    });

    it("has a visible text label identifying it as env-var management", () => {
      render(
        <EnvironmentSummaryCard envVars={{ KEY: "val" }} appId={APP_ID} />
      );

      const link = screen.getByTestId("env-manage-link");
      expect(link.textContent).toBeTruthy();
      expect(link.textContent!.toLowerCase()).toContain("environment");
    });
  });

  describe("undefined case — fetch failure (Requirement 9.6)", () => {
    it("renders a neutral error indicator when envVars is undefined", () => {
      render(<EnvironmentSummaryCard envVars={undefined} appId={APP_ID} />);

      const errorIndicator = screen.getByTestId("env-error-indicator");
      expect(errorIndicator).toBeInTheDocument();
    });

    it("hides the count when envVars is undefined", () => {
      render(<EnvironmentSummaryCard envVars={undefined} appId={APP_ID} />);

      expect(screen.queryByTestId("env-count")).not.toBeInTheDocument();
    });

    it("hides the navigation control when envVars is undefined", () => {
      render(<EnvironmentSummaryCard envVars={undefined} appId={APP_ID} />);

      expect(screen.queryByTestId("env-manage-link")).not.toBeInTheDocument();
    });

    it("hides the encryption statement when envVars is undefined", () => {
      render(<EnvironmentSummaryCard envVars={undefined} appId={APP_ID} />);

      expect(screen.queryByTestId("env-encryption-statement")).not.toBeInTheDocument();
    });
  });
});
