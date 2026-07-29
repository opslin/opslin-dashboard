"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "opslin_cookie_consent";

export function CookieBanner() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        setVisible(localStorage.getItem(STORAGE_KEY) !== "accepted");
    }, []);

    if (!visible) {
        return null;
    }

    return (
        <aside
            aria-label="Cookie consent"
            data-testid="cookie-banner"
            className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-3xl flex-col gap-3 rounded-lg border border-border bg-background p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between"
        >
            <p className="text-sm text-muted-foreground">
                Opslin uses essential cookies for authentication, security, and preference storage.
            </p>
            <Button
                type="button"
                size="sm"
                onClick={() => {
                    localStorage.setItem(STORAGE_KEY, "accepted");
                    setVisible(false);
                }}
            >
                Accept
            </Button>
        </aside>
    );
}
