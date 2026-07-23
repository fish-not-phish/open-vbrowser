"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Building2,
  ChevronRight,
  Loader2,
  MoreHorizontalIcon,
  SearchIcon,
  UserPlus,
  UserMinus,
  Users,
  X,
  ShieldCheck,
  Crown,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import { useAuthContext } from "@/store/AuthContext";
import {
  adminApi,
  type AdminWorkspace,
  type AdminWorkspaceMember,
} from "@/lib/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(m: AdminWorkspaceMember) {
  if (m.first_name || m.last_name)
    return `${m.first_name?.[0] ?? ""}${m.last_name?.[0] ?? ""}`.toUpperCase();
  return m.email.slice(0, 2).toUpperCase();
}

function displayName(m: AdminWorkspaceMember) {
  const full = `${m.first_name} ${m.last_name}`.trim();
  return full || m.email;
}

const ROLES = ["member", "admin", "owner"] as const;
type Role = (typeof ROLES)[number];

const roleBadge: Record<Role, { label: string; icon: React.ReactNode; className: string }> = {
  owner: {
    label: "Owner",
    icon: <Crown className="size-3" />,
    className: "ring-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
  },
  admin: {
    label: "Admin",
    icon: <ShieldCheck className="size-3" />,
    className: "ring-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10",
  },
  member: {
    label: "Member",
    icon: null,
    className: "ring-zinc-500/30 text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-500/10",
  },
};

const badgeClass = "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

// ─── Animation variants ───────────────────────────────────────────────────────

const listVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const itemVariant = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22 } },
};

// ─── Add member form ──────────────────────────────────────────────────────────

function AddMemberForm({
  workspaceUuid,
  csrfToken,
  onAdded,
}: {
  workspaceUuid: string;
  csrfToken: string;
  onAdded: (member: AdminWorkspaceMember) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<{ id: number; email: string; name: string }[]>([]);
  const [selectedEmail, setSelectedEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("member");
  const [adding, setAdding] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search as user types
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await adminApi.searchEntities(query.trim());
        setResults(data.users ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function selectUser(user: { id: number; email: string; name: string }) {
    setSelectedEmail(user.email);
    setQuery(user.email);
    setResults([]);
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const email = selectedEmail || query.trim();
    if (!email) return;
    setAdding(true);
    try {
      const member = await adminApi.addWorkspaceMember(workspaceUuid, { email, role }, csrfToken);
      onAdded(member);
      setQuery("");
      setSelectedEmail("");
      setResults([]);
      setRole("member");
      toast.success(`${member.email} added as ${role}`);
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("409")) toast.error("User is already a member");
      else if (msg.includes("404")) toast.error("No user found with that email");
      else toast.error("Failed to add member");
    } finally {
      setAdding(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add member</p>
      <div className="flex gap-2">
        {/* User search combobox */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div className="relative flex-1">
              <SearchIcon className="absolute left-2.5 top-2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by name or email…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedEmail("");
                  if (!open) setOpen(true);
                }}
                onFocus={() => { if (query.trim()) setOpen(true); }}
                className="h-8 text-sm pl-7 pr-2"
                disabled={adding}
                autoComplete="off"
              />
              {searching && (
                <Loader2 className="absolute right-2.5 top-2 size-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
          </PopoverTrigger>
          {results.length > 0 && (
            <PopoverContent
              className="p-0 w-[var(--radix-popover-trigger-width)]"
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <Command shouldFilter={false}>
                <CommandList>
                  <CommandGroup>
                    {results.map((u) => (
                      <CommandItem
                        key={u.id}
                        value={u.email}
                        onSelect={() => selectUser(u)}
                        className="flex flex-col items-start gap-0 py-2"
                      >
                        <span className="text-sm font-medium">{u.name !== u.email ? u.name : u.email}</span>
                        {u.name !== u.email && (
                          <span className="text-xs text-muted-foreground">{u.email}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          )}
        </Popover>

        <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={adding}>
          <SelectTrigger className="h-8 w-[100px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" className="h-8" disabled={!(selectedEmail || query.trim()) || adding}>
          {adding ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
        </Button>
      </div>
    </form>
  );
}

// ─── Member panel ─────────────────────────────────────────────────────────────

function MemberPanel({
  workspace,
  onClose,
}: {
  workspace: AdminWorkspace;
  onClose: () => void;
}) {
  const { user } = useAuthContext();
  const [members, setMembers] = React.useState<AdminWorkspaceMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [confirmRemove, setConfirmRemove] = React.useState<AdminWorkspaceMember | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const [changingRole, setChangingRole] = React.useState<number | null>(null);

  React.useEffect(() => {
    setLoading(true);
    adminApi.listWorkspaceMembers(workspace.uuid)
      .then(setMembers)
      .catch(() => toast.error("Failed to load members"))
      .finally(() => setLoading(false));
  }, [workspace.uuid]);

  async function changeRole(member: AdminWorkspaceMember, newRole: Role) {
    if (!user.csrfToken) return;
    setChangingRole(member.user_id);
    try {
      const updated = await adminApi.changeWorkspaceMemberRole(workspace.uuid, member.user_id, newRole, user.csrfToken);
      setMembers((prev) => prev.map((m) => {
        // If promoting to owner, demote existing owners
        if (newRole === "owner" && m.role === "owner" && m.user_id !== member.user_id) {
          return { ...m, role: "admin" };
        }
        return m.user_id === member.user_id ? updated : m;
      }));
      toast.success(`${member.email} is now ${newRole}`);
    } catch {
      toast.error("Failed to change role");
    } finally {
      setChangingRole(null);
    }
  }

  async function removeMember() {
    if (!confirmRemove || !user.csrfToken) return;
    setRemoving(true);
    try {
      await adminApi.removeWorkspaceMember(workspace.uuid, confirmRemove.user_id, user.csrfToken);
      setMembers((prev) => prev.filter((m) => m.user_id !== confirmRemove.user_id));
      toast.success(`${confirmRemove.email} removed`);
      setConfirmRemove(null);
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-sm truncate">{workspace.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {workspace.slug} · {loading ? "…" : members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Add member */}
      <div className="border-b px-5 py-3">
        {user.csrfToken && (
          <AddMemberForm
            workspaceUuid={workspace.uuid}
            csrfToken={user.csrfToken}
            onAdded={(m) => setMembers((prev) => [...prev, m])}
          />
        )}
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="size-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No members yet</p>
          </div>
        ) : (
          <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-1">
            {members.map((m) => {
              const rb = roleBadge[m.role as Role] ?? roleBadge.member;
              return (
                <motion.div key={m.user_id} variants={itemVariant}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50 transition-colors group">
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="text-xs">{initials(m)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{displayName(m)}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  <Select
                    value={m.role}
                    onValueChange={(v) => changeRole(m, v as Role)}
                    disabled={changingRole === m.user_id}
                  >
                    <SelectTrigger className="h-7 w-[110px] text-xs border-none bg-transparent shadow-none hover:bg-muted focus:ring-0">
                      <SelectValue>
                        <span className={cn(badgeClass, rb.className)}>
                          {rb.icon}{rb.label}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost" size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setConfirmRemove(m)}
                    aria-label={`Remove ${m.email}`}
                  >
                    <UserMinus className="size-3.5" />
                  </Button>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Remove confirm dialog */}
      <Dialog open={!!confirmRemove} onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Remove <span className="font-medium">{confirmRemove?.email}</span> from{" "}
              <span className="font-medium">{workspace.name}</span>? They will lose access immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)} disabled={removing}>Cancel</Button>
            <Button variant="destructive" onClick={removeMember} disabled={removing}>
              {removing ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminWorkspacesPage() {
  const { user } = useAuthContext();
  const router = useRouter();

  const [workspaces, setWorkspaces] = React.useState<AdminWorkspace[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<AdminWorkspace | null>(null);

  React.useEffect(() => {
    if (user && !user.isAdmin) router.replace("/");
  }, [user, router]);

  React.useEffect(() => {
    if (!user?.isAdmin) return;
    setLoading(true);
    adminApi.listWorkspaces()
      .then(setWorkspaces)
      .catch(() => toast.error("Failed to load workspaces"))
      .finally(() => setLoading(false));
  }, [user]);

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(
      (ws) => ws.name.toLowerCase().includes(q) || ws.slug.toLowerCase().includes(q)
    );
  }, [workspaces, search]);

  return (
    <div className="flex flex-col gap-0 h-[calc(100vh-8rem)]">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Loading…" : `${workspaces.length} team workspace${workspaces.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
        {/* Left: workspace list */}
        <div className={cn(
          "flex flex-col rounded-xl border bg-card overflow-hidden transition-all duration-300",
          selected ? "w-80 shrink-0" : "flex-1"
        )}>
          {/* Search */}
          <div className="border-b px-4 py-3">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search workspaces…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2">
                    <Skeleton className="size-8 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-12" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <Building2 className="size-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {search ? "No workspaces match your search" : "No workspaces yet"}
                </p>
              </div>
            ) : (
              <motion.div variants={listVariants} initial="hidden" animate="show">
                {filtered.map((ws) => (
                  <motion.button
                    key={ws.uuid}
                    variants={itemVariant}
                    onClick={() => setSelected(ws)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 border-b last:border-0",
                      selected?.uuid === ws.uuid && "bg-muted"
                    )}
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold text-sm">
                      {ws.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{ws.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{ws.slug}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {ws.member_count} {ws.member_count === 1 ? "member" : "members"}
                      </span>
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    </div>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </div>
        </div>

        {/* Right: member panel */}
        <AnimatePresence>
          {selected && (
            <motion.div
              key={selected.uuid}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
              className="flex-1 rounded-xl border bg-card overflow-hidden"
            >
              <MemberPanel
                workspace={selected}
                onClose={() => setSelected(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state when nothing selected (large screens) */}
        {!selected && !loading && filtered.length > 0 && (
          <div className="hidden lg:flex flex-1 items-center justify-center rounded-xl border border-dashed bg-muted/20">
            <div className="text-center">
              <Users className="size-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Select a workspace to manage members</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
