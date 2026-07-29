"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Server } from "lucide-react";
import { useReducedMotion } from "framer-motion";

// Honest, already-vetted facts about the product — kept independent of the
// marketing site (opslin-website) so this auth surface never breaks if that
// project's copy changes.
const panelFacts = [
  { stat: "6 mo", label: "Starter beta, free", detail: "Starter is free for six months while V2.1 beta feedback is collected." },
  { stat: "0", label: "Inbound management ports", detail: "The Opslin agent connects outbound; no public management port is required." },
  { stat: "5", label: "Published beta plans", detail: "Pricing is visible in INR, with paid access opening gradually during beta." },
  { stat: "10", label: "Plain-language FAQs", detail: "Answers to the hard questions are ready before you connect a server." },
];

const ROTATE_MS = 4000;

function useRotatingFact() {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % panelFacts.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  return panelFacts[index];
}

function BrandMark() {
  return (
    <Link href="/" className="inline-flex items-center">
      <Image src="/logo/opslin-logo-black.png" alt="Opslin" width={161} height={50} className="h-9 w-auto" priority />
    </Link>
  );
}

export function AuthSplitShell({ children }: { children: ReactNode }) {
  const fact = useRotatingFact();

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col gap-8 bg-background px-6 py-10 sm:px-10">
        <BrandMark />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>

      <div className="glow-ambient relative hidden overflow-hidden bg-inverse lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="relative">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-text-on-inverse-muted">
            <Server className="size-4" />
            Beta control plane for your VPS
          </span>
        </div>

        <div className="relative" key={fact.label}>
          <p className="animate-fade-in text-6xl font-semibold tracking-tight text-text-inverse">{fact.stat}</p>
          <p className="animate-fade-in mt-3 text-sm font-semibold uppercase tracking-[0.2em] text-text-on-inverse-muted">
            {fact.label}
          </p>
          <p className="animate-fade-in mt-3 max-w-sm text-sm leading-6 text-text-on-inverse-muted">{fact.detail}</p>
        </div>

        <div className="relative flex items-center gap-1.5">
          {panelFacts.map((item) => (
            <span
              key={item.label}
              className={`h-1 rounded-full transition-all duration-300 ${
                item.label === fact.label ? "w-6 bg-primary" : "w-1.5 bg-white/15"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
