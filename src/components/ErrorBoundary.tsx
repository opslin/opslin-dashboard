"use client";

import React from "react";

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error("Error boundary caught:", error, info);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border/70 bg-card px-6 py-10 text-center text-card-foreground">
                    <h2 className="text-xl font-medium">Something went wrong</h2>
                    <p className="max-w-xl text-sm text-muted-foreground">{this.state.error?.message}</p>
                    <button
                        type="button"
                        className="rounded-md border border-border/70 bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                        onClick={() => this.setState({ hasError: false })}
                    >
                        Try again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
