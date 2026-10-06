"use client";

import { useState } from "react";
import { ChevronRight, Folder, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Row } from "@/components/media/media-rows";
import { useLibraryFolders } from "./use-library";

function Spinner() {
    return <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />;
}

/** One text box and one action: new folder, rename folder. The title names the action (P2). */
export function NameDialog({
    open,
    onOpenChange,
    title,
    label,
    initial,
    confirm,
    pending,
    error,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    label: string;
    initial: string;
    confirm: string;
    pending?: boolean;
    error?: string | null;
    onSubmit: (value: string) => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <NameForm label={label} initial={initial} confirm={confirm} pending={pending} error={error} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} />
            </DialogContent>
        </Dialog>
    );
}

// The form lives inside the dialog content, so it starts fresh every time the dialog opens.
function NameForm({ label, initial, confirm, pending, error, onCancel, onSubmit }: { label: string; initial: string; confirm: string; pending?: boolean; error?: string | null; onCancel: () => void; onSubmit: (value: string) => void }) {
    const [value, setValue] = useState(initial);
    const submit = () => {
        if (value.trim() && !pending) onSubmit(value.trim());
    };
    return (
        <>
            <Input
                aria-label={label}
                value={value}
                autoFocus
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") submit();
                }}
            />
            {error ? <p role="status" className="text-sm text-muted-foreground">{error}</p> : null}
            <DialogFooter>
                <Button variant="outline" onClick={onCancel} disabled={pending}>
                    Cancel
                </Button>
                <Button onClick={submit} disabled={!value.trim() || pending}>
                    {pending ? <Spinner /> : null}
                    {confirm}
                </Button>
            </DialogFooter>
        </>
    );
}

/** Pick a folder by walking the tree; "Move here" acts on the folder you are looking at. */
export function MoveDialog({
    open,
    onOpenChange,
    title,
    start,
    pending,
    error,
    onMove,
    hide,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    start: string;
    pending?: boolean;
    error?: string | null;
    onMove: (folder: string) => void;
    /** A folder that can't be chosen (a folder can't move into itself). */
    hide?: string;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <MovePicker start={start} pending={pending} error={error} hide={hide} onCancel={() => onOpenChange(false)} onMove={onMove} />
            </DialogContent>
        </Dialog>
    );
}

function MovePicker({ start, pending, error, hide, onCancel, onMove }: { start: string; pending?: boolean; error?: string | null; hide?: string; onCancel: () => void; onMove: (folder: string) => void }) {
    const [at, setAt] = useState(start);
    const folders = useLibraryFolders(at, true);
    const parts = at ? at.split("/") : [];
    const choices = (folders.data?.folders ?? []).filter((folder) => !hide || (folder.path !== hide && !folder.path.startsWith(`${hide}/`)));
    const blocked = Boolean(hide) && (at === hide || at.startsWith(`${hide}/`));
    return (
        <>
            <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <button type="button" className="rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setAt("")}>
                    Library
                </button>
                {parts.map((part, index) => (
                    <span key={parts.slice(0, index + 1).join("/")} className="flex items-center gap-1">
                        <ChevronRight className="size-3.5" aria-hidden="true" />
                        <button type="button" className="rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setAt(parts.slice(0, index + 1).join("/"))}>
                            {part}
                        </button>
                    </span>
                ))}
            </nav>
            <div className="max-h-64 divide-y divide-border/70 overflow-y-auto rounded-[var(--opslin-radius-lg)] border border-border/70">
                {folders.isLoading ? <Row label="Loading folders" /> : null}
                {folders.isError ? <Row label="Couldn't load folders" /> : null}
                {!folders.isLoading && !folders.isError && choices.length === 0 ? <Row label="No folders here" /> : null}
                {choices.map((folder) => (
                    <button key={folder.path} type="button" className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setAt(folder.path)}>
                        <Folder className="size-4 text-muted-foreground" aria-hidden="true" />
                        <span className="flex-1">{folder.name}</span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </button>
                ))}
            </div>
            {error ? <p role="status" className="text-sm text-muted-foreground">{error}</p> : null}
            <DialogFooter>
                <Button variant="outline" onClick={onCancel} disabled={pending}>
                    Cancel
                </Button>
                <Button onClick={() => onMove(at)} disabled={pending || blocked}>
                    {pending ? <Spinner /> : null}
                    Move here
                </Button>
            </DialogFooter>
        </>
    );
}

/** Add or remove tags on many images. */
export function TagDialog({
    open,
    onOpenChange,
    count,
    pending,
    error,
    onApply,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    count: number;
    pending?: boolean;
    error?: string | null;
    onApply: (add: string[], remove: string[]) => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>{`Edit tags on ${count} ${count === 1 ? "image" : "images"}`}</DialogTitle>
                </DialogHeader>
                <TagForm pending={pending} error={error} onCancel={() => onOpenChange(false)} onApply={onApply} />
            </DialogContent>
        </Dialog>
    );
}

function TagForm({ pending, error, onCancel, onApply }: { pending?: boolean; error?: string | null; onCancel: () => void; onApply: (add: string[], remove: string[]) => void }) {
    const [add, setAdd] = useState("");
    const [remove, setRemove] = useState("");
    const split = (text: string) => text.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean);
    return (
        <>
            <div className="space-y-3">
                <Input aria-label="Tags to add" placeholder="Add tags: sale, summer" value={add} onChange={(event) => setAdd(event.target.value)} />
                <Input aria-label="Tags to remove" placeholder="Remove tags: old" value={remove} onChange={(event) => setRemove(event.target.value)} />
            </div>
            {error ? <p role="status" className="text-sm text-muted-foreground">{error}</p> : null}
            <DialogFooter>
                <Button variant="outline" onClick={onCancel} disabled={pending}>
                    Cancel
                </Button>
                <Button onClick={() => onApply(split(add), split(remove))} disabled={pending || (split(add).length === 0 && split(remove).length === 0)}>
                    {pending ? <Spinner /> : null}
                    Apply tags
                </Button>
            </DialogFooter>
        </>
    );
}

/** A destructive or external action names what happens and what is affected, in one line. */
export function ConfirmDialog({
    open,
    onOpenChange,
    text,
    confirm,
    pending,
    onConfirm,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    text: string;
    confirm: string;
    pending?: boolean;
    onConfirm: () => void;
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent aria-describedby={undefined}>
                <AlertDialogTitle>{text}</AlertDialogTitle>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={pending}
                        onClick={(event) => {
                            event.preventDefault();
                            onConfirm();
                        }}
                    >
                        {pending ? <Spinner /> : null}
                        {confirm}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
