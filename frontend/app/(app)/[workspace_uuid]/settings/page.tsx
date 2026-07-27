"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";

import { useAuthContext } from "@/store/AuthContext";
import { useWorkspace } from "@/store/WorkspaceContext";
import {
  workspacesApi, browsersApi, adminApi,
  type Workspace, type Browser, type WorkspaceMember, type SiteSettings,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity, CheckCircle2, Crown, HardDrive, ImageIcon, Loader2, Lock, LogOut,
  RotateCcw, Save, Trash2, TrashIcon,
  UploadCloudIcon, UserMinusIcon, UserPlus, UsersIcon, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { LimitSlider } from "@/components/ui/limit-slider";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function memberInitials(email: string) {
  const [local] = email.split("@");
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function FieldRow({
  label, description, children,
}: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-8">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="shrink-0 w-64">{children}</div>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col space-y-1">
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

// ─── Member search combobox ───────────────────────────────────────────────────

type UserResult = { id: number; email: string; first_name: string; last_name: string };

function MemberSearch({
  workspaceUuid,
  isOwner,
  onAdd,
}: {
  workspaceUuid: string;
  isOwner: boolean;
  onAdd: (email: string, role: string) => Promise<void>;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<UserResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [selected, setSelected] = React.useState<UserResult | null>(null);
  const [role, setRole] = React.useState("member");
  const [adding, setAdding] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  React.useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim() || selected) {
      setResults([]);
      setOpen(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await workspacesApi.searchUsers(workspaceUuid, query.trim());
        setResults(res);
        setOpen(res.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, workspaceUuid, selected]);

  // Close dropdown on outside click
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectUser(u: UserResult) {
    setSelected(u);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function clear() {
    setSelected(null);
    setQuery("");
    setRole("member");
    setResults([]);
    setOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function submit() {
    if (!selected) return;
    setAdding(true);
    try {
      await onAdd(selected.email, role);
      setSelected(null);
      setQuery("");
      setRole("member");
    } finally {
      setAdding(false);
    }
  }

  const displayName = selected
    ? [selected.first_name, selected.last_name].filter(Boolean).join(" ") || selected.email
    : null;

  return (
    <div className="flex items-center gap-2 border-b px-4 py-3">
      {/* Search / selected chip */}
      <div ref={containerRef} className="relative flex-1 min-w-0">
        {selected ? (
          // Selected user chip
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1 text-sm w-full">
            <Avatar className="size-5 shrink-0">
              <AvatarFallback className="text-[10px]">
                {(selected.first_name?.[0] ?? selected.email[0]).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <span className="font-medium truncate block">{displayName}</span>
            </div>
            <span className="text-xs text-muted-foreground truncate">{selected.email}</span>
            <button onClick={clear} className="shrink-0 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          // Search input
          <div className="relative flex items-center">
            {searching
              ? <Loader2 className="absolute left-0 size-4 shrink-0 text-muted-foreground animate-spin" />
              : <UserPlus className="absolute left-0 size-4 shrink-0 text-muted-foreground" />
            }
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="h-8 w-full bg-transparent pl-6 pr-2 text-sm outline-none placeholder:text-muted-foreground"
              onFocus={() => results.length > 0 && setOpen(true)}
            />
          </div>
        )}

        {/* Dropdown */}
        <AnimatePresence>
          {open && results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 top-full mt-1 z-50 w-full min-w-64 rounded-xl border bg-popover shadow-lg overflow-hidden"
            >
              {results.map((u) => {
                const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
                return (
                  <button
                    key={u.id}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                    onMouseDown={(e) => { e.preventDefault(); selectUser(u); }}
                  >
                    <Avatar className="size-7 shrink-0">
                      <AvatarFallback className="text-xs">
                        {(u.first_name?.[0] ?? u.email[0]).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      {name && <p className="text-sm font-medium truncate">{name}</p>}
                      <p className={cn("truncate text-muted-foreground", name ? "text-xs" : "text-sm")}>{u.email}</p>
                    </div>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Role select */}
      <Select value={role} onValueChange={setRole}>
        <SelectTrigger className="h-7 w-26 text-xs shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="member">Member</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
          {isOwner && <SelectItem value="owner">Owner</SelectItem>}
        </SelectContent>
      </Select>

      {/* Add button */}
      <Button
        variant="outline" size="sm"
        className="h-7 gap-1 shrink-0 text-xs"
        disabled={!selected || adding}
        onClick={submit}
      >
        {adding ? <Loader2 className="size-3 animate-spin" /> : <UserPlus className="size-3" />}
        {adding ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkspaceSettingsPage() {
  const { workspace_uuid } = useParams<{ workspace_uuid: string }>();
  const { user } = useAuthContext();
  const { activeWorkspace, setActiveWorkspace } = useWorkspace();
  const router = useRouter();

  // ── Workspace state ──────────────────────────────────────────────────────
  const [ws, setWs] = React.useState<Workspace | null>(null);
  const [original, setOriginal] = React.useState<Workspace | null>(null);
  const [browsers, setBrowsers] = React.useState<Browser[]>([]);
  const [siteSettings, setSiteSettings] = React.useState<SiteSettings | null>(null);
  const [allowedSlugs, setAllowedSlugs] = React.useState<string[]>([]);
  const [originalAllowed, setOriginalAllowed] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  // ── Logo state ───────────────────────────────────────────────────────────
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);

  // ── Members state ────────────────────────────────────────────────────────
  const [members, setMembers] = React.useState<WorkspaceMember[]>([]);
  const [membersLoading, setMembersLoading] = React.useState(true);

  const [confirmRemove, setConfirmRemove] = React.useState<WorkspaceMember | null>(null);
  const [removing, setRemoving] = React.useState(false);

  // ── Danger zone dialogs ──────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = React.useState("");
  const [confirmLeave, setConfirmLeave] = React.useState(false);

  const initialised = React.useRef(false);

  const isOwner = ws?.role === "owner";
  const isAdmin = ws?.role === "admin";
  const canEdit = isOwner || user.isAdmin;
  const canManageAccess = user.isAdmin || isOwner || isAdmin;
  const canManageMembers = canManageAccess;

  // ── Effects ───────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (user.isLoggedIn) load();
  }, [user.isLoggedIn, workspace_uuid]);

  // When the active workspace switches (via sidebar switcher), navigate to that workspace's settings
  React.useEffect(() => {
    if (!initialised.current) return;
    if (activeWorkspace && activeWorkspace.uuid !== workspace_uuid) {
      router.push(`/${activeWorkspace.uuid}/settings`);
    }
  }, [activeWorkspace]);

  // Logo object URL cleanup
  React.useEffect(() => {
    if (!logoFile) return;
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  // ── Data loading ──────────────────────────────────────────────────────────

  async function load() {
    try {
      const [wsData, allBrowsers, site] = await Promise.all([
        workspacesApi.get(workspace_uuid),
        browsersApi.list(),
        adminApi.getSiteSettings().catch(() => null),
      ]);
      setWs(wsData); setOriginal(wsData);
      setActiveWorkspace(wsData);
      initialised.current = true;
      setBrowsers(allBrowsers);
      setSiteSettings(site);

      // Clamp workspace allowed slugs to the global allowlist so stale entries
      // from before a restriction was applied don't linger in the UI.
      const globalAllowed = site?.global_allowed_browser_slugs ?? [];
      const clamp = (slugs: string[]) =>
        globalAllowed.length > 0 ? slugs.filter((s) => globalAllowed.includes(s)) : slugs;
      const clamped = clamp(wsData.allowed_browser_slugs);

      setAllowedSlugs(clamped);
      setOriginalAllowed(clamped);

      const membersData = await workspacesApi.listMembers(workspace_uuid);
      setMembers(membersData);
    } catch {
      toast.error("Failed to load workspace");
    } finally {
      setLoading(false);
      setMembersLoading(false);
    }
  }

  // ── General settings mutations ────────────────────────────────────────────

  function update<K extends keyof Workspace>(key: K, value: Workspace[K]) {
    setWs((prev) => prev ? { ...prev, [key]: value } : prev);
    setSaved(false);
  }

  function toggleBrowser(bslug: string) {
    setAllowedSlugs((prev) =>
      prev.includes(bslug) ? prev.filter((s) => s !== bslug) : [...prev, bslug]
    );
    setSaved(false);
  }

  async function save() {
    if (!ws || !user.csrfToken) return;
    setSaving(true);
    try {
      const updated = await workspacesApi.update(
          ws.uuid,
          {
            name: ws.name,
            max_concurrent_sessions_per_member: ws.max_concurrent_sessions_per_member,
            idle_timeout_minutes: ws.idle_timeout_minutes,
            max_session_duration_hours: ws.max_session_duration_hours,
            enable_network_logging: ws.enable_network_logging,
            enable_file_protection: ws.enable_file_protection,
            enable_persistent_storage: ws.enable_persistent_storage,
          },
          user.csrfToken
        );
      setWs(updated); setOriginal(updated);

      if (canManageAccess) {
        await adminApi.setWorkspaceBrowsers(ws.uuid, allowedSlugs, user.csrfToken);
        setOriginalAllowed(allowedSlugs);
      }

      setSaved(true);
      toast.success("Settings saved");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  // ── Logo mutations ────────────────────────────────────────────────────────

  function onLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (f.size > 2 * 1024 * 1024) { toast.error("Image must be smaller than 2 MB"); return; }
    setLogoFile(f);
  }

  async function uploadLogo() {
    if (!ws || !user.csrfToken || !logoFile) return;
    setUploadingLogo(true);
    try {
      const updated = await workspacesApi.uploadLogo(ws.uuid, logoFile, user.csrfToken);
      setWs(updated); setOriginal(updated);
      setLogoFile(null); setLogoPreview(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
      toast.success("Logo updated");
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function removeLogo() {
    if (!ws || !user.csrfToken) return;
    try {
      await workspacesApi.deleteLogo(ws.uuid, user.csrfToken);
      setWs((prev) => prev ? { ...prev, logo_url: null } : prev);
      setOriginal((prev) => prev ? { ...prev, logo_url: null } : prev);
      setLogoFile(null); setLogoPreview(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
      toast.success("Logo removed");
    } catch {
      toast.error("Failed to remove logo");
    }
  }

  // ── Danger zone ───────────────────────────────────────────────────────────

  async function deleteWorkspace() {
    if (!ws || !user.csrfToken) return;
    try {
      await workspacesApi.delete(ws.uuid, user.csrfToken);
      toast.success("Workspace deleted");
      router.push("/");
    } catch {
      toast.error("Failed to delete workspace");
    }
  }

  async function leaveWorkspace() {
    if (!ws || !user.csrfToken) return;
    try {
      await workspacesApi.leaveWorkspace(ws.uuid, user.csrfToken);
      toast.success("You have left the workspace");
      router.push("/");
    } catch {
      toast.error("Failed to leave workspace");
    }
  }

  // ── Members mutations ─────────────────────────────────────────────────────

  async function sendInvite(email: string, role: string) {
    if (!ws || !user.csrfToken) return;
    const m = await workspacesApi.inviteMember(
      ws.uuid, { email, role }, user.csrfToken
    );
    setMembers((prev) => [...prev, m]);
    toast.success("Member added");
  }

  async function changeRole(member: WorkspaceMember, newRole: string) {
    if (!ws || !user.csrfToken) return;
    const transferringOwnership = newRole === "owner";
    try {
      const updated = await workspacesApi.changeMemberRole(
        ws.uuid, member.user_id, newRole, user.csrfToken
      );
      if (transferringOwnership) {
        // The server demoted the previous owner to admin — reload everything
        // so the caller's own role and the full member list are accurate.
        await load();
        toast.success("Ownership transferred");
      } else {
        setMembers((prev) => prev.map((m) => m.user_id === member.user_id ? updated : m));
        toast.success("Role updated");
      }
    } catch {
      toast.error("Failed to update role");
    }
  }

  async function removeMember(member: WorkspaceMember) {
    if (!ws || !user.csrfToken) return;
    setRemoving(true);
    try {
      await workspacesApi.removeMember(ws.uuid, member.user_id, user.csrfToken);
      setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
      setConfirmRemove(null);
      toast.success("Member removed");
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setRemoving(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const isDirty =
    JSON.stringify(ws) !== JSON.stringify(original) ||
    JSON.stringify([...allowedSlugs].sort()) !== JSON.stringify([...originalAllowed].sort());

  const currentLogoSrc = logoPreview ?? ws?.logo_url ?? null;

  if (!user.isLoggedIn) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {ws?.name ?? "Workspace Settings"}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage your workspace configuration and members.
          </p>
        </div>
      </motion.div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : ws ? (
        <Tabs defaultValue="general">
          {/* Tab bar */}
          <TabsList className="mb-6">
            {[
              { value: "general", label: "General" },
              ...(!ws.is_personal ? [{ value: "members", label: "Members" }] : []),
            ].map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── General tab ────────────────────────────────────────────── */}
          <TabsContent value="general" className="space-y-10 mt-0">

            {/* Save/Reset bar */}
            {isDirty && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-end gap-2 rounded-xl border bg-card px-4 py-3"
              >
                <Button
                  variant="outline" size="sm"
                  onClick={() => { setWs(original); setAllowedSlugs(originalAllowed); setSaved(false); }}
                  className="gap-1.5"
                >
                  <RotateCcw className="size-3.5" /> Reset
                </Button>
                <Button
                  size="sm" onClick={save}
                  disabled={!isDirty || saving || !canEdit}
                  className="gap-1.5 min-w-[90px]"
                >
                  {saved
                    ? <><CheckCircle2 className="size-3.5" />Saved</>
                    : <><Save className="size-3.5" />{saving ? "Saving…" : "Save"}</>}
                </Button>
              </motion.div>
            )}

            {/* Workspace details */}
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
              <SectionHeader title="Workspace" description="Basic workspace information." />
              <div className="space-y-6 lg:col-span-2">
                <FieldRow label="Workspace name">
                  <Input
                    value={ws.name}
                    onChange={(e) => update("name", e.target.value)}
                    disabled={!canEdit}
                    className="h-9 text-sm"
                  />
                </FieldRow>

                {/* Logo */}
                <div className="flex items-start justify-between gap-8">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Workspace logo</p>
                    <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG or WebP, up to 2 MB.</p>
                  </div>
                  <div className="shrink-0 w-64 space-y-2">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => canEdit && logoInputRef.current?.click()}
                        className={cn(
                          "flex size-14 items-center justify-center overflow-hidden rounded-xl border border-dashed transition-opacity",
                          canEdit ? "cursor-pointer hover:opacity-80" : "cursor-default opacity-60"
                        )}
                      >
                        {currentLogoSrc ? (
                          <img src={currentLogoSrc} alt="logo" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="size-5 text-muted-foreground" />
                        )}
                      </button>
                      {canEdit && (
                        <div className="flex flex-col gap-1.5">
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={onLogoSelect}
                          />
                          {logoFile ? (
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                              onClick={uploadLogo} disabled={uploadingLogo}>
                              <UploadCloudIcon className="size-3" />
                              {uploadingLogo ? "Uploading…" : "Save logo"}
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                              onClick={() => logoInputRef.current?.click()}>
                              <UploadCloudIcon className="size-3" />
                              Upload
                            </Button>
                          )}
                          {(ws.logo_url || logoFile) && (
                            <Button size="sm" variant="ghost"
                              className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                              onClick={() => {
                                if (logoFile) {
                                  setLogoFile(null); setLogoPreview(null);
                                  if (logoInputRef.current) logoInputRef.current.value = "";
                                } else {
                                  removeLogo();
                                }
                              }}>
                              <TrashIcon className="size-3" />
                              Remove
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Session limits — hidden for personal workspaces (controlled by site admin) */}
            {!ws.is_personal && (
              <>
                <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
                  <SectionHeader
                    title="Session Limits"
                    description="Per-workspace overrides. All the way right = fall back to site default."
                  />
                  <div className="space-y-5 lg:col-span-2">
                    <FieldRow label="Max concurrent sessions" description="Max active sessions per member at once.">
                      <LimitSlider
                        value={ws.max_concurrent_sessions_per_member ?? null}
                        onChange={(v) => update("max_concurrent_sessions_per_member", v)}
                        min={1} max={10} step={1} unit="sessions"
                        allowUnlimited unlimitedLabel="Site default"
                        disabled={!canEdit}
                      />
                    </FieldRow>
                    <Separator />
                    <FieldRow label="Idle timeout" description="Minutes before an idle session is closed.">
                      <LimitSlider
                        value={ws.idle_timeout_minutes ?? null}
                        onChange={(v) => update("idle_timeout_minutes", v)}
                        min={1} max={60} step={1} unit="min"
                        allowUnlimited unlimitedLabel="Site default"
                        disabled={!canEdit}
                      />
                    </FieldRow>
                    <Separator />
                    <FieldRow label="Max session duration" description="Hard cap in hours.">
                      <LimitSlider
                        value={ws.max_session_duration_hours ?? null}
                        onChange={(v) => update("max_session_duration_hours" as any, v)}
                        min={1} max={24} step={1} unit="hr"
                        unlimitedLabel="No limit"
                        disabled={!canEdit}
                      />
                    </FieldRow>
                  </div>
                </div>

                <Separator />
              </>
            )}

            {/* Application access — hidden for personal workspaces (controlled by site admin) */}
            {!ws.is_personal && (() => {
              const globalAllowed = siteSettings?.global_allowed_browser_slugs ?? [];

              // Always restrict visible browsers to the global allowlist.
              // If no global list is set, all browsers are available.
              const visibleBrowsers = globalAllowed.length > 0
                ? browsers.filter((b) => globalAllowed.includes(b.slug))
                : browsers;

              const descriptionNote = globalAllowed.length > 0
                ? "Only browsers approved by the site admin are available."
                : "Restrict which applications members can launch. Select none to allow all.";

              return (
                <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
                  <SectionHeader
                    title="Application Access"
                    description={descriptionNote}
                  />
                  <div className="space-y-3 lg:col-span-2">
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                      {visibleBrowsers.map((b) => {
                        const selected = allowedSlugs.includes(b.slug);
                        return (
                          <button
                            key={b.slug}
                            disabled={!canManageAccess}
                            onClick={() => toggleBrowser(b.slug)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-all",
                              selected ? "border-primary bg-primary/5" : "border-border bg-card opacity-50",
                              canManageAccess && "hover:opacity-100 hover:border-primary/60 cursor-pointer",
                              !canManageAccess && "cursor-default"
                            )}
                          >
                            <div className="relative size-8">
                              <Image
                                src={`/images/browsers/${b.icon_filename}`}
                                alt={b.display_name} fill className="object-contain"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = "/images/browsers/browser_transparent.png";
                                }}
                              />
                            </div>
                            <span className="text-[10px] font-medium leading-tight line-clamp-1">
                              {b.display_name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {allowedSlugs.length === 0
                        ? "All available applications are accessible in this workspace."
                        : `${allowedSlugs.length} application${allowedSlugs.length !== 1 ? "s" : ""} selected.`}
                    </p>
                    {!canManageAccess && (
                      <p className="text-xs text-muted-foreground italic">
                        Only workspace admins can modify application access.
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            {!ws.is_personal && <Separator />}

            {/* Session Features — only shown for team workspaces when at least one is globally enabled */}
            {!ws.is_personal && (siteSettings?.enable_network_logging || siteSettings?.enable_file_protection || siteSettings?.enable_persistent_storage) && (() => {
              const networkEnabled = !!siteSettings?.enable_network_logging;
              const fileProtEnabled = !!siteSettings?.enable_file_protection;
              const storageEnabled = !!siteSettings?.enable_persistent_storage;
              const featuresShown = [networkEnabled, fileProtEnabled, storageEnabled].filter(Boolean).length;
              return (
                <>
                  <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
                    <SectionHeader
                      title="Session Features"
                      description="Enable advanced session capabilities for members of this workspace."
                    />
                    <div className="space-y-5 lg:col-span-2">
                      {networkEnabled && (
                        <FieldRow
                          label="Network logging"
                          description="Allow members to capture network traffic logs during sessions."
                        >
                          <div className="flex items-center gap-2">
                            <Activity className={cn(
                              "size-4 transition-colors",
                              ws.enable_network_logging ? "text-blue-500" : "text-muted-foreground"
                            )} />
                            <Switch
                              checked={ws.enable_network_logging}
                              onCheckedChange={(v) => update("enable_network_logging", v)}
                              disabled={!canEdit}
                            />
                          </div>
                        </FieldRow>
                      )}
                      {networkEnabled && (fileProtEnabled || storageEnabled) && <Separator />}
                      {fileProtEnabled && (
                        <FieldRow
                          label="File protection"
                          description="Allow members to use encrypted file protection for downloaded files."
                        >
                          <div className="flex items-center gap-2">
                            <Lock className={cn(
                              "size-4 transition-colors",
                              ws.enable_file_protection ? "text-green-500" : "text-muted-foreground"
                            )} />
                            <Switch
                              checked={ws.enable_file_protection}
                              onCheckedChange={(v) => update("enable_file_protection", v)}
                              disabled={!canEdit}
                            />
                          </div>
                        </FieldRow>
                      )}
                      {fileProtEnabled && storageEnabled && <Separator />}
                      {storageEnabled && (
                        <FieldRow
                          label="Persistent storage"
                          description="Mount per-workspace S3 storage at /config/Downloads. Files persist across sessions."
                        >
                          <div className="flex items-center gap-2">
                            <HardDrive className={cn(
                              "size-4 transition-colors",
                              ws.enable_persistent_storage ? "text-purple-500" : "text-muted-foreground"
                            )} />
                            <Switch
                              checked={ws.enable_persistent_storage}
                              onCheckedChange={(v) => update("enable_persistent_storage", v)}
                              disabled={!canEdit}
                            />
                          </div>
                        </FieldRow>
                      )}
                      {!canEdit && (
                        <p className="text-xs text-muted-foreground italic">
                          Only workspace owners can modify session features.
                        </p>
                      )}
                    </div>
                  </div>
                  <Separator />
                </>
              );
            })()}

            {/* Danger zone */}
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
              <SectionHeader title="Danger zone" description="Irreversible actions for this workspace." />
              <div className="space-y-4 lg:col-span-2">
                {/* Leave — always visible; disabled for owners */}
                <div className={cn(
                  "rounded-xl border bg-card p-4 flex items-start justify-between gap-4",
                  isOwner && "opacity-60"
                )}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Leave workspace</p>
                    <p className="text-muted-foreground text-sm">
                      {isOwner
                        ? "Assign another member as owner from the Members tab, then you can leave."
                        : "Revoke your own access. If you are the last member, the workspace will be deleted."}
                    </p>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="shrink-0">
                          <Button
                            variant="outline" size="sm"
                            disabled={isOwner}
                            className="border-destructive text-destructive hover:bg-destructive/10 disabled:pointer-events-none"
                            onClick={() => setConfirmLeave(true)}
                          >
                            <LogOut className="size-3.5" /> Leave
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {isOwner && (
                        <TooltipContent side="left">
                          Assign a new owner in the Members tab first.
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Delete — shown to owners and site admins */}
                {canEdit && (
                  <div className="rounded-xl border bg-card p-4 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Delete workspace</p>
                      <p className="text-muted-foreground text-sm">
                        Permanently delete this workspace and all its data. This cannot be undone.
                      </p>
                    </div>
                    <Button
                      variant="outline" size="sm"
                      className="shrink-0 border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  </div>
                )}


              </div>
            </div>
          </TabsContent>

          {/* ── Members tab ────────────────────────────────────────────── */}
          <TabsContent value="members" className="mt-0">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="overflow-hidden rounded-xl border bg-card"
            >
              {canManageMembers && ws && (
                <MemberSearch
                  workspaceUuid={ws.uuid}
                  isOwner={isOwner}
                  onAdd={sendInvite}
                />
              )}

              <div className="flex items-center gap-3 border-b px-4 py-2">
                <UsersIcon className="size-3 text-muted-foreground" />
                <span className="text-muted-foreground text-xs">
                  <span className="tabular-nums">{members.length}</span>{" "}
                  member{members.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div>
                {membersLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0">
                      <Skeleton className="size-8 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                      <Skeleton className="h-7 w-24 rounded-md" />
                    </div>
                  ))
                ) : members.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <UsersIcon className="size-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No members yet</p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {members.map((m, index) => {
                      const isSelf = m.user_id === (user as any).id;
                      const isLast = index === members.length - 1;
                      const canEditRow =
                        canManageMembers && !isSelf && !(isAdmin && m.role === "owner");

                      return (
                        <motion.div
                          key={m.user_id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, height: 0 }}
                          layout
                          className={`flex items-center gap-3 px-4 py-3 ${isLast ? "" : "border-b"}`}
                        >
                          <Avatar className="size-8">
                            <AvatarFallback className="text-xs">
                              {memberInitials(m.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-sm">{m.email}</span>
                              {isSelf && (
                                <Badge variant="secondary" className="font-normal text-xs">You</Badge>
                              )}
                              {m.role === "owner" && !isSelf && (
                                <Badge variant="secondary" className="font-normal text-xs gap-1">
                                  <Crown className="size-2.5" />Owner
                                </Badge>
                              )}
                            </div>
                            {m.username && m.username !== m.email && (
                              <p className="mt-0.5 truncate text-muted-foreground text-xs">{m.username}</p>
                            )}
                          </div>

                          {canEditRow ? (
                            <Select value={m.role} onValueChange={(v) => changeRole(m, v)}>
                              <SelectTrigger className="h-7 w-24 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="owner" disabled={!isOwner}>Owner</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="member">Member</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : !isSelf ? (
                            <span className="text-xs text-muted-foreground w-24 text-right capitalize">
                              {m.role}
                            </span>
                          ) : null}

                          {canEditRow && (
                            <Button
                              variant="ghost" size="sm"
                              className="h-6 px-2 text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmRemove(m)}
                            >
                              <UserMinusIcon className="size-3" />
                            </Button>
                          )}

                          {isSelf && <div className="w-6" />}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>
      ) : null}

      {/* Dialogs */}
      <Dialog open={confirmDelete} onOpenChange={(open) => { setConfirmDelete(open); if (!open) setDeleteConfirmName(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete workspace?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{ws?.name}</strong> and all its sessions, cases, and
              members. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <p className="text-sm text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">{ws?.name}</span> to confirm.
            </p>
            <Input
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={ws?.name}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmDelete(false); setDeleteConfirmName(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={deleteConfirmName !== ws?.name} onClick={deleteWorkspace}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave workspace?</DialogTitle>
            <DialogDescription>
              You will lose access to <strong>{ws?.name}</strong> immediately.
              {members.length <= 1 && " As the only member, the workspace will be deleted."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmLeave(false)}>Cancel</Button>
            <Button variant="destructive" onClick={leaveWorkspace}>Leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmRemove} onOpenChange={() => setConfirmRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>
              Remove <strong>{confirmRemove?.username || confirmRemove?.email}</strong> from this workspace?
              They will lose access immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>Cancel</Button>
            <Button
              variant="destructive" disabled={removing}
              onClick={() => confirmRemove && removeMember(confirmRemove)}
            >
              {removing ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
