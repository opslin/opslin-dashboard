"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useMedia } from "@/hooks/use-media";
import { cn } from "@/lib/utils";

type StorageTab = { label: string; href: string; exact?: boolean };

const BASE_TABS: StorageTab[] = [
    { label: "Overview", href: "/storage", exact: true },
    { label: "Buckets", href: "/storage/buckets" },
    { label: "Backups", href: "/storage/backups" },
];

const MEDIA_TAB: StorageTab = { label: "Media", href: "/storage/media" };

function isActive(pathname: string, tab: StorageTab) {
    return tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

/**
 * The tab row of the Storage section: one place for Buckets, Backups and Media.
 * Switching a tab changes the page; only the underline moves (a short, critically damped spring),
 * the content does not animate because people switch tabs often.
 */
export function StorageTabs() {
    const pathname = usePathname() ?? "";
    const reduceMotion = useReducedMotion();
    const { data } = useMedia();
    // Media is a release-flagged service. Keep its tab while the answer is loading so the row does not jump,
    // and hide it only once the API says it is not turned on for this organization.
    const tabs = data?.locked === true ? BASE_TABS : [...BASE_TABS, MEDIA_TAB];

    return (
        <nav aria-label="Storage sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex min-w-max items-center gap-1 border-b border-border/70">
                {tabs.map((tab) => {
                    const active = isActive(pathname, tab);
                    return (
                        <li key={tab.href} className="relative">
                            <Link
                                href={tab.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                    "relative inline-flex h-11 items-center rounded-md px-3.5 text-sm font-medium outline-none",
                                    "transition-[color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none",
                                    "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {tab.label}
                                {active ? (
                                    <motion.span
                                        layoutId="storage-tab-underline"
                                        aria-hidden="true"
                                        className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"
                                        transition={reduceMotion ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }}
                                    />
                                ) : null}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
