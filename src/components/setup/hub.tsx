"use client";

import { ConnectedBanner, HelpStrip, SetupChecklistCard, WhatYoullGet, useFlag } from "./setup-ui";
import { useSetupState } from "./use-setup";

/** The Overview for a workspace that is still being set up. */
export function SetupHub({ state, appCount, onSkip }: { state: ReturnType<typeof useSetupState>; appCount: number; onSkip: () => void }) {
    const [connectedSeen, closeConnected] = useFlag("connected-seen");
    return (
        <div className="dashboard-page">
            {state.hasServer && !connectedSeen ? <ConnectedBanner serverName={state.serverName} onClose={closeConnected} /> : null}
            <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Welcome to Opslin</p>
                <h1 className="mt-1 text-4xl font-bold tracking-tight text-foreground">Let&apos;s get your first app live</h1>
                <p className="mt-1 text-muted-foreground">Three quick steps. Most people finish in under 10 minutes.</p>
            </div>
            <SetupChecklistCard steps={state.steps} done={state.done} current={state.current} serverName={state.serverName} appCount={appCount} onSkip={onSkip} />
            <WhatYoullGet />
            <HelpStrip />
        </div>
    );
}
