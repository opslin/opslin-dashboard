"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, Folder, FolderPlus, LayoutGrid, List, Loader2, Search, SlidersHorizontal, Tag, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { formatBytes, formatCount } from "@/components/media/media-format";
import { UpdateRow } from "@/components/media/media-ready";
import { LockedLine, Row, Section } from "@/components/media/media-rows";
import { SkeletonText } from "@/components/patterns/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/hooks/use-auth";
import { api, type MediaFolder, type MediaState } from "@/lib/api";
import { createMedia } from "@/lib/media-sdk/media";
import { MediaError, UploadLimitError } from "@/lib/media-sdk/errors";
import { cn, formatRelativeTime } from "@/lib/utils";
import { AssetDetail } from "./asset-detail";
import { ACCEPTED_TYPES, collectDropped, fromDirectoryInput, isAcceptedImage, targetFolder, type DroppedFile } from "./drop";
import { EXPORT_MAX_FILES, assetsToCsv, assetsToJson, downloadBlob, exportZip } from "./export";
import { ConfirmDialog, MoveDialog, NameDialog, TagDialog } from "./library-dialogs";
import { createUploadQueue, type UploadItem } from "./upload-queue";
import { AssetCard, AssetMenu, FolderCard, LibraryStats, TYPE_TABS, Thumb, formatLabel, matchesType, type TypeTab } from "./library-parts";
import { LIBRARY_KEY, SORTS, libraryErrorCode, libraryErrorText, useLibraryAssets, useLibraryFolders, type SortKey } from "./use-library";

type Project = Extract<MediaState, { configured: true }>;
type ViewMode = "list" | "grid";

const VIEW_KEY = "opslin-media-view";

function readView(): ViewMode {
    try {
        return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
        return "grid";
    }
}

function useDebounced<T>(value: T, delay = 300): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

function describeUploadError(error: unknown) {
    if (error instanceof UploadLimitError) return { message: error.message, limit: true };
    if (error instanceof MediaError) return { message: error.message, limit: false };
    return { message: "Couldn't upload this image.", limit: false };
}

function UploadRow({ item, onRetry, onDismiss }: { item: UploadItem; onRetry: () => void; onDismiss: () => void }) {
    const state =
        item.status === "waiting"
            ? "Waiting"
            : item.status === "working"
              ? `${item.stage === "uploading" ? `Uploading ${item.done} of ${item.total}` : item.stage === "compressing" ? "Compressing" : "Working"}`
              : item.status === "done"
                ? "Done"
                : item.message ?? "Couldn't upload";
    return (
        <Row
            leading={item.status === "working" || item.status === "waiting" ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" /> : <Upload className="size-4 text-muted-foreground" aria-hidden="true" />}
            label={<span className="block truncate">{item.name}</span>}
            state={<span className={cn("max-w-[16rem] truncate", item.status === "failed" && "text-danger-text")} title={state}>{state}</span>}
            action={
                item.status === "failed" || item.status === "paused" ? (
                    <span className="flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
                        <Button variant="ghost" size="icon" aria-label={`Dismiss ${item.name}`} onClick={onDismiss}><X className="size-4" aria-hidden="true" /></Button>
                    </span>
                ) : undefined
            }
        />
    );
}

export function Library({ media }: { media: Project }) {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const canWrite = !user?.orgRole || ["OWNER", "ADMIN", "MEMBER"].includes(user.orgRole);

    const [folder, setFolder] = useState("");
    const [searchText, setSearchText] = useState("");
    const search = useDebounced(searchText);
    const [sort, setSort] = useState<SortKey>("newest");
    const [view, setView] = useState<ViewMode>("grid");
    const [typeTab, setTypeTab] = useState<TypeTab>("all");
    const [tag, setTag] = useState("");
    const [recursive, setRecursive] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const lastIndex = useRef<number | null>(null);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);

    type Dialog = { kind: "new-folder" } | { kind: "rename-folder"; folder: MediaFolder } | { kind: "delete-folder"; folder: MediaFolder } | { kind: "move"; ids: string[] } | { kind: "tags" } | { kind: "delete"; ids: string[] } | null;
    const [dialog, setDialog] = useState<Dialog>(null);
    const [dialogError, setDialogError] = useState<string | null>(null);

    useEffect(() => setView(readView()), []);
    const changeView = (next: string) => {
        const mode = next === "list" ? "list" : "grid";
        setView(mode);
        try {
            window.localStorage.setItem(VIEW_KEY, mode);
        } catch {
            /* the choice just isn't remembered */
        }
    };

    const searching = search.trim().length > 0;
    const filter = useMemo(() => ({ folder, search, sort, tag, recursive }), [folder, search, sort, tag, recursive]);
    const assetsQuery = useLibraryAssets(filter);
    const foldersQuery = useLibraryFolders(folder, !searching);
    const loaded = useMemo(() => assetsQuery.data?.pages.flatMap((page) => page.assets) ?? [], [assetsQuery.data]);
    const assets = useMemo(() => loaded.filter((asset) => matchesType(asset, typeTab)), [loaded, typeTab]);
    const knownTags = useMemo(() => [...new Set([...loaded.flatMap((asset) => asset.tags), ...(tag ? [tag] : [])])].sort(), [loaded, tag]);
    const total = assetsQuery.data?.pages[0]?.total ?? 0;
    const folders = searching ? [] : (foldersQuery.data?.folders ?? []);
    const detail = assets.find((asset) => asset.id === detailId) ?? null;

    useEffect(() => setSelected(new Set()), [folder, search, typeTab, tag, recursive]);

    const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: LIBRARY_KEY }), [queryClient]);

    // ── uploads ─────────────────────────────────────────────────────────
    const sdk = useMemo(
        () => (media.uploadUrl && media.publicHostname ? createMedia({ uploadUrl: media.uploadUrl, imageUrl: `https://${media.publicHostname}` }) : null),
        [media.uploadUrl, media.publicHostname],
    );
    const [uploads, setUploads] = useState<UploadItem[]>([]);
    // The queue lives as long as the page; it always reads the latest address (it changes after an update).
    const sdkRef = useRef(sdk);
    sdkRef.current = sdk;
    const queueRef = useRef<ReturnType<typeof createUploadQueue> | null>(null);
    if (!queueRef.current) {
        queueRef.current = createUploadQueue({
            run: (file, options) => {
                if (!sdkRef.current) throw new MediaError("not_ready", "The upload service isn't ready.");
                return sdkRef.current.upload(file, { folder: options.folder || undefined, onProgress: options.onProgress as never });
            },
            describeError: describeUploadError,
            onChange: setUploads,
            onUploaded: async (item) => {
                await refresh();
                window.setTimeout(() => queueRef.current?.dismiss(item.id), 600);
            },
        });
    }

    const addFiles = useCallback(
        (dropped: DroppedFile[]) => {
            const accepted = dropped.filter((entry) => isAcceptedImage(entry.file));
            const skipped = dropped.length - accepted.length;
            setNotice(skipped > 0 ? `${skipped} ${skipped === 1 ? "file was" : "files were"} skipped. Only JPEG, PNG, WebP and AVIF images can be uploaded.` : null);
            if (accepted.length === 0) return;
            queueRef.current?.add(accepted.map((entry) => ({ file: entry.file, folder: targetFolder(folder, entry.relativeDir) })));
        },
        [folder],
    );

    const filePicker = useRef<HTMLInputElement>(null);
    const folderPicker = useRef<HTMLInputElement>(null);

    // ── changes ─────────────────────────────────────────────────────────
    const fail = (error: unknown) => setDialogError(libraryErrorText(error));
    const done = (text?: string) => {
        setDialog(null);
        setDialogError(null);
        if (text) toast.success(text);
        return refresh();
    };

    const createFolder = useMutation({
        mutationFn: (name: string) => api.createMediaFolder(folder ? `${folder}/${name}` : name),
        onSuccess: () => done("Folder created"),
        onError: fail,
    });
    const renameFolder = useMutation({
        mutationFn: ({ from, name }: { from: string; name: string }) => api.renameMediaFolder(from, [...from.split("/").slice(0, -1), name].join("/")),
        onSuccess: () => done("Folder renamed"),
        onError: fail,
    });
    const deleteFolder = useMutation({
        mutationFn: (path: string) => api.deleteMediaFolder(path, true),
        onSuccess: () => done("Folder deleted"),
        onError: fail,
    });
    const updateAsset = useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: { name?: string; folder?: string; tags?: string[] } }) => api.updateMediaAsset(id, patch),
        onSuccess: () => {
            setDialogError(null);
            return refresh();
        },
        onError: fail,
    });
    const bulk = useMutation({
        mutationFn: (input: Parameters<typeof api.bulkMediaAssets>[0]) => api.bulkMediaAssets(input),
        onSuccess: async (result, input) => {
            const word = input.action === "delete" ? "Deleted" : input.action === "move" ? "Moved" : "Updated";
            if (result.failed.length > 0) toast.error(`${result.failed.length} of ${input.ids.length} couldn't be changed.`);
            else toast.success(`${word} ${result.done.length} ${result.done.length === 1 ? "image" : "images"}`);
            setSelected(new Set());
            setDetailId(null);
            await done();
        },
        onError: fail,
    });

    // ── selection ───────────────────────────────────────────────────────
    const toggle = (id: string, index: number, shift: boolean) => {
        setSelected((current) => {
            const next = new Set(current);
            if (shift && lastIndex.current !== null) {
                const [from, to] = [Math.min(lastIndex.current, index), Math.max(lastIndex.current, index)];
                for (const asset of assets.slice(from, to + 1)) next.add(asset.id);
            } else if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        lastIndex.current = index;
    };
    const allSelected = assets.length > 0 && assets.every((asset) => selected.has(asset.id));

    // ── export ──────────────────────────────────────────────────────────
    async function exportAssets(kind: "csv" | "json" | "zip") {
        try {
            let list = assets.filter((asset) => selected.has(asset.id));
            if (list.length === 0) {
                // Nothing selected: this folder and everything below it.
                list = [];
                let cursor: string | undefined;
                do {
                    const page = await api.listMediaAssets({ folder, recursive: true, sort: "name", order: "asc", limit: 100, cursor });
                    list.push(...page.assets);
                    cursor = page.nextCursor ?? undefined;
                } while (cursor && list.length < 5000);
            }
            if (list.length === 0) {
                toast.error("There is nothing to export here.");
                return;
            }
            const stamp = new Date().toISOString().slice(0, 10);
            const label = (folder.split("/").pop() || "library").replace(/[^A-Za-z0-9._-]+/g, "-");
            if (kind === "csv") downloadBlob(new Blob([assetsToCsv(list)], { type: "text/csv;charset=utf-8" }), `${label}-${stamp}.csv`);
            else if (kind === "json") downloadBlob(new Blob([assetsToJson(list)], { type: "application/json" }), `${label}-${stamp}.json`);
            else {
                setExporting({ done: 0, total: list.length });
                downloadBlob(await exportZip(list, setExporting), `${label}-${stamp}.zip`);
            }
            toast.success(kind === "zip" ? "ZIP ready" : "Export ready");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Couldn't export.");
        } finally {
            setExporting(null);
        }
    }

    // ── render ──────────────────────────────────────────────────────────
    const segments = folder ? folder.split("/") : [];
    const selectedIds = [...selected];
    const needsUpdate = media.workerUpdateAvailable;
    const loadFailure = assetsQuery.isError ? assetsQuery.error : foldersQuery.isError && !searching ? foldersQuery.error : null;
    const outdated = needsUpdate || libraryErrorCode(loadFailure) === "upload_service_outdated";
    const loading = assetsQuery.isLoading || (!searching && foldersQuery.isLoading);
    const empty = !loading && !loadFailure && assets.length === 0 && folders.length === 0 && uploads.length === 0;
    const filtersActive = Boolean(tag) || recursive || typeTab !== "all";
    const filesTitle = searching ? "Search results" : folder ? (segments[segments.length - 1] ?? "Files") : sort === "newest" ? "Recent Uploads" : "All Files";
    const filesCount = typeTab === "all" ? total : assets.length;

    function onDrop(event: React.DragEvent) {
        event.preventDefault();
        setDragging(false);
        if (!canWrite || !sdk) return;
        // Entries are only readable during the event itself.
        void collectDropped(event.dataTransfer).then(addFiles);
    }

    const openFolder = (path: string) => {
        setTypeTab("all");
        setFolder(path);
    };
    const openMove = (ids: string[]) => {
        setDialogError(null);
        setDialog({ kind: "move", ids });
    };
    const openDelete = (ids: string[]) => setDialog({ kind: "delete", ids });

    return (
        <div
            className={cn("space-y-6 rounded-xl", dragging && "ring-2 ring-ring ring-offset-4 ring-offset-background")}
            onDragOver={(event) => {
                if (!canWrite || !sdk || !event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                setDragging(true);
            }}
            onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={onDrop}
        >
            <input ref={filePicker} type="file" multiple hidden accept={ACCEPTED_TYPES.join(",")} aria-label="Choose images" onChange={(event) => { if (event.target.files) addFiles(Array.from(event.target.files).map((file) => ({ file, relativeDir: "" }))); event.target.value = ""; }} />
            <input ref={folderPicker} type="file" hidden multiple aria-label="Choose a folder" {...{ webkitdirectory: "", directory: "" }} onChange={(event) => { if (event.target.files) addFiles(fromDirectoryInput(event.target.files)); event.target.value = ""; }} />

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground">Media Library</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Upload, manage and organize your media assets</p>
                </div>
                {canWrite ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button variant="outline" size="lg" onClick={() => { setDialogError(null); setDialog({ kind: "new-folder" }); }}><FolderPlus aria-hidden="true" />New Folder</Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="lg" disabled={!sdk || outdated}><Upload aria-hidden="true" />Upload Media<ChevronDown className="opacity-80" aria-hidden="true" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => filePicker.current?.click()}>Choose images</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => folderPicker.current?.click()}>Choose a folder</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ) : null}
            </div>

            <LibraryStats fallbackTotal={total} />

            <Tabs value={typeTab} onValueChange={(value) => setTypeTab(value as TypeTab)} className="gap-6">
                {selected.size > 0 ? (
                    <Card className="gap-0 py-0">
                        <div className="flex min-h-14 flex-wrap items-center gap-2 px-5 py-2">
                            <Checkbox aria-label="Select all" checked={allSelected} onCheckedChange={(checked) => setSelected(checked ? new Set(assets.map((asset) => asset.id)) : new Set())} />
                            <span className="mr-auto text-sm font-medium">{formatCount(selected.size)} selected</span>
                            {canWrite ? (
                                <>
                                    <Button variant="outline" size="sm" onClick={() => openMove(selectedIds)}><Folder aria-hidden="true" />Move</Button>
                                    <Button variant="outline" size="sm" onClick={() => { setDialogError(null); setDialog({ kind: "tags" }); }}><Tag aria-hidden="true" />Tags</Button>
                                </>
                            ) : null}
                            <ExportMenu label="Selected images" disabled={Boolean(exporting)} onExport={exportAssets} />
                            {canWrite ? <Button variant="outline" size="sm" onClick={() => openDelete(selectedIds)}><Trash2 aria-hidden="true" />Delete</Button> : null}
                            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
                        </div>
                    </Card>
                ) : (
                    <div className="flex flex-col gap-3 border-b lg:flex-row lg:items-center lg:justify-between">
                        <div className="-mb-px overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            <TabsList variant="line" aria-label="File type" className="min-w-max border-b-0">
                                {TYPE_TABS.map((entry) => (
                                    <TabsTrigger key={entry.value} value={entry.value}>{entry.label}</TabsTrigger>
                                ))}
                            </TabsList>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pb-3">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                                <Input aria-label="Search images" placeholder="Search" className="w-40 pl-8 sm:w-52" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
                            </div>
                            <ToggleGroup value={view} onValueChange={changeView}>
                                <ToggleGroupItem value="grid" aria-label="Grid view" className="px-2"><LayoutGrid className="size-4" aria-hidden="true" /></ToggleGroupItem>
                                <ToggleGroupItem value="list" aria-label="List view" className="px-2"><List className="size-4" aria-hidden="true" /></ToggleGroupItem>
                            </ToggleGroup>
                            <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                                <SelectTrigger aria-label="Sort" className="w-44"><span className="text-muted-foreground">Sort by:</span><SelectValue /></SelectTrigger>
                                <SelectContent>{Object.entries(SORTS).map(([key, value]) => <SelectItem key={key} value={key}>{value.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline"><SlidersHorizontal aria-hidden="true" />Filter</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Show</DropdownMenuLabel>
                                    <DropdownMenuCheckboxItem checked={recursive} onCheckedChange={(checked) => setRecursive(Boolean(checked))}>Include images in subfolders</DropdownMenuCheckboxItem>
                                    {filtersActive ? (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onSelect={() => { setRecursive(false); setTag(""); setTypeTab("all"); }}>Clear filters</DropdownMenuItem>
                                        </>
                                    ) : null}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline"><Tag aria-hidden="true" />Tags</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Filter by tag</DropdownMenuLabel>
                                    <DropdownMenuRadioGroup value={tag} onValueChange={setTag}>
                                        <DropdownMenuRadioItem value="">All tags</DropdownMenuRadioItem>
                                        {knownTags.map((name) => <DropdownMenuRadioItem key={name} value={name}>{name}</DropdownMenuRadioItem>)}
                                    </DropdownMenuRadioGroup>
                                    {knownTags.length === 0 ? <p className="px-2 py-1.5 text-xs text-muted-foreground">No tags yet. Add tags from an image&apos;s details.</p> : null}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <ExportMenu label={folder ? "This folder and below" : "Whole library"} disabled={Boolean(exporting)} onExport={exportAssets} />
                        </div>
                    </div>
                )}

                {exporting ? <LockedLine>{`Preparing ZIP: ${exporting.done} of ${exporting.total}`}</LockedLine> : null}
                {!canWrite ? <LockedLine>Only members, admins and owners can change the library.</LockedLine> : null}
                {outdated ? (
                    <Card className="gap-0 overflow-hidden py-0">
                        <Section>
                            <UpdateRow media={media} />
                            <LockedLine>Update the upload service to use the library.</LockedLine>
                        </Section>
                    </Card>
                ) : null}
                {notice ? <LockedLine>{notice}</LockedLine> : null}
                {dragging ? <LockedLine>{`Drop to upload to ${folder || "the top level"}.`}</LockedLine> : null}

                {filtersActive && selected.size === 0 ? (
                    <div className="-mt-2 flex flex-wrap items-center gap-2" aria-label="Active filters">
                        {tag ? <Badge variant="secondary" className="gap-1">Tag: {tag}<button type="button" aria-label="Remove tag filter" onClick={() => setTag("")}><X className="size-3" aria-hidden="true" /></button></Badge> : null}
                        {recursive ? <Badge variant="secondary" className="gap-1">Including subfolders<button type="button" aria-label="Remove subfolder filter" onClick={() => setRecursive(false)}><X className="size-3" aria-hidden="true" /></button></Badge> : null}
                    </div>
                ) : null}

                {!outdated ? (
                    <>
                        {folder || searching ? (
                            <nav aria-label="Folder path" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
                                {searching ? (
                                    <span className="font-medium">{`Results for “${search.trim()}”`}</span>
                                ) : (
                                    <>
                                        <button type="button" className={cn("rounded px-1 focus-visible:ring-2 focus-visible:ring-ring", segments.length === 0 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => openFolder("")}>Library</button>
                                        {segments.map((segment, index) => (
                                            <span key={segments.slice(0, index + 1).join("/")} className="flex items-center gap-1">
                                                <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                                                <button type="button" className={cn("rounded px-1 focus-visible:ring-2 focus-visible:ring-ring", index === segments.length - 1 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => openFolder(segments.slice(0, index + 1).join("/"))}>{segment}</button>
                                            </span>
                                        ))}
                                    </>
                                )}
                            </nav>
                        ) : null}

                        {folders.length > 0 ? (
                            <section aria-label="Folders" className="space-y-3">
                                <h2 className="text-lg font-semibold text-foreground">Folders ({formatCount(folders.length)})</h2>
                                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                                    {folders.map((item) => (
                                        <FolderCard key={item.path} item={item} canWrite={canWrite} onOpen={() => openFolder(item.path)} onRename={() => { setDialogError(null); setDialog({ kind: "rename-folder", folder: item }); }} onDelete={() => { setDialogError(null); setDialog({ kind: "delete-folder", folder: item }); }} />
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        {uploads.length > 0 ? (
                            <Card className="gap-0 overflow-hidden py-0">
                                <Section label="Uploading">
                                    {uploads.map((item) => (
                                        <UploadRow key={item.id} item={item} onRetry={() => queueRef.current?.retry(item.id)} onDismiss={() => queueRef.current?.dismiss(item.id)} />
                                    ))}
                                </Section>
                            </Card>
                        ) : null}

                        <section aria-label="Files" className="space-y-3">
                            {!loading && !loadFailure && !empty ? <h2 className="text-lg font-semibold text-foreground">{filesTitle} ({formatCount(filesCount)})</h2> : null}

                            {loading ? (
                                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" aria-label="Loading images">
                                    {Array.from({ length: 6 }, (_, index) => <SkeletonText key={index} className="h-52 rounded-xl" />)}
                                </div>
                            ) : loadFailure ? (
                                <Card className="gap-0 overflow-hidden py-0">
                                    <Row label={libraryErrorText(loadFailure)} action={<Button variant="outline" onClick={() => { void assetsQuery.refetch(); void foldersQuery.refetch(); }}>Retry</Button>} />
                                </Card>
                            ) : null}

                            <TabsContent value={typeTab} className="space-y-4">
                                {view === "grid" && assets.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                                        {assets.map((asset, index) => (
                                            <AssetCard
                                                key={asset.id}
                                                asset={asset}
                                                index={index}
                                                selected={selected.has(asset.id)}
                                                canWrite={canWrite}
                                                showFolder={searching || recursive}
                                                onToggle={toggle}
                                                onOpen={() => setDetailId(asset.id)}
                                                onMove={() => openMove([asset.id])}
                                                onDelete={() => openDelete([asset.id])}
                                            />
                                        ))}
                                    </div>
                                ) : null}

                                {view === "list" && assets.length > 0 ? (
                                    <Card className="gap-0 overflow-hidden py-0">
                                        <Table>
                                            <TableHeader className="bg-muted/50">
                                                <TableRow>
                                                    <TableHead className="w-10"><span className="sr-only">Select</span></TableHead>
                                                    <TableHead>Name</TableHead>
                                                    <TableHead className="hidden sm:table-cell">Size</TableHead>
                                                    <TableHead className="hidden md:table-cell">Dimensions</TableHead>
                                                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                                                    <TableHead className="hidden sm:table-cell text-right">Uploaded</TableHead>
                                                    <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {assets.map((asset, index) => (
                                                    <TableRow key={asset.id} data-state={selected.has(asset.id) ? "selected" : undefined}>
                                                        <TableCell><Checkbox aria-label={`Select ${asset.name}`} checked={selected.has(asset.id)} onClick={(event) => { event.stopPropagation(); toggle(asset.id, index, event.shiftKey); }} onCheckedChange={() => undefined} /></TableCell>
                                                        <TableCell>
                                                            <button type="button" className="flex min-w-0 items-center gap-3 text-left focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setDetailId(asset.id)}>
                                                                <Thumb asset={asset} size="row" />
                                                                <span className="min-w-0">
                                                                    <span className="block truncate font-medium">{asset.name}</span>
                                                                    {searching && asset.folder ? <span className="block truncate text-xs font-normal text-muted-foreground">{asset.folder}</span> : null}
                                                                </span>
                                                            </button>
                                                        </TableCell>
                                                        <TableCell className="hidden text-muted-foreground sm:table-cell">{formatBytes(asset.bytes)}</TableCell>
                                                        <TableCell className="hidden text-muted-foreground md:table-cell">{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"}</TableCell>
                                                        <TableCell className="hidden text-muted-foreground sm:table-cell">{formatLabel(asset.type)}</TableCell>
                                                        <TableCell className="hidden text-right text-muted-foreground sm:table-cell">{formatRelativeTime(asset.createdAt)}</TableCell>
                                                        <TableCell><AssetMenu asset={asset} canWrite={canWrite} onDetails={() => setDetailId(asset.id)} onMove={() => openMove([asset.id])} onDelete={() => openDelete([asset.id])} /></TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </Card>
                                ) : null}

                                {!loading && !loadFailure && assets.length === 0 && folders.length > 0 && typeTab !== "all" ? (
                                    <Card className="gap-0 overflow-hidden py-0"><Row label={`No ${TYPE_TABS.find((entry) => entry.value === typeTab)?.label ?? ""} images in view`} action={<Button variant="outline" onClick={() => setTypeTab("all")}>Show all files</Button>} /></Card>
                                ) : null}

                                {empty ? (
                                    <Card className="gap-0 overflow-hidden py-0">
                                        <Row
                                            label={searching ? `No images match “${search.trim()}”` : filtersActive ? "No images match these filters" : folder ? "No images in this folder yet" : "No images yet"}
                                            action={searching ? <Button variant="outline" onClick={() => setSearchText("")}>Clear search</Button> : filtersActive ? <Button variant="outline" onClick={() => { setRecursive(false); setTag(""); setTypeTab("all"); }}>Clear filters</Button> : canWrite ? <Button onClick={() => filePicker.current?.click()} disabled={!sdk}><Upload aria-hidden="true" />Upload images</Button> : undefined}
                                        />
                                    </Card>
                                ) : null}

                                {assetsQuery.hasNextPage ? (
                                    <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                                        <span>{`Showing ${formatCount(loaded.length)} of ${formatCount(total)}`}</span>
                                        <Button variant="outline" onClick={() => assetsQuery.fetchNextPage()} disabled={assetsQuery.isFetchingNextPage}>{assetsQuery.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}Show more</Button>
                                    </div>
                                ) : null}
                            </TabsContent>
                        </section>
                    </>
                ) : null}
            </Tabs>

            <AssetDetail
                asset={detail}
                canWrite={canWrite}
                error={dialogError}
                onClose={() => { setDetailId(null); setDialogError(null); }}
                onRename={(name) => detail && updateAsset.mutate({ id: detail.id, patch: { name } })}
                onTags={(tags) => detail && updateAsset.mutate({ id: detail.id, patch: { tags } })}
                onMove={() => detail && setDialog({ kind: "move", ids: [detail.id] })}
                onDelete={() => detail && setDialog({ kind: "delete", ids: [detail.id] })}
            />

            <NameDialog open={dialog?.kind === "new-folder"} onOpenChange={(open) => !open && setDialog(null)} title={folder ? `New folder in ${folder}` : "New folder"} label="Folder name" initial="" confirm="Create folder" pending={createFolder.isPending} error={dialogError} onSubmit={(name) => createFolder.mutate(name)} />
            <NameDialog open={dialog?.kind === "rename-folder"} onOpenChange={(open) => !open && setDialog(null)} title="Rename folder" label="Folder name" initial={dialog?.kind === "rename-folder" ? dialog.folder.name : ""} confirm="Rename folder" pending={renameFolder.isPending} error={dialogError} onSubmit={(name) => dialog?.kind === "rename-folder" && renameFolder.mutate({ from: dialog.folder.path, name })} />
            <MoveDialog
                open={dialog?.kind === "move"}
                onOpenChange={(open) => !open && setDialog(null)}
                title={dialog?.kind === "move" ? `Move ${dialog.ids.length} ${dialog.ids.length === 1 ? "image" : "images"}` : "Move"}
                start={folder}
                pending={bulk.isPending || updateAsset.isPending}
                error={dialogError}
                onMove={(target) => {
                    if (dialog?.kind !== "move") return;
                    if (dialog.ids.length === 1) updateAsset.mutate({ id: dialog.ids[0]!, patch: { folder: target } }, { onSuccess: () => { setDialog(null); toast.success("Moved"); } });
                    else bulk.mutate({ action: "move", ids: dialog.ids, folder: target });
                }}
            />
            <TagDialog open={dialog?.kind === "tags"} onOpenChange={(open) => !open && setDialog(null)} count={selected.size} pending={bulk.isPending} error={dialogError} onApply={(add, remove) => bulk.mutate({ action: "tag", ids: selectedIds, addTags: add, removeTags: remove })} />
            <ConfirmDialog
                open={dialog?.kind === "delete"}
                onOpenChange={(open) => !open && setDialog(null)}
                text={dialog?.kind === "delete" ? `Delete ${dialog.ids.length} ${dialog.ids.length === 1 ? "image" : "images"} from your storage? They may keep loading from Cloudflare's cache for a short time.` : ""}
                confirm="Delete"
                pending={bulk.isPending}
                onConfirm={() => dialog?.kind === "delete" && bulk.mutate({ action: "delete", ids: dialog.ids })}
            />
            <ConfirmDialog
                open={dialog?.kind === "delete-folder"}
                onOpenChange={(open) => !open && setDialog(null)}
                text={dialog?.kind === "delete-folder" ? (dialog.folder.assets + dialog.folder.folders > 0 ? `Delete “${dialog.folder.name}” and everything inside it? The images are removed from your storage.` : `Delete the empty folder “${dialog.folder.name}”?`) : ""}
                confirm="Delete folder"
                pending={deleteFolder.isPending}
                onConfirm={() => dialog?.kind === "delete-folder" && deleteFolder.mutate(dialog.folder.path)}
            />
        </div>
    );
}

function ExportMenu({ label, disabled, onExport }: { label: string; disabled: boolean; onExport: (kind: "csv" | "json" | "zip") => void }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Export" disabled={disabled}><Download className="size-4" aria-hidden="true" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{label}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onExport("zip")}>Download images as ZIP</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onExport("csv")}>Export list as CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onExport("json")}>Export list as JSON</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{`A ZIP holds up to ${formatCount(EXPORT_MAX_FILES)} images`}</DropdownMenuLabel>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
