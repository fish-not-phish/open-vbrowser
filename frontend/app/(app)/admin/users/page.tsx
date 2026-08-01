"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/store/AuthContext";
import { adminApi, type AdminUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import {
  Check, CheckCircle2, Copy, KeyRound, Loader2, MoreHorizontalIcon,
  SearchIcon, ShieldCheck, ShieldOff, Trash, UserCheck, UserPlus, UserX, X, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(u: AdminUser) {
  if (u.first_name || u.last_name)
    return `${u.first_name?.[0] ?? ""}${u.last_name?.[0] ?? ""}`.toUpperCase();
  return u.email.slice(0, 2).toUpperCase();
}

function isStale(lastLogin: string | null): boolean {
  if (!lastLogin) return false;
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return new Date(lastLogin).getTime() < cutoff;
}

function formatLastLogin(lastLogin: string | null): string {
  if (!lastLogin) return "Never logged in";
  const diff = Date.now() - new Date(lastLogin).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "Logged in just now";
  if (mins < 60) return `Logged in ${mins}m ago`;
  if (hours < 24) return `Logged in ${hours}h ago`;
  if (days < 30) return `Logged in ${days}d ago`;
  const date = new Date(lastLogin);
  return `Last login ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function PasswordDisplay({ password }: { password: string }) {
  const [copied, setCopied] = React.useState(false);
  function copy() {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 font-mono text-sm">
      <span className="flex-1 select-all">{password}</span>
      <button onClick={copy} className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
        {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

// ─── Animation variants ───────────────────────────────────────────────────────

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const rowVariant = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

// ─── Email availability hook ──────────────────────────────────────────────────

type EmailStatus = "idle" | "checking" | "available" | "taken" | "invalid";

function useEmailCheck(email: string, enabled: boolean): EmailStatus {
  const [status, setStatus] = React.useState<EmailStatus>("idle");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!enabled || !email) {
      setStatus("idle");
      return;
    }

    // Basic format check before hitting the server
    const isValidFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!isValidFormat) {
      setStatus("invalid");
      return;
    }

    setStatus("checking");
    timerRef.current = setTimeout(async () => {
      try {
        const { available } = await adminApi.checkEmail(email);
        setStatus(available ? "available" : "taken");
      } catch {
        setStatus("idle");
      }
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [email, enabled]);

  return status;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const { user } = useAuthContext();
  const router = useRouter();

  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");

  // Create dialog
  const [creating, setCreating] = React.useState(false);
  const [newUser, setNewUser] = React.useState({
    email: "", first_name: "", last_name: "", is_admin: false,
  });
  const [saving, setSaving] = React.useState(false);
  const [createdPassword, setCreatedPassword] = React.useState<string | null>(null);

  // Reset password dialog
  const [resettingUser, setResettingUser] = React.useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = React.useState<string | null>(null);

  // Delete account dialog
  const [deletingUser, setDeletingUser] = React.useState<AdminUser | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Email availability — only run while the dialog is open and not yet succeeded
  const emailStatus = useEmailCheck(newUser.email, creating && !createdPassword);

  React.useEffect(() => {
    if (user.isLoggedIn === false) { router.replace("/"); return; }
    if (user.isLoggedIn && !user.isAdmin) { router.replace("/"); return; }
    if (user.isLoggedIn && user.isAdmin) load();
  }, [user.isLoggedIn, user.isAdmin]);

  async function load() {
    try {
      setUsers(await adminApi.listUsers());
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function createUser() {
    if (!user.csrfToken || emailStatus !== "available") return;
    setSaving(true);
    try {
      const created = await adminApi.createUser(newUser, user.csrfToken);
      setUsers((prev) => [...prev, created]);
      setCreatedPassword(created.generated_password ?? null);
      setNewUser({ email: "", first_name: "", last_name: "", is_admin: false });
    } catch (e: any) {
      const msg = e?.message?.includes("409") ? "Email already in use" : "Failed to create user";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function toggleAdmin(u: AdminUser) {
    if (!user.csrfToken) return;
    try {
      const updated = await adminApi.updateUser(u.id, { is_admin: !u.is_admin }, user.csrfToken);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      toast.success(`${updated.email} is ${updated.is_admin ? "now an admin" : "no longer an admin"}`);
    } catch {
      toast.error("Failed to update user");
    }
  }

  async function toggleActive(u: AdminUser) {
    if (!user.csrfToken) return;
    try {
      const updated = await adminApi.updateUser(u.id, { is_active: !u.is_active }, user.csrfToken);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      toast.success(`${updated.email} ${updated.is_active ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to update user");
    }
  }

  async function handleDelete(u: AdminUser) {
    if (!user.csrfToken) return;
    setDeleting(true);
    try {
      await adminApi.deleteUser(u.id, user.csrfToken);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setDeletingUser(null);
      toast.success(`${u.email} deleted`);
    } catch (e) {
      // Feedback from the backend — e.g. "owns: X. Remove them as an owner..."
      const msg = e instanceof Error ? e.message : "";
      const status = parseInt(msg.match(/API (\d+)/)?.[1] ?? "0", 10);
      if (status === 409) {
        let detail = msg.replace(/^API 409:\s*/, "").trim();
        try { detail = JSON.parse(detail).detail ?? detail; } catch {}
        toast.error(detail || "This user owns a workspace and cannot be deleted yet.");
      } else {
        toast.error("Failed to delete user");
      }
    } finally {
      setDeleting(false);
    }
  }

  async function doResetPassword(u: AdminUser) {
    if (!user.csrfToken) return;
    setResettingUser(u);
    try {
      const res = await adminApi.resetPassword(u.id, user.csrfToken);
      setResetPassword(res.generated_password);
    } catch {
      toast.error("Failed to reset password");
      setResettingUser(null);
    }
  }

  const filtered = React.useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
    );
  }, [users, search]);

  // Can submit only when email is confirmed available
  const canCreate = emailStatus === "available" && !saving;

  if (!user.isLoggedIn || !user.isAdmin) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage user accounts and permissions.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <UserPlus className="size-3.5" /> New User
        </Button>
      </motion.div>

      {/* Card */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="overflow-hidden rounded-xl border bg-card"
      >
        {/* Search row */}
        <motion.div variants={rowVariant} className="flex items-center gap-2 border-b px-4 py-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 text-sm"
          />
          <AnimatePresence>
            {search && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Stats row */}
        <motion.div variants={rowVariant} className="flex items-center gap-3 border-b px-4 py-2">
          <span className="text-muted-foreground text-xs">
            <span className="tabular-nums">{users.filter((u) => u.is_active).length}</span> active
          </span>
          {users.filter((u) => !u.is_active).length > 0 && (
            <>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-muted-foreground text-xs">
                <span className="tabular-nums">{users.filter((u) => !u.is_active).length}</span> disabled
              </span>
            </>
          )}
        </motion.div>

        {/* Users list */}
        <div>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-44" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-sm text-muted-foreground">No users found</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filtered.map((u, index) => {
                const isSelf = u.id === (user as any).id;
                const isLast = index === filtered.length - 1;
                return (
                  <motion.div
                    key={u.id}
                    variants={rowVariant}
                    layout
                    exit={{ opacity: 0, height: 0 }}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3",
                      !isLast && "border-b",
                      !u.is_active && "opacity-60"
                    )}
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs">{initials(u)}</AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-sm">{u.email}</span>
                        {isSelf && (
                          <Badge variant="secondary" className="font-normal text-xs">You</Badge>
                        )}
                        {u.is_admin && (
                          <Badge variant="default" className="font-normal text-xs gap-1">
                            <ShieldCheck className="size-2.5" /> Admin
                          </Badge>
                        )}
                        {!u.is_active && (
                          <Badge variant="destructive" className="font-normal text-xs">Disabled</Badge>
                        )}
                        {!u.last_login && (
                          <Badge variant="outline" className="font-normal text-xs text-muted-foreground">
                            Never logged in
                          </Badge>
                        )}
                        {isStale(u.last_login) && (
                          <Badge variant="secondary" className="font-normal text-xs">
                            Stale
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-muted-foreground text-xs">
                        {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.username}
                        {(u.first_name || u.last_name || u.username) && (
                          <span className="text-muted-foreground/70"> · {formatLastLogin(u.last_login)}</span>
                        )}
                        {!(u.first_name || u.last_name || u.username) && (
                          <span>{formatLastLogin(u.last_login)}</span>
                        )}
                      </p>
                    </div>

                    {!isSelf && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7 shrink-0">
                            <MoreHorizontalIcon className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem className="gap-2" onClick={() => toggleAdmin(u)}>
                            {u.is_admin
                              ? <><ShieldOff className="size-3.5" />Remove admin</>
                              : <><ShieldCheck className="size-3.5" />Make admin</>}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => doResetPassword(u)}>
                            <KeyRound className="size-3.5" /> Reset password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="gap-2 text-destructive focus:text-destructive"
                            onClick={() => toggleActive(u)}
                          >
                            {u.is_active
                              ? <><UserX className="size-3.5" />Disable account</>
                              : <><UserCheck className="size-3.5" />Enable account</>}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2 text-destructive focus:text-destructive"
                            onClick={() => setDeletingUser(u)}
                          >
                            <Trash className="size-3.5" /> Delete account
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}

                    {isSelf && <div className="size-7" />}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </motion.div>

      {/* ── Create user dialog ──────────────────────────────────────────── */}
      <Dialog
        open={creating}
        onOpenChange={(o) => {
          setCreating(o);
          if (!o) {
            setCreatedPassword(null);
            setNewUser({ email: "", first_name: "", last_name: "", is_admin: false });
          }
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>

          {createdPassword ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                User created successfully. Share this temporary password — it won't be shown again.
              </p>
              <PasswordDisplay password={createdPassword} />
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>First name</Label>
                  <Input
                    placeholder="Jane"
                    value={newUser.first_name}
                    onChange={(e) => setNewUser((p) => ({ ...p, first_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Last name</Label>
                  <Input
                    placeholder="Smith"
                    value={newUser.last_name}
                    onChange={(e) => setNewUser((p) => ({ ...p, last_name: e.target.value }))}
                  />
                </div>
              </div>

              {/* Email with availability indicator */}
              <div className="space-y-1.5">
                <Label>Email</Label>
                <div className="relative">
                  <Input
                    type="email"
                    placeholder="jane@example.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                    className={cn(
                      "pr-9",
                      emailStatus === "taken" && "border-destructive focus-visible:ring-destructive/20",
                      emailStatus === "available" && "border-green-500 focus-visible:ring-green-500/20"
                    )}
                  />
                  {/* Status icon */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <AnimatePresence mode="wait">
                      {emailStatus === "checking" && (
                        <motion.span
                          key="checking"
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        >
                          <Loader2 className="size-3.5 text-muted-foreground animate-spin" />
                        </motion.span>
                      )}
                      {emailStatus === "available" && (
                        <motion.span
                          key="available"
                          initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        >
                          <CheckCircle2 className="size-3.5 text-green-500" />
                        </motion.span>
                      )}
                      {emailStatus === "taken" && (
                        <motion.span
                          key="taken"
                          initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        >
                          <XCircle className="size-3.5 text-destructive" />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                {/* Hint text */}
                <AnimatePresence>
                  {emailStatus === "taken" && (
                    <motion.p
                      key="taken-msg"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="text-xs text-destructive"
                    >
                      An account with this email already exists.
                    </motion.p>
                  )}
                  {emailStatus === "available" && (
                    <motion.p
                      key="avail-msg"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="text-xs text-green-600 dark:text-green-400"
                    >
                      Email is available.
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Admin toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Admin access</p>
                  <p className="text-xs text-muted-foreground">Grant full site administration privileges.</p>
                </div>
                <Switch
                  checked={newUser.is_admin}
                  onCheckedChange={(v) => setNewUser((p) => ({ ...p, is_admin: v }))}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                A username will be generated automatically. A random password will be shown after creation.
              </p>
            </div>
          )}

          <DialogFooter>
            {createdPassword ? (
              <Button onClick={() => { setCreating(false); setCreatedPassword(null); }}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
                <Button onClick={createUser} disabled={!canCreate}>
                  {saving ? "Creating…" : "Create User"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset password dialog ───────────────────────────────────────── */}
      <Dialog
        open={!!resettingUser}
        onOpenChange={(o) => { if (!o) { setResettingUser(null); setResetPassword(null); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Password reset for <strong>{resettingUser?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          {resetPassword ? (
            <div className="py-2 space-y-2">
              <p className="text-sm text-muted-foreground">
                Share this temporary password — it won't be shown again.
              </p>
              <PasswordDisplay password={resetPassword} />
            </div>
          ) : (
            <div className="py-4 flex items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => { setResettingUser(null); setResetPassword(null); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete account dialog ─────────────────────────────────────── */}
      <Dialog open={!!deletingUser} onOpenChange={(o) => { if (!o) setDeletingUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Delete <strong>{deletingUser?.email}</strong>? This permanently removes the
              account and all of its data and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingUser(null)} disabled={deleting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletingUser && handleDelete(deletingUser)}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
