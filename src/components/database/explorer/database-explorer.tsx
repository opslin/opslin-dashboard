"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralTab } from "./general-tab";
import { TablesTab } from "./tables-tab";
import { containerWord, type ExplorerDataSource } from "./types";

export function DatabaseExplorer({
    source,
    className,
    initialTab = "general",
    initialTable = null,
}: {
    source: ExplorerDataSource;
    className?: string;
    initialTab?: "general" | "tables";
    initialTable?: string | null;
}) {
    const [tab, setTab] = useState<"general" | "tables">(initialTab);
    const [selected, setSelected] = useState<string | null>(initialTable);
    const word = containerWord(source.engine);

    return (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "general" | "tables")} className={`gap-0 overflow-hidden rounded-xl border border-border/60 bg-card ${className ?? ""}`}>
            <TabsList variant="line" className="px-4">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="tables" className="capitalize">
                    {word}
                </TabsTrigger>
            </TabsList>
            <TabsContent value="general">
                <GeneralTab
                    source={source}
                    onOpenTable={(name) => {
                        setSelected(name);
                        setTab("tables");
                    }}
                />
            </TabsContent>
            <TabsContent value="tables">
                <TablesTab source={source} selected={selected} onSelect={setSelected} />
            </TabsContent>
        </Tabs>
    );
}
