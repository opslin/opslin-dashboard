"use client";

import type { ReactNode } from "react";
import Image from "next/image";

// Light auth shell: pale gradient card, softly pulsing rings, Opslin wordmark.
// Shared by the OTP verify page and the opt-in AuthCard "showcase" variant.
export function ShowcaseShell({ children }: { children: ReactNode }) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
            <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
                <div className="absolute inset-0 z-0 overflow-hidden bg-gradient-to-b from-sky-50 via-white to-white" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((ring) => (
                        <span
                            key={ring}
                            className="showcase-ring absolute left-1/2 top-[38%] h-[28rem] w-[28rem] rounded-full border border-sky-200/70"
                            style={{ animationDelay: `${ring * -1.6}s` }}
                        />
                    ))}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white" />
                </div>
                <style>{`
                    @keyframes showcase-ring-pulse {
                        0% { transform: translate(-50%, -50%) scale(0.1); opacity: 0.6; }
                        100% { transform: translate(-50%, -50%) scale(1.1); opacity: 0; }
                    }
                    .showcase-ring { animation: showcase-ring-pulse 8s linear infinite; }
                    @media (prefers-reduced-motion: reduce) { .showcase-ring { animation: none; opacity: 0.35; transform: translate(-50%, -50%) scale(0.6); } }
                `}</style>

                <div className="relative z-10 px-8 py-14">
                    <Image
                        src="/logo/opslin-logo-black.png"
                        alt="Opslin"
                        width={161}
                        height={50}
                        priority
                        className="mx-auto mb-6 h-9 w-auto"
                    />
                    {children}
                </div>
            </div>
        </main>
    );
}
