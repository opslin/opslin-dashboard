"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Filter, MoreVertical, ChevronLeft, ChevronRight, RefreshCw, Trash2, UserPlus, Users, UserCog, FileCode, Eye, CircleHelp, Lock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api, type OrgRole } from "@/lib/api";
import { toast } from "sonner";

const PAGE_SIZE = 8;
const ROLE_OPTIONS: OrgRole[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

const ROLE_CONFIG: Record<string, { label: string; bg: string; text: string; accessLevel: string }> = {
    OWNER: { label: "Owner", bg: "bg-warning-muted", text: "text-warning-text", accessLevel: "Full access" },
    ADMIN: { label: "Admin", bg: "bg-info-muted", text: "text-info-text", accessLevel: "Admin access" },
    MEMBER: { label: "Developer", bg: "bg-chart-violet/15", text: "text-chart-violet", accessLevel: "Development access" },
    VIEWER: { label: "Viewer", bg: "bg-success-muted", text: "text-success-text", accessLevel: "Read only" },
};

export default function TeamsPage() {
    const queryClient = useQueryClient();
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<OrgRole>("MEMBER");
    const [searchQuery, setSearchQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);

    const { data: organization, isLoading, isError, refetch } = useQuery({
        queryKey: ["organization", "current"],
        queryFn: () => api.getCurrentOrganization(),
    });

    const refresh = () => queryClient.invalidateQueries({ queryKey: ["organization", "current"] });

    const inviteMutation = useMutation({
        mutationFn: () => api.createOrganizationInvite({ email: inviteEmail, role: inviteRole }),
        onSuccess: () => { toast.success(`Invite sent to ${inviteEmail}`); setInviteEmail(""); setInviteRole("MEMBER"); setInviteOpen(false); refresh(); },
        onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed to invite"); },
    });

    const resendMutation = useMutation({
        mutationFn: (id: string) => api.resendOrganizationInvite(id),
        onSuccess: () => { toast.success("Invite resent"); refresh(); },
    });

    const revokeMutation = useMutation({
        mutationFn: (id: string) => api.revokeOrganizationInvite(id),
        onSuccess: () => { toast.success("Invite revoked"); refresh(); },
    });

    const updateRoleMutation = useMutation({
        mutationFn: ({ userId, role }: { userId: string; role: OrgRole }) => api.updateOrganizationMemberRole(userId, role),
        onSuccess: () => { toast.success("Role updated"); refresh(); },
        onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed"); },
    });

    const removeMemberMutation = useMutation({
        mutationFn: (userId: string) => api.removeOrganizationMember(userId),
        onSuccess: () => { toast.success("Member removed"); refresh(); },
        onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed"); },
    });

    const members = organization?.members || [];
    const invites = organization?.invites || [];

    // Stats
    const totalMembers = members.length;
    const adminCount = members.filter(m => m.role === "ADMIN").length;
    const devCount = members.filter(m => m.role === "MEMBER").length;
    const viewerCount = members.filter(m => m.role === "VIEWER").length;

    // Filtered members
    const filteredMembers = useMemo(() => {
        return members.filter(m => {
            if (searchQuery && !m.user.name.toLowerCase().includes(searchQuery.toLowerCase()) && !m.user.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            if (roleFilter !== "all" && m.role !== roleFilter) return false;
            return true;
        });
    }, [members, searchQuery, roleFilter]);

    const totalPages = Math.ceil(filteredMembers.length / PAGE_SIZE);
    const paginatedMembers = filteredMembers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    return (
        <div className="dashboard-page">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Users size={36} />
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Team Management</h1>
                        <p className="text-sm text-muted-foreground">Manage your team members, roles, and permissions.</p>
                    </div>
                </div>
                <Button size="sm" className="h-9 gap-2 text-sm font-medium px-4" onClick={() => setInviteOpen(true)}>
                    <UserPlus className="h-4 w-4" /> Invite Members
                </Button>
            </div>

            {isError ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm text-danger-text">
                    <span>Couldn&apos;t load your organization&apos;s team data. Try again.</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
                </div>
            ) : null}

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Team Members</span>
                        <Users size={24} />
                    </div>
                    <div className="text-3xl font-mono font-bold text-foreground">{totalMembers}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">Active members</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Administrators</span>
                        <UserCog size={24} />
                    </div>
                    <div className="text-3xl font-mono font-bold text-foreground">{adminCount}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">Team admins</div>
                    <div className="text-[10px] text-muted-foreground">{totalMembers > 0 ? Math.round((adminCount / totalMembers) * 100) : 0}% of team</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Developers</span>
                        <FileCode size={24} />
                    </div>
                    <div className="text-3xl font-mono font-bold text-foreground">{devCount}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">Developers</div>
                    <div className="text-[10px] text-muted-foreground">{totalMembers > 0 ? Math.round((devCount / totalMembers) * 100) : 0}% of team</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Viewers</span>
                        <Eye size={24} />
                    </div>
                    <div className="text-3xl font-mono font-bold text-foreground">{viewerCount}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">View only access</div>
                    <div className="text-[10px] text-muted-foreground">{totalMembers > 0 ? Math.round((viewerCount / totalMembers) * 100) : 0}% of team</div>
                </div>
            </div>

            {/* How team management works */}
            <div className="rounded-xl border border-info/20 bg-info-muted p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">How team management works</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { icon: UserPlus, title: "Invite Members", desc: "Invite your team members by email to give them access to Opslin." },
                        { icon: UserCog, title: "Assign Roles", desc: "Assign appropriate roles and permissions based on responsibilities." },
                        { icon: Lock, title: "Set Permissions", desc: "Configure what resources and actions each role can access." },
                        { icon: Shield, title: "Collaborate Securely", desc: "Your team can now work together with proper access control." },
                    ].map(step => (
                        <div key={step.title} className="flex flex-col items-center text-center gap-2">
                            <step.icon size={32} />
                            <div className="text-xs font-medium text-foreground">{step.title}</div>
                            <div className="text-[10px] text-muted-foreground leading-relaxed">{step.desc}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Team Members Table */}
            <div className="rounded-xl border border-border bg-card">
                <div className="px-6 pt-6 pb-4">
                    <h2 className="text-lg font-semibold text-foreground">Team Members</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Manage your team members and their access levels.</p>
                </div>

                {/* Filters */}
                <div className="px-6 pb-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search members by name or email..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="pl-9 h-9 border-border bg-background" />
                    </div>
                    <div className="flex items-center gap-2">
                        <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setCurrentPage(1); }}>
                            <SelectTrigger className="h-9 w-28 border-border bg-background text-xs"><SelectValue placeholder="All Roles" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Roles</SelectItem>
                                <SelectItem value="OWNER">Owner</SelectItem>
                                <SelectItem value="ADMIN">Admin</SelectItem>
                                <SelectItem value="MEMBER">Developer</SelectItem>
                                <SelectItem value="VIEWER">Viewer</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" className="h-9 gap-1.5 border-border text-xs"><Filter className="h-3.5 w-3.5" /> Filters</Button>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-y border-border bg-muted/30">
                                <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Access Level</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Joined</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                                <th className="text-right py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedMembers.map(member => {
                                const roleConfig = ROLE_CONFIG[member.role] || ROLE_CONFIG.MEMBER;
                                const initials = member.user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                                return (
                                    <tr key={member.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                                        <td className="py-3.5 px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">{initials}</div>
                                                <div>
                                                    <div className="font-medium text-foreground">{member.user.name}</div>
                                                    <div className="text-xs text-muted-foreground">{member.user.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${roleConfig.bg} ${roleConfig.text}`}>{roleConfig.label}</span>
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <div className="text-xs text-foreground font-medium">{roleConfig.accessLevel}</div>
                                            <div className="text-[10px] text-muted-foreground">{member.role === "OWNER" ? "All resources and settings" : member.role === "ADMIN" ? "Manage team & settings" : member.role === "MEMBER" ? "Deploy and manage apps" : "View resources and logs"}</div>
                                        </td>
                                        <td className="py-3.5 px-4 text-xs text-muted-foreground">{new Date(member.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                                        <td className="py-3.5 px-4">
                                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-text">
                                                <span className="h-1.5 w-1.5 rounded-full bg-success" /> Active
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-6 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreVertical className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    {ROLE_OPTIONS.filter(r => r !== member.role).map(role => (
                                                        <DropdownMenuItem key={role} onClick={() => updateRoleMutation.mutate({ userId: member.userId, role })}>Change to {ROLE_CONFIG[role]?.label || role}</DropdownMenuItem>
                                                    ))}
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem className="text-danger-text focus:text-danger" onClick={() => { if (confirm(`Remove ${member.user.name}?`)) removeMemberMutation.mutate(member.userId); }}>
                                                        <Trash2 className="h-4 w-4 mr-2" /> Remove member
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                );
                            })}
                            {paginatedMembers.length === 0 && (
                                <tr><td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">{isLoading ? "Loading..." : isError ? "Couldn't load members" : "No members found"}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {filteredMembers.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between border-t border-border px-6 py-3">
                        <span className="text-xs text-muted-foreground">Showing {((currentPage - 1) * PAGE_SIZE) + 1} to {Math.min(currentPage * PAGE_SIZE, filteredMembers.length)} of {filteredMembers.length} members</span>
                        <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                            {Array.from({ length: Math.min(totalPages, 4) }, (_, i) => i + 1).map(p => (
                                <Button key={p} variant={currentPage === p ? "default" : "outline"} size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setCurrentPage(p)}>{p}</Button>
                            ))}
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Role & Permissions Overview */}
            <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="text-lg font-semibold text-foreground mb-1">Role & Permissions Overview</h2>
                <p className="text-sm text-muted-foreground mb-5">Understand what each role can do in Opslin.</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { role: "Owner", subtitle: "Full access", color: "bg-warning-muted text-warning-text", permissions: ["All permissions", "Manage team", "Billing & settings", "Delete resources"], count: members.filter(m => m.role === "OWNER").length },
                        { role: "Admin", subtitle: "High access", color: "bg-info-muted text-info-text", permissions: ["Manage team", "App deployments", "System settings", "View billing"], count: adminCount },
                        { role: "Developer", subtitle: "Development", color: "bg-chart-violet/15 text-chart-violet", permissions: ["Deploy apps", "Manage servers", "View logs", "No team management"], count: devCount },
                        { role: "Viewer", subtitle: "Read-only", color: "bg-success-muted text-success-text", permissions: ["View apps", "View servers", "View logs", "No modifications"], count: viewerCount },
                    ].map(item => (
                        <div key={item.role} className="rounded-xl border border-border p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${item.color}`}>{item.role}</span>
                                <span className="text-[10px] text-muted-foreground">{item.subtitle}</span>
                            </div>
                            <ul className="space-y-1.5 mb-3">
                                {item.permissions.map(p => (
                                    <li key={p} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                        <span className="text-success-text">✓</span> {p}
                                    </li>
                                ))}
                            </ul>
                            <div className="text-[10px] text-muted-foreground border-t border-border/50 pt-2">{item.count} members</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Pending Invitations */}
            <div className="rounded-xl border border-border bg-card">
                <div className="px-6 pt-6 pb-4">
                    <h2 className="text-lg font-semibold text-foreground">Pending Invitations</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Review and manage pending invitations.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-y border-border bg-muted/30">
                                <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invited By</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invited</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                                <th className="text-right py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invites.map(invite => {
                                const roleConfig = ROLE_CONFIG[invite.role] || ROLE_CONFIG.MEMBER;
                                return (
                                    <tr key={invite.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                                        <td className="py-3.5 px-6 text-foreground font-medium">{invite.email}</td>
                                        <td className="py-3.5 px-4">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${roleConfig.bg} ${roleConfig.text}`}>{roleConfig.label}</span>
                                        </td>
                                        {/* NEEDS-API: OrganizationInvite has no inviter field in the /orgs/current response
                                            (the DB stores invitedById at creation, but it isn't serialized through) */}
                                        <td className="py-3.5 px-4 text-xs text-muted-foreground">—</td>
                                        <td className="py-3.5 px-4 text-xs text-muted-foreground">{invite.createdAt ? new Date(invite.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                                        <td className="py-3.5 px-4">
                                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-text">
                                                <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Pending
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-6 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Button variant="outline" size="sm" className="h-7 text-[11px] border-border" onClick={() => resendMutation.mutate(invite.id)}>Resend</Button>
                                                <Button variant="outline" size="sm" className="h-7 text-[11px] border-border text-danger-text hover:text-danger/80" onClick={() => revokeMutation.mutate(invite.id)}>Revoke</Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {invites.length === 0 && (
                                <tr><td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No pending invitations</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {invites.length > 0 && (
                    <div className="border-t border-border px-6 py-3">
                        <span className="text-xs text-muted-foreground">Showing 1 to {invites.length} of {invites.length} invitations</span>
                    </div>
                )}
            </div>

            {/* Help footer */}
            <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <CircleHelp size={28} />
                    <div>
                        <div className="text-sm font-medium text-foreground">Need help with team management?</div>
                        <div className="text-xs text-muted-foreground">Learn more about roles, permissions, and best practices</div>
                    </div>
                </div>
                <a href="#" className="text-sm text-info-text hover:text-info/80 font-medium flex items-center gap-1">
                    View Documentation <span className="text-xs">↗</span>
                </a>
            </div>

            {/* Invite Dialog */}
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Invite Team Member</DialogTitle>
                        <DialogDescription>Send an invitation to join your organization.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Email address</Label>
                            <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="teammate@example.com" />
                        </div>
                        <div className="space-y-2">
                            <Label>Role</Label>
                            <Select value={inviteRole} onValueChange={v => setInviteRole(v as OrgRole)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{ROLE_CONFIG[r]?.label || r}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                        <Button onClick={() => inviteMutation.mutate()} disabled={!inviteEmail || inviteMutation.isPending}>
                            {inviteMutation.isPending ? "Sending..." : "Send Invite"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
