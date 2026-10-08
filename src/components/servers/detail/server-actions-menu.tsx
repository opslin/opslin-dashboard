"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Download, MoreHorizontal, Pencil, RotateCw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { isSshUnavailable } from "../connect/shared";

const ITEM = "gap-3.5 rounded-lg px-3 py-2.5 text-[15px] font-semibold text-foreground focus:bg-muted [&_svg]:size-[18px] [&_svg]:text-muted-foreground";

export function ServerActionsMenu({
    serverId,
    serverName,
    updateVersion,
    onUpdate,
    onClean,
    onDelete,
}: {
    serverId: string;
    serverName: string;
    updateVersion?: string | null;
    onUpdate: () => void;
    onClean: () => void;
    onDelete: () => void;
}) {
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [name, setName] = useState(serverName);

    const restart = useMutation({
        mutationFn: () => api.runAgentControlAction(serverId, { action: "agent_restart" }),
        onSuccess: () => toast.success("Agent restart queued"),
        onError: () => toast.error("Couldn't restart the agent."),
    });

    const rename = useMutation({
        mutationFn: () => api.renameServer(serverId, name.trim()),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["server", serverId] });
            queryClient.invalidateQueries({ queryKey: ["servers"] });
            toast.success("Server renamed");
            setRenameOpen(false);
        },
        onError: (error) => toast.error(isSshUnavailable(error) ? "Renaming isn't available on this workspace yet." : "Couldn't rename the server."),
    });

    return (
        <>
            {open ? <div className="pointer-events-none fixed inset-0 z-40 bg-slate-900/20" aria-hidden="true" /> : null}
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon-lg" aria-label="More server actions" className="relative z-50">
                        <MoreHorizontal aria-hidden="true" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={12} className="w-[262px] rounded-2xl border-border/70 bg-card p-2 shadow-xl outline-none focus-visible:ring-0">
                    <DropdownMenuLabel className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Server actions</DropdownMenuLabel>
                    <DropdownMenuItem className={ITEM} onSelect={onUpdate}>
                        <Download aria-hidden="true" />
                        <span className="flex flex-1 flex-col leading-tight">
                            <span>{updateVersion ? "Update agent" : "Check agent updates"}</span>
                            {updateVersion ? <span className="text-xs font-medium text-primary">v{updateVersion} available</span> : null}
                        </span>
                        <ChevronRight className="!size-4" aria-hidden="true" />
                    </DropdownMenuItem>
                    <DropdownMenuItem className={ITEM} onSelect={onClean}>
                        <ShieldCheck aria-hidden="true" /> Clean and secure
                    </DropdownMenuItem>
                    <DropdownMenuItem className={ITEM} onSelect={() => restart.mutate()}>
                        <RotateCw aria-hidden="true" /> Restart agent
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className={ITEM}
                        onSelect={() => {
                            setName(serverName);
                            setRenameOpen(true);
                        }}
                    >
                        <Pencil aria-hidden="true" /> Rename server
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="mx-1 my-2" />
                    <DropdownMenuItem className={`${ITEM} text-danger-text focus:bg-danger-muted focus:text-danger-text [&_svg]:!text-danger-text`} onSelect={onDelete}>
                        <Trash2 aria-hidden="true" /> Delete server
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Rename server</DialogTitle>
                        <DialogDescription>This only changes the name shown in Opslin.</DialogDescription>
                    </DialogHeader>
                    <Input aria-label="Server name" value={name} onChange={(event) => setName(event.target.value)} maxLength={64} />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
                        <Button disabled={!name.trim() || name.trim() === serverName || rename.isPending} onClick={() => rename.mutate()}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
