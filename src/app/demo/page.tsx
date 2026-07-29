"use client";

import { useState } from "react";
import { Rocket } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DemoPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.startDemo();
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the demo workspace.");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6" data-testid="demo-start-page">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-2xl">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Rocket className="size-5" />
            </span>
            Try Opslin in one click
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Start a temporary workspace with a demo server, a deployed app, sample metrics, and admin data. The workspace expires automatically.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" onClick={startDemo} disabled={loading} data-testid="start-demo-button">
            {loading ? "Starting demo..." : "Start demo workspace"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
