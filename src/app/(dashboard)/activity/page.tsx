"use client";

import { Activity } from "lucide-react";
import { Header } from "@/components/layout/header";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ActivityPage() {
  return (
    <>
      <Header
        title="Activity"
        description="User-facing audit trail for deployments, app changes, server actions, team events, and operational security events."
      />

      <div className="dashboard-page">
        <Card className="dashboard-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-5" />
              Organization activity
            </CardTitle>
            <CardDescription>
              Filter by event or actor, then page through recent organization events without exposing other organizations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityFeed />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
