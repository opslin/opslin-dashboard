"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Download, Folder, FolderPlus, Image as ImageIcon, LayoutGrid, List, Loader2, MoreHorizontal, Search, Tag, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { formatBytes, formatCount } from "@/components/media/media-format";
import { UpdateRow } from "@/components/media/media-ready";
import { LockedLine, Panel, Row, Section } from "@/components/media/media-rows";
import { SkeletonText } from "@/components/patterns/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/hooks/use-auth";
import { api, type MediaAsset, type MediaFolder, type MediaState } from "@/lib/api";
import { createMedia } from "@/lib/media-sdk/media";
import { MediaError, UploadLimitError } from "@/lib/media-sdk/errors";
import { cn, formatRelativeTime } from "@/lib/utils";
import { AssetDetail } from "./asset-detail";
import { ACCEPTED_TYPES, collectDropped, fromDirectoryInput, isAcceptedImage, targetFolder, type DroppedFile } from "./drop";
import { EXPORT_MAX_FILES, assetsToCsv, assetsToJson, downloadBlob, exportZip } from "./export";
import { ConfirmDialog, MoveDialog, NameDialog, TagDialog } from "./library-dialogs";
import { createUploadQueue, type UploadItem } from "./upload-queue";
import { LIBRARY_KEY, SORTS, libraryErrorCode, libraryErrorText, placeholderColor, thumbSrc, useLibraryAssets, useLibraryFolders, type SortKey } from "./use-library";

type Project = Extract<MediaState, { configured: true }>;
type ViewMode = "list" | "grid";

const VIEW_KEY = "opslin-media-view";

function readView(): ViewMode {
    try {
        return window.localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
    } catch {
        return "list";
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

function Thumb({ asset, size }: { asset: MediaAsset; size: "row" | "tile" }) {
    const src = thumbSrc(asset);
    return (
        <span className={cn("block shrink-0 overflow-hidden rounded-[var(--opslin-radius-lg)] bg-muted", size === "row" ? "size-10" : "aspect-square w-full")} style={{ backgroundColor: placeholderColor(asset.thumbhash) }}>
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element -- served straight from the customer's image domain
                <img src={src} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
                <ImageIcon className="m-auto size-4 text-muted-foreground" aria-hidden="true" />
            )}
        </span>
    );
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
    const [view, setView] = useState<ViewMode>("list");
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
        const mode = next === "grid" ? "grid" : "list";
        setView(mode);
        try {
            window.localStorage.setItem(VIEW_KEY, mode);
        } catch {
            /* the choice just isn't remembered */
        }
    };

    const searching = search.trim().length > 0;
    const filter = useMemo(() => ({ folder, search, sort }), [folder, search, sort]);
    const assetsQuery = useLibraryAssets(filter);
    const foldersQuery = useLibraryFolders(folder, !searching);
    const assets = useMemo(() => assetsQuery.data?.pages.flatMap((page) => page.assets) ?? [], [assetsQuery.data]);
    const total = assetsQuery.data?.pages[0]?.total ?? 0;
    const folders = searching ? [] : (foldersQuery.data?.folders ?? []);
    const detail = assets.find((asset) => asset.id === detailId) ?? null;

    useEffect(() => setSelected(new Set()), [folder, search]);

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
    const empty = !assetsQuery.isLoading && !loadFailure && assets.length === 0 && folders.length === 0 && uploads.length === 0;

    function onDrop(event: React.DragEvent) {
        event.preventDefault();
        setDragging(false);
        if (!canWrite || !sdk) return;
        // Entries are only readable during the event itself.
        void collectDropped(event.dataTransfer).then(addFiles);
    }

    return (
        <Panel
            onDragOver={(event) => {
                if (!canWrite || !sdk || !event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                setDragging(true);
            }}
            onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={onDrop}
            className={cn(dragging && "ring-2 ring-ring")}
        >
            <input ref={filePicker} type="file" multiple hidden accept={ACCEPTED_TYPES.join(",")} aria-label="Choose images" onChange={(event) => { if (event.target.files) addFiles(Array.from(event.target.files).map((file) => ({ file, relativeDir: "" }))); event.target.value = ""; }} />
            <input ref={folderPicker} type="file" hidden multiple aria-label="Choose a folder" {...{ webkitdirectory: "", directory: "" }} onChange={(event) => { if (event.target.files) addFiles(fromDirectoryInput(event.target.files)); event.target.value = ""; }} />

            {selected.size > 0 ? (
                <Section>
                    <div className="flex min-h-14 flex-wrap items-center gap-2 px-5 py-2">
                        <Checkbox aria-label="Select all" checked={allSelected} onCheckedChange={(checked) => setSelected(checked ? new Set(assets.map((asset) => asset.id)) : new Set())} />
                        <span className="mr-auto text-sm font-medium">{formatCount(selected.size)} selected</span>
                        {canWrite ? (
                            <>
                                <Button variant="outline" size="sm" onClick={() => { setDialogError(null); setDialog({ kind: "move", ids: selectedIds }); }}><Folder className="mr-2 size-4" aria-hidden="true" />Move</Button>
                                <Button variant="outline" size="sm" onClick={() => { setDialogError(null); setDialog({ kind: "tags" }); }}><Tag className="mr-2 size-4" aria-hidden="true" />Tags</Button>
                            </>
                        ) : null}
                        <ExportMenu label="Selected images" disabled={Boolean(exporting)} onExport={exportAssets} />
                        {canWrite ? <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "delete", ids: selectedIds })}><Trash2 className="mr-2 size-4" aria-hidden="true" />Delete</Button> : null}
                        <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
                    </div>
                </Section>
            ) : (
                <Section>
                    <div className="flex min-h-14 flex-wrap items-center gap-2 px-5 py-2">
                        <nav aria-label="Folder path" className="mr-auto flex min-w-0 flex-wrap items-center gap-1 text-sm">
                            {searching ? (
                                <span className="font-medium">{`Results for “${search.trim()}”`}</span>
                            ) : (
                                <>
                                    <button type="button" className={cn("rounded px-1 focus-visible:ring-2 focus-visible:ring-ring", segments.length === 0 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => setFolder("")}>Library</button>
                                    {segments.map((segment, index) => (
                                        <span key={segments.slice(0, index + 1).join("/")} className="flex items-center gap-1">
                                            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                                            <button type="button" className={cn("rounded px-1 focus-visible:ring-2 focus-visible:ring-ring", index === segments.length - 1 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => setFolder(segments.slice(0, index + 1).join("/"))}>{segment}</button>
                                        </span>
                                    ))}
                                </>
                            )}
                        </nav>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                            <Input aria-label="Search images" placeholder="Search" className="w-40 pl-8 sm:w-52" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
                        </div>
                        <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                            <SelectTrigger aria-label="Sort" className="w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>{Object.entries(SORTS).map(([key, value]) => <SelectItem key={key} value={key}>{value.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <ToggleGroup value={view} onValueChange={changeView}>
                            <ToggleGroupItem value="list" aria-label="List view" className="px-2"><List className="size-4" aria-hidden="true" /></ToggleGroupItem>
                            <ToggleGroupItem value="grid" aria-label="Grid view" className="px-2"><LayoutGrid className="size-4" aria-hidden="true" /></ToggleGroupItem>
                        </ToggleGroup>
                        <ExportMenu label={folder ? "This folder and below" : "Whole library"} disabled={Boolean(exporting)} onExport={exportAssets} />
                        {canWrite ? (
                            <>
                                <Button variant="outline" onClick={() => { setDialogError(null); setDialog({ kind: "new-folder" }); }}><FolderPlus className="mr-2 size-4" aria-hidden="true" />New folder</Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button disabled={!sdk || outdated}><Upload className="mr-2 size-4" aria-hidden="true" />Upload</Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => filePicker.current?.click()}>Choose images</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => folderPicker.current?.click()}>Choose a folder</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        ) : null}
                    </div>
                    {exporting ? <LockedLine>{`Preparing ZIP: ${exporting.done} of ${exporting.total}`}</LockedLine> : null}
                </Section>
            )}

            {!canWrite ? <LockedLine>Only members, admins and owners can change the library.</LockedLine> : null}
            {outdated ? (
                <Section>
                    <UpdateRow media={media} />
                    <LockedLine>Update the upload service to use the library.</LockedLine>
                </Section>
            ) : null}
            {notice ? <LockedLine>{notice}</LockedLine> : null}
            {dragging ? <LockedLine>{`Drop to upload to ${folder || "the top level"}.`}</LockedLine> : null}

            {!outdated ? (
                <Section>
                    {uploads.map((item) => (
                        <UploadRow key={item.id} item={item} onRetry={() => queueRef.current?.retry(item.id)} onDismiss={() => queueRef.current?.dismiss(item.id)} />
                    ))}

                    {assetsQuery.isLoading || (!searching && foldersQuery.isLoading) ? (
                        Array.from({ length: 5 }, (_, index) => <Row key={index} leading={<SkeletonText className="size-10" />} label={<SkeletonText className="h-4 w-48" />} state={<SkeletonText className="h-4 w-16" />} />)
                    ) : loadFailure ? (
                        <Row label={libraryErrorText(loadFailure)} action={<Button variant="outline" onClick={() => { void assetsQuery.refetch(); void foldersQuery.refetch(); }}>Retry</Button>} />
                    ) : null}

                    {folders.map((item) => (
                        <FolderRow key={item.path} item={item} canWrite={canWrite} onOpen={() => setFolder(item.path)} onRename={() => { setDialogError(null); setDialog({ kind: "rename-folder", folder: item }); }} onDelete={() => { setDialogError(null); setDialog({ kind: "delete-folder", folder: item }); }} />
                    ))}

                    {view === "list"
                        ? assets.map((asset, index) => (
                              <Row
                                  key={asset.id}
                                  leading={<span className="flex items-center gap-3"><Checkbox aria-label={`Select ${asset.name}`} checked={selected.has(asset.id)} onClick={(event) => { event.stopPropagation(); toggle(asset.id, index, event.shiftKey); }} onCheckedChange={() => undefined} /></span>}
                                  label={
                                      <button type="button" className="flex min-w-0 items-center gap-3 text-left focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setDetailId(asset.id)}>
                                          <Thumb asset={asset} size="row" />
                                          <span className="min-w-0">
                                              <span className="block truncate">{asset.name}</span>
                                              {searching && asset.folder ? <span className="block truncate text-xs font-normal text-muted-foreground">{asset.folder}</span> : null}
                                          </span>
                                      </button>
                                  }
                                  state={<span className="hidden gap-4 sm:flex"><span>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : ""}</span><span>{formatBytes(asset.bytes)}</span><span className="w-20 text-right">{formatRelativeTime(asset.createdAt)}</span></span>}
                              />
                          ))
                        : null}

                    {view === "grid" && assets.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-4 lg:grid-cols-5">
                            {assets.map((asset, index) => (
                                <div key={asset.id} className="group relative min-w-0">
                                    <button type="button" className="block w-full text-left focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setDetailId(asset.id)} aria-label={`Open ${asset.name}`}>
                                        <Thumb asset={asset} size="tile" />
                                        <span className="mt-1.5 block truncate text-sm">{asset.name}</span>
                                        <span className="block truncate text-xs text-muted-foreground">{formatBytes(asset.bytes)}</span>
                                    </button>
                                    <span className={cn("absolute left-2 top-2 rounded bg-background/90 p-1", selected.has(asset.id) ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100")}>
                                        <Checkbox aria-label={`Select ${asset.name}`} checked={selected.has(asset.id)} onClick={(event) => { event.stopPropagation(); toggle(asset.id, index, event.shiftKey); }} onCheckedChange={() => undefined} />
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {empty ? (
                        <Row
                            label={searching ? `No images match “${search.trim()}”` : folder ? "No images in this folder yet" : "No images yet"}
                            action={searching ? <Button variant="outline" onClick={() => setSearchText("")}>Clear search</Button> : canWrite ? <Button onClick={() => filePicker.current?.click()} disabled={!sdk}><Upload className="mr-2 size-4" aria-hidden="true" />Upload images</Button> : undefined}
                        />
                    ) : null}

                    {assetsQuery.hasNextPage ? (
                        <Row label={`Showing ${formatCount(assets.length)} of ${formatCount(total)}`} action={<Button variant="outline" onClick={() => assetsQuery.fetchNextPage()} disabled={assetsQuery.isFetchingNextPage}>{assetsQuery.isFetchingNextPage ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}Show more</Button>} />
                    ) : null}
                </Section>
            ) : null}

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
        </Panel>
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

function FolderRow({ item, canWrite, onOpen, onRename, onDelete }: { item: MediaFolder; canWrite: boolean; onOpen: () => void; onRename: () => void; onDelete: () => void }) {
    return (
        <Row
            leading={<Folder className="size-4 text-muted-foreground" aria-hidden="true" />}
            label={<button type="button" className="block max-w-full truncate text-left focus-visible:ring-2 focus-visible:ring-ring" onClick={onOpen}>{item.name}</button>}
            state={`${formatCount(item.assets)} ${item.assets === 1 ? "image" : "images"}${item.folders ? `, ${formatCount(item.folders)} ${item.folders === 1 ? "folder" : "folders"}` : ""}`}
            action={
                canWrite ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Folder options for ${item.name}`}><MoreHorizontal className="size-4" aria-hidden="true" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
                            <DropdownMenuItem onSelect={onDelete}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : undefined
            }
        />
    );
}
