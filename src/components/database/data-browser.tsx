"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Table, Plus, Edit, Trash2, Search, ChevronLeft, ChevronRight,
    Loader2, RefreshCw, Database, MoreHorizontal, X, Save, AlertCircle,
    ChevronFirst, ChevronLast, SortAsc, SortDesc, Filter
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface DataBrowserProps {
    serverId: string;
    dbId: string;
    dbType: string;
    dbName: string;
    readOnly: boolean;
}

interface TableRow {
    [key: string]: unknown;
}

interface ColumnInfo {
    name: string;
    type: string;
}

export function DataBrowser({ serverId, dbId, dbType, dbName, readOnly }: DataBrowserProps) {
    // State
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [rows, setRows] = useState<TableRow[]>([]);
    const [columns, setColumns] = useState<ColumnInfo[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [loading, setLoading] = useState(false);
    const [tablesLoading, setTablesLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

    // Modal states
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [editingRow, setEditingRow] = useState<TableRow | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const totalPages = Math.ceil(totalCount / pageSize);

    // Fetch tables
    const fetchTables = useCallback(async () => {
        setTablesLoading(true);
        try {
            const res = await fetch(`${API_URL}/servers/${serverId}/databases/${dbId}/tables`, {
                credentials: "include",
            });
            const data = await res.json();
            setTables(data.tables || []);
        } catch (err) {
            console.error("Failed to fetch tables:", err);
        }
        setTablesLoading(false);
    }, [serverId, dbId]);

    // Fetch table data
    const fetchTableData = useCallback(async () => {
        if (!selectedTable) return;
        setLoading(true);
        try {
            const offset = (page - 1) * pageSize;
            const res = await fetch(
                `${API_URL}/servers/${serverId}/databases/${dbId}/tables/${selectedTable}/data?limit=${pageSize}&offset=${offset}`,
                { credentials: "include" }
            );
            const data = await res.json();

            if (data.rows && data.rows.length > 0) {
                setRows(data.rows);
                // Extract column info
                const cols = Object.keys(data.rows[0]).map(name => ({
                    name,
                    type: typeof data.rows[0][name]
                }));
                setColumns(cols);
                setTotalCount(data.totalCount || data.rows.length);
            } else {
                setRows([]);
                setColumns([]);
                setTotalCount(0);
            }
        } catch (err) {
            console.error("Failed to fetch data:", err);
        }
        setLoading(false);
    }, [serverId, dbId, selectedTable, page, pageSize]);

    // Execute query
    const executeQuery = async (query: string) => {
        try {
            const res = await fetch(`${API_URL}/servers/${serverId}/databases/${dbId}/query`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({ query }),
            });
            return await res.json();
        } catch (err) {
            console.error("Query failed:", err);
            return { error: "Query failed" };
        }
    };

    // Effects
    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            void fetchTables();
        }, 0);
        return () => window.clearTimeout(timeoutId);
    }, [fetchTables]);
    useEffect(() => {
        if (!selectedTable) return;
        const timeoutId = window.setTimeout(() => {
            void fetchTableData();
        }, 0);
        return () => window.clearTimeout(timeoutId);
    }, [selectedTable, page, pageSize, fetchTableData]);

    // Handlers
    const handleAddRow = async () => {
        if (!selectedTable || readOnly) return;
        setSaving(true);

        const cols = Object.keys(formData).filter(k => formData[k]);
        const vals = cols.map(k => `'${formData[k].replace(/'/g, "''")}'`);
        const query = `INSERT INTO "${selectedTable}" (${cols.join(", ")}) VALUES (${vals.join(", ")});`;

        const result = await executeQuery(query);
        setSaving(false);

        if (result.success) {
            setShowAddModal(false);
            setFormData({});
            fetchTableData();
        }
    };

    const handleEditRow = async () => {
        if (!selectedTable || !editingRow || readOnly) return;
        setSaving(true);

        const setClause = Object.entries(formData)
            .filter(([k, v]) => v !== undefined)
            .map(([k, v]) => `"${k}" = '${v.replace(/'/g, "''")}'`)
            .join(", ");

        // Use first column as primary key (usually 'id')
        const pkCol = columns[0]?.name || "id";
        const pkVal = editingRow[pkCol];
        const query = `UPDATE "${selectedTable}" SET ${setClause} WHERE "${pkCol}" = '${pkVal}';`;

        const result = await executeQuery(query);
        setSaving(false);

        if (result.success) {
            setShowEditModal(false);
            setEditingRow(null);
            setFormData({});
            fetchTableData();
        }
    };

    const handleDeleteRow = async () => {
        if (!selectedTable || !editingRow || readOnly) return;
        setSaving(true);

        const pkCol = columns[0]?.name || "id";
        const pkVal = editingRow[pkCol];
        const query = `DELETE FROM "${selectedTable}" WHERE "${pkCol}" = '${pkVal}';`;

        const result = await executeQuery(query);
        setSaving(false);

        if (result.success) {
            setShowDeleteModal(false);
            setEditingRow(null);
            fetchTableData();
        }
    };

    const openEditModal = (row: TableRow) => {
        setEditingRow(row);
        const data: Record<string, string> = {};
        columns.forEach(col => {
            data[col.name] = String(row[col.name] ?? "");
        });
        setFormData(data);
        setShowEditModal(true);
    };

    const openDeleteModal = (row: TableRow) => {
        setEditingRow(row);
        setShowDeleteModal(true);
    };

    const openAddModal = () => {
        const data: Record<string, string> = {};
        columns.forEach(col => { data[col.name] = ""; });
        setFormData(data);
        setShowAddModal(true);
    };

    // Pagination helpers
    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        const maxVisible = 7;

        if (totalPages <= maxVisible) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (page > 3) pages.push("...");

            const start = Math.max(2, page - 1);
            const end = Math.min(totalPages - 1, page + 1);
            for (let i = start; i <= end; i++) pages.push(i);

            if (page < totalPages - 2) pages.push("...");
            pages.push(totalPages);
        }
        return pages;
    };

    // Sort rows
    const sortedRows = sortColumn
        ? [...rows].sort((a, b) => {
            const aVal = String(a[sortColumn] ?? "");
            const bVal = String(b[sortColumn] ?? "");
            return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        })
        : rows;

    // Filter rows
    const filteredRows = searchQuery
        ? sortedRows.filter(row =>
            Object.values(row).some(val =>
                String(val).toLowerCase().includes(searchQuery.toLowerCase())
            )
        )
        : sortedRows;

    const formatNumber = (n: number) => new Intl.NumberFormat().format(n);

    return (
        <Card className="overflow-hidden border-0 shadow-xl bg-gradient-to-br from-white to-slate-50">
            <CardHeader className="bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/10 rounded-lg backdrop-blur">
                            <Database className="h-5 w-5" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Data Browser</CardTitle>
                            <CardDescription className="text-slate-300">
                                Browse and manage your database content
                            </CardDescription>
                        </div>
                    </div>
                    {readOnly && (
                        <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Read-Only Mode
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-0 overflow-hidden">
                <div className="flex h-[500px]">
                    {/* Sidebar */}
                    <div className="w-56 border-r bg-slate-50/50 p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-slate-700">Tables</h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={fetchTables}
                                className="h-7 w-7"
                            >
                                <RefreshCw className={`h-4 w-4 ${tablesLoading ? "animate-spin" : ""}`} />
                            </Button>
                        </div>

                        {tablesLoading ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-10 bg-slate-200 rounded-lg animate-pulse" />
                                ))}
                            </div>
                        ) : tables.length === 0 ? (
                            <div className="text-center py-8">
                                <Table className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                                <p className="text-sm text-slate-400">No tables found</p>
                                <p className="text-xs text-slate-400 mt-1">Create tables to see them here</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {tables.map((table) => (
                                    <button
                                        key={table}
                                        onClick={() => { setSelectedTable(table); setPage(1); }}
                                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-all duration-200 ${selectedTable === table
                                            ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25"
                                            : "hover:bg-white hover:shadow text-slate-600"
                                            }`}
                                    >
                                        <Table className="h-4 w-4" />
                                        <span className="truncate">{table}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Main Content - Fixed width container */}
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        {!selectedTable ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                                <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center mb-6">
                                    <Table className="h-12 w-12 text-slate-300" />
                                </div>
                                <h3 className="text-lg font-medium text-slate-600 mb-2">Select a Table</h3>
                                <p className="text-sm">Choose a table from the sidebar to view and manage data</p>
                            </div>
                        ) : (
                            <>
                                {/* Fixed Toolbar - Never scrolls */}
                                <div className="flex items-center justify-between p-4 border-b bg-white flex-shrink-0">
                                    <div className="flex items-center gap-4">
                                        <h3 className="font-semibold text-slate-900">{selectedTable}</h3>
                                        <Badge variant="secondary" className="font-mono">
                                            {formatNumber(totalCount)} rows
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                            <Input
                                                placeholder="Search..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="pl-9 w-64"
                                            />
                                        </div>
                                        <Button variant="outline" size="sm" onClick={fetchTableData}>
                                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                                        </Button>
                                        {!readOnly && (
                                            <Button size="sm" onClick={openAddModal} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700">
                                                <Plus className="h-4 w-4 mr-2" />
                                                Add Row
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Scrollable Table Container - ONLY this area scrolls */}
                                <div className="flex-1 overflow-auto relative">
                                    {loading ? (
                                        <div className="flex items-center justify-center h-64">
                                            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                        </div>
                                    ) : filteredRows.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                                            <Database className="h-12 w-12 mb-4 text-slate-300" />
                                            <p className="font-medium">No data in this table</p>
                                            {!readOnly && (
                                                <Button size="sm" className="mt-4" onClick={openAddModal}>
                                                    <Plus className="h-4 w-4 mr-2" />
                                                    Add First Row
                                                </Button>
                                            )}
                                        </div>
                                    ) : (
                                        <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: `${columns.length * 150}px` }}>
                                            <thead className="bg-slate-100 sticky top-0">
                                                <tr>
                                                    {columns.map((col) => (
                                                        <th
                                                            key={col.name}
                                                            onClick={() => {
                                                                if (sortColumn === col.name) {
                                                                    setSortOrder(o => o === "asc" ? "desc" : "asc");
                                                                } else {
                                                                    setSortColumn(col.name);
                                                                    setSortOrder("asc");
                                                                }
                                                            }}
                                                            className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide cursor-pointer hover:bg-slate-200 transition-colors border-r border-slate-200 last:border-r-0" style={{ width: '150px' }}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {col.name}
                                                                {sortColumn === col.name && (
                                                                    sortOrder === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />
                                                                )}
                                                            </div>
                                                        </th>
                                                    ))}
                                                    {!readOnly && (
                                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase w-20">
                                                            Actions
                                                        </th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {filteredRows.map((row, idx) => (
                                                    <tr
                                                        key={idx}
                                                        className="hover:bg-blue-50/50 transition-colors group"
                                                    >
                                                        {columns.map((col) => (
                                                            <td
                                                                key={col.name}
                                                                className="px-4 py-3 text-sm text-slate-700 border-r border-slate-100 last:border-r-0 overflow-hidden"
                                                                style={{ width: '150px' }}
                                                            >
                                                                <div
                                                                    className="truncate"
                                                                    title={String(row[col.name] ?? "")}
                                                                >
                                                                    {typeof row[col.name] === "object"
                                                                        ? JSON.stringify(row[col.name])
                                                                        : String(row[col.name] ?? "")}
                                                                </div>
                                                            </td>
                                                        ))}
                                                        {!readOnly && (
                                                            <td className="px-4 py-3 text-right">
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <MoreHorizontal className="h-4 w-4" />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuItem onClick={() => openEditModal(row)}>
                                                                            <Edit className="h-4 w-4 mr-2" />
                                                                            Edit Row
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            onClick={() => openDeleteModal(row)}
                                                                            className="text-red-600"
                                                                        >
                                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                                            Delete Row
                                                                        </DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                                {/* Pagination */}
                                {totalPages > 0 && (
                                    <div className="flex items-center justify-between p-4 border-t bg-white">
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm text-slate-500">Show</span>
                                            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                                                <SelectTrigger className="w-20 h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="10">10</SelectItem>
                                                    <SelectItem value="25">25</SelectItem>
                                                    <SelectItem value="50">50</SelectItem>
                                                    <SelectItem value="100">100</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <span className="text-sm text-slate-500">
                                                Showing {formatNumber(((page - 1) * pageSize) + 1)} - {formatNumber(Math.min(page * pageSize, totalCount))} of {formatNumber(totalCount)}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-9 w-9"
                                                onClick={() => setPage(1)}
                                                disabled={page === 1}
                                            >
                                                <ChevronFirst className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-9 w-9"
                                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                                disabled={page === 1}
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>

                                            {getPageNumbers().map((p, i) => (
                                                typeof p === "number" ? (
                                                    <Button
                                                        key={i}
                                                        variant={page === p ? "default" : "outline"}
                                                        size="icon"
                                                        className={`h-9 w-9 ${page === p ? "bg-blue-600" : ""}`}
                                                        onClick={() => setPage(p)}
                                                    >
                                                        {p}
                                                    </Button>
                                                ) : (
                                                    <span key={i} className="px-2 text-slate-400">...</span>
                                                )
                                            ))}

                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-9 w-9"
                                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                                disabled={page === totalPages}
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-9 w-9"
                                                onClick={() => setPage(totalPages)}
                                                disabled={page === totalPages}
                                            >
                                                <ChevronLast className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </CardContent>

            {/* Add Row Modal */}
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5 text-green-600" />
                            Add New Row
                        </DialogTitle>
                        <DialogDescription>
                            Insert a new record into <span className="font-mono font-medium">{selectedTable}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto py-4">
                        {columns.map((col) => (
                            <div key={col.name} className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                    {col.name}
                                    <Badge variant="outline" className="text-xs font-mono">{col.type}</Badge>
                                </label>
                                <Input
                                    value={formData[col.name] || ""}
                                    onChange={(e) => setFormData(d => ({ ...d, [col.name]: e.target.value }))}
                                    placeholder={`Enter ${col.name}...`}
                                />
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
                        <Button onClick={handleAddRow} disabled={saving} className="bg-green-600 hover:bg-green-700">
                            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                            Insert Row
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Row Modal */}
            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Edit className="h-5 w-5 text-blue-600" />
                            Edit Row
                        </DialogTitle>
                        <DialogDescription>
                            Modify the selected record in <span className="font-mono font-medium">{selectedTable}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto py-4">
                        {columns.map((col) => (
                            <div key={col.name} className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                    {col.name}
                                    <Badge variant="outline" className="text-xs font-mono">{col.type}</Badge>
                                </label>
                                <Input
                                    value={formData[col.name] || ""}
                                    onChange={(e) => setFormData(d => ({ ...d, [col.name]: e.target.value }))}
                                />
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
                        <Button onClick={handleEditRow} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Modal */}
            <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <Trash2 className="h-5 w-5" />
                            Delete Row
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this row? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    {editingRow && (
                        <div className="bg-slate-100 rounded-lg p-4 my-4 max-h-48 overflow-auto">
                            <pre className="text-xs font-mono text-slate-600">
                                {JSON.stringify(editingRow, null, 2)}
                            </pre>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDeleteRow} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                            Delete Row
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
