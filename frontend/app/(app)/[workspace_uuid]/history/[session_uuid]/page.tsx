"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthContext } from "@/store/AuthContext";
import { useWorkspace } from "@/store/WorkspaceContext";
import {
  sessionsApi, casesApi,
  type SessionHistory, type Note, type TrafficEvent, type IOC, type Tag, type Case,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft, Activity, Clock, Zap, Tag as TagIcon, FolderOpen,
  StickyNote, Server, DollarSign, Wifi, WifiOff, Flag,
  ExternalLink, Plus, Monitor, X, Check, ChevronsUpDown, FolderPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
  ColorPicker,
  ColorPickerSelection,
  ColorPickerHue,
  ColorPickerEyeDropper,
  ColorPickerOutput,
  ColorPickerFormat,
} from "@/components/ui/color-picker";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return format(new Date(iso), "MMM d, yyyy · HH:mm:ss");
}

const METHOD_COLORS: Record<string, string> = {
  GET:     "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  POST:    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  PUT:     "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  PATCH:   "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  DELETE:  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  OPTIONS: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  HEAD:    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function MethodBadge({ method }: { method: string }) {
  const m = (method || "").toUpperCase();
  return (
    <span className={cn(
      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono",
      METHOD_COLORS[m] ?? "bg-muted text-muted-foreground"
    )}>
      {m || "—"}
    </span>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, className }: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4 flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-lg font-semibold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SessionDetailPage() {
  const { workspace_uuid, session_uuid } = useParams<{ workspace_uuid: string; session_uuid: string }>();
  const { user } = useAuthContext();
  const { workspaces } = useWorkspace();
  const router = useRouter();

  const activeWorkspace = workspaces.find((w) => w.uuid === workspace_uuid);
  const isPersonal = activeWorkspace?.is_personal ?? true;

  // ── Data state ────────────────────────────────────────────────────────────
  const [session, setSession]         = React.useState<SessionHistory | null>(null);
  const [notes, setNotes]             = React.useState<Note[]>([]);
  const [traffic, setTraffic]         = React.useState<TrafficEvent[]>([]);
  const [iocs, setIocs]               = React.useState<IOC[]>([]);
  const [allTags, setAllTags]         = React.useState<Tag[]>([]);
  const [allCases, setAllCases]       = React.useState<Case[]>([]);
  const [loading, setLoading]         = React.useState(true);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]     = React.useState<"overview" | "notes" | "network" | "iocs">("overview");
  const [noteBody, setNoteBody]       = React.useState("");
  const [addingNote, setAddingNote]   = React.useState(false);

  // Tag management
  const [tagPopoverOpen, setTagPopoverOpen]   = React.useState(false);
  const [tagBusy, setTagBusy]                 = React.useState(false);
  // New tag creation
  const [newTagName, setNewTagName]           = React.useState("");
  const [newTagColor, setNewTagColor]         = React.useState("#6366f1");
  const [creatingTag, setCreatingTag]         = React.useState(false);
  const [newTagDialogOpen, setNewTagDialogOpen] = React.useState(false);

  // Case management
  const [casePopoverOpen, setCasePopoverOpen] = React.useState(false);
  const [caseBusy, setCaseBusy]               = React.useState(false);
  // New case creation
  const [newCaseName, setNewCaseName]         = React.useState("");
  const [newCaseDesc, setNewCaseDesc]         = React.useState("");
  const [creatingCase, setCreatingCase]       = React.useState(false);
  const [newCaseDialogOpen, setNewCaseDialogOpen] = React.useState(false);

  const flagging = React.useRef<Set<number>>(new Set());

  // ── Load ──────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!user.isLoggedIn) { router.replace("/accounts/login/"); return; }
    load();
  }, [user.isLoggedIn]);

  async function load() {
    setLoading(true);
    try {
      const [s, n, tags, cases] = await Promise.all([
        sessionsApi.getHistoryDetail(session_uuid),
        sessionsApi.getNotes(session_uuid),
        isPersonal
          ? casesApi.listTags(undefined, true)
          : casesApi.listTags(workspace_uuid),
        isPersonal
          ? casesApi.list()
          : casesApi.list(workspace_uuid),
      ]);
      setSession(s);
      setNotes(n);
      setAllTags(tags);
      setAllCases(cases);

      if (s.enable_traffic_log) {
        const [events, iocList] = await Promise.all([
          sessionsApi.trafficLogs(session_uuid, { page: 1 }),
          sessionsApi.iocs(session_uuid),
        ]);
        setTraffic(events);
        setIocs(iocList);
      }
    } catch {
      toast.error("Failed to load session");
      router.push(`/${workspace_uuid}/history`);
    } finally {
      setLoading(false);
    }
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async function addNote() {
    if (!noteBody.trim() || !user.csrfToken) return;
    setAddingNote(true);
    try {
      const note = await sessionsApi.addNote(session_uuid, noteBody.trim(), user.csrfToken);
      setNotes((prev) => [...prev, note]);
      setNoteBody("");
      setSession((s) => s ? { ...s, notes_count: s.notes_count + 1 } : s);
    } catch {
      toast.error("Failed to add note");
    } finally {
      setAddingNote(false);
    }
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  async function addTag(tag: Tag) {
    if (!user.csrfToken || !session) return;
    if (session.tag_uuids.includes(tag.uuid)) return; // already assigned
    setTagBusy(true);
    const optimistic: SessionHistory = {
      ...session,
      tags: [...session.tags, tag.name],
      tag_uuids: [...session.tag_uuids, tag.uuid],
    };
    setSession(optimistic);
    try {
      await sessionsApi.assignTags(session_uuid, [tag.uuid], user.csrfToken);
    } catch {
      setSession(session); // revert
      toast.error("Failed to add tag");
    } finally {
      setTagBusy(false);
      setTagPopoverOpen(false);
    }
  }

  async function removeTag(tagUuid: string) {
    if (!user.csrfToken || !session) return;
    setTagBusy(true);
    const prev = session;
    setSession({
      ...session,
      tags: session.tags.filter((_, i) => session.tag_uuids[i] !== tagUuid),
      tag_uuids: session.tag_uuids.filter((u) => u !== tagUuid),
    });
    try {
      await sessionsApi.removeTag(session_uuid, tagUuid, user.csrfToken);
    } catch {
      setSession(prev);
      toast.error("Failed to remove tag");
    } finally {
      setTagBusy(false);
    }
  }

  async function createTag() {
    if (!newTagName.trim() || !user.csrfToken) return;
    const duplicate = allTags.find(
      (t) => t.name.toLowerCase() === newTagName.trim().toLowerCase()
    );
    if (duplicate) {
      toast.error(`Tag "${duplicate.name}" already exists — select it from the dropdown instead`);
      return;
    }
    setCreatingTag(true);
    try {
      const tag = await casesApi.createTag({
        name: newTagName.trim(),
        color: newTagColor,
        workspace_uuid: isPersonal ? undefined : workspace_uuid,
      }, user.csrfToken);
      setAllTags((prev) => [...prev, tag]);
      setNewTagName("");
      setNewTagDialogOpen(false);
      await addTag(tag);
    } catch {
      toast.error("Failed to create tag");
    } finally {
      setCreatingTag(false);
    }
  }

  // ── Cases ─────────────────────────────────────────────────────────────────

  async function assignCase(c: Case | null) {
    if (!user.csrfToken || !session) return;
    setCaseBusy(true);
    const prev = session;
    setSession({
      ...session,
      case_name: c?.name ?? null,
      case_uuid: c?.uuid ?? null,
    });
    try {
      await sessionsApi.assignCase(session_uuid, c?.uuid ?? null, user.csrfToken);
    } catch {
      setSession(prev);
      toast.error("Failed to update case");
    } finally {
      setCaseBusy(false);
      setCasePopoverOpen(false);
    }
  }

  async function createCase() {
    if (!newCaseName.trim() || !user.csrfToken) return;
    setCreatingCase(true);
    try {
      const c = await casesApi.create({
        name: newCaseName.trim(),
        description: newCaseDesc.trim(),
        workspace_uuid: isPersonal ? undefined : workspace_uuid,
      }, user.csrfToken);
      setAllCases((prev) => [...prev, c]);
      setNewCaseName("");
      setNewCaseDesc("");
      setNewCaseDialogOpen(false);
      await assignCase(c);
    } catch {
      toast.error("Failed to create case");
    } finally {
      setCreatingCase(false);
    }
  }

  // ── Traffic flags ─────────────────────────────────────────────────────────

  async function toggleFlag(event: TrafficEvent) {
    if (!user.csrfToken || flagging.current.has(event.id)) return;
    flagging.current.add(event.id);
    setTraffic((prev) => prev.map((e) => e.id === event.id ? { ...e, flagged: !e.flagged } : e));
    try {
      await sessionsApi.flagTrafficEvent(session_uuid, event.id, user.csrfToken);
    } catch {
      setTraffic((prev) => prev.map((e) => e.id === event.id ? { ...e, flagged: event.flagged } : e));
      toast.error("Failed to update flag");
    } finally {
      flagging.current.delete(event.id);
    }
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "notes",    label: `Notes${session ? ` (${session.notes_count})` : ""}` },
    ...(session?.enable_traffic_log ? [{ id: "network", label: `Network (${traffic.length})` }] : []),
    ...(session?.enable_traffic_log ? [{ id: "iocs", label: `IOCs (${iocs.length})` }] : []),
  ] as const;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!session) return null;

  const unassignedTags = allTags.filter((t) => !session.tag_uuids.includes(t.uuid));

  return (
    <div className="max-w-5xl mx-auto space-y-5 relative">
      {/* Cover the halftone background for this page only */}
      <div className="fixed inset-0 bg-background z-0 pointer-events-none" />

      <div className="relative z-10 space-y-5">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex items-start justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <Button
              variant="ghost" size="sm"
              onClick={() => router.push(`/${workspace_uuid}/history`)}
              className="mt-0.5 gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
            >
              <ArrowLeft className="size-3.5" />
              History
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold capitalize tracking-tight">
                  {session.type ?? "Session"}
                </h1>
                {session.active ? (
                  <Badge className="gap-1 bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30">
                    <span className="size-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                    Live
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <WifiOff className="size-2.5" />
                    Ended
                  </Badge>
                )}
                {session.capacity_provider && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    {session.capacity_provider === "FARGATE_SPOT" && <Zap className="size-2.5 text-amber-500" />}
                    {session.capacity_provider === "FARGATE_SPOT" ? "Spot" : "Standard"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{session.uuid}</p>
            </div>
          </div>

          {session.active && session.container_url && (
            <Button
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => router.push(`/session/${session.uuid}`)}
            >
              <Monitor className="size-3.5" />
              Connect
            </Button>
          )}
        </motion.div>

        {/* ── Stat cards ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <StatCard
            icon={Clock}
            label="Duration"
            value={session.active ? "Live" : formatDuration(session.duration_seconds)}
            sub={formatDate(session.start_time)}
          />
          <StatCard
            icon={DollarSign}
            label="Cost"
            value={session.session_cost_usd ? `$${Number(session.session_cost_usd).toFixed(4)}` : "—"}
            sub={session.active ? "Accruing" : "Final"}
          />
          <StatCard
            icon={Server}
            label="Infrastructure"
            value={session.capacity_provider === "FARGATE_SPOT" ? "Spot" : session.capacity_provider ? "Standard" : "—"}
            sub={session.ip_address ?? undefined}
          />
          <StatCard
            icon={Activity}
            label="Network Events"
            value={session.enable_traffic_log ? session.traffic_event_count.toLocaleString() : "—"}
            sub={session.enable_traffic_log ? "Logged" : "Not logged"}
          />
        </motion.div>

        {/* ── Tabs ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, delay: 0.08 }}
          className="border-b flex gap-0"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer transition-colors",
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </motion.div>

        {/* ── Tab content ── */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >

          {/* ── Overview ── */}
          {activeTab === "overview" && (
            <div className="grid md:grid-cols-2 gap-4">

              {/* Session details */}
              <div className="rounded-xl border bg-card p-5 space-y-3">
                <p className="text-sm font-semibold">Session Details</p>
                <Separator />
                <dl className="space-y-2.5 text-sm">
                  {[
                    { label: "Started",   value: formatDate(session.start_time) },
                    { label: "Ended",     value: session.active ? "Still running" : formatDate(session.closed_at) },
                    { label: "Subdomain", value: session.subdomain ?? "—" },
                    { label: "IP",        value: session.ip_address ?? "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground shrink-0">{label}</dt>
                      <dd className="font-mono text-xs text-right break-all">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Case + Tags + Network logging */}
              <div className="rounded-xl border bg-card p-5 space-y-5">

                {/* ── Case ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <FolderOpen className="size-3.5" />
                      Case
                    </div>
                    <div className="flex gap-1.5">
                      {/* New case dialog */}
                      <Dialog open={newCaseDialogOpen} onOpenChange={setNewCaseDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                            <FolderPlus className="size-3" />
                            New
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-sm">
                          <DialogHeader>
                            <DialogTitle>Create case</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3 pt-1">
                            <Input
                              placeholder="Case name"
                              value={newCaseName}
                              onChange={(e) => setNewCaseName(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && createCase()}
                            />
                            <Textarea
                              placeholder="Description (optional)"
                              value={newCaseDesc}
                              onChange={(e) => setNewCaseDesc(e.target.value)}
                              rows={2}
                              className="resize-none text-sm"
                            />
                            <Button
                              size="sm" className="w-full"
                              onClick={createCase}
                              disabled={!newCaseName.trim() || creatingCase}
                            >
                              {creatingCase ? "Creating…" : "Create & assign"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                  {/* Case picker */}
                  <Popover open={casePopoverOpen} onOpenChange={setCasePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline" size="sm"
                        className="w-full justify-between gap-2 font-normal"
                        disabled={caseBusy}
                      >
                        <span className={cn("truncate", !session.case_name && "text-muted-foreground")}>
                          {session.case_name ?? "No case assigned"}
                        </span>
                        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search cases…" />
                        <CommandList>
                          <CommandEmpty>No cases found.</CommandEmpty>
                          <CommandGroup>
                            {/* Unassign option */}
                            {session.case_uuid && (
                              <CommandItem
                                onSelect={() => assignCase(null)}
                                className="text-muted-foreground gap-2"
                              >
                                <X className="size-3.5" />
                                Remove case
                              </CommandItem>
                            )}
                            {allCases.map((c) => (
                              <CommandItem
                                key={c.uuid}
                                value={c.name}
                                onSelect={() => assignCase(c)}
                                className="gap-2"
                              >
                                <Check className={cn("size-3.5", session.case_uuid === c.uuid ? "opacity-100" : "opacity-0")} />
                                {c.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <Separator />

                {/* ── Tags ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <TagIcon className="size-3.5" />
                      Tags
                    </div>
                    {/* New tag dialog */}
                    <Dialog open={newTagDialogOpen} onOpenChange={setNewTagDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                          <Plus className="size-3" />
                          New tag
                        </Button>
                      </DialogTrigger>
                       <DialogContent className="sm:max-w-sm">
                         <DialogHeader>
                           <DialogTitle>Create tag</DialogTitle>
                         </DialogHeader>
                        {(() => {
                          const dupTag = newTagName.trim()
                            ? allTags.find((t) => t.name.toLowerCase() === newTagName.trim().toLowerCase())
                            : null;
                          return (
                            <div className="space-y-4 pt-1">
                              <Input
                                placeholder="Tag name"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && !dupTag && createTag()}
                              />
                              {dupTag && (
                                <p className="text-xs text-destructive">
                                  A tag named &ldquo;{dupTag.name}&rdquo; already exists — select it from &ldquo;Add tag&rdquo; instead.
                                </p>
                              )}
                              <ColorPicker
                                value={newTagColor}
                                onChange={(hex) => setNewTagColor(hex)}
                                className="gap-3"
                              >
                                <ColorPickerSelection className="h-36 rounded-lg" />
                                <ColorPickerHue />
                                <div className="flex items-center gap-2">
                                  <ColorPickerEyeDropper />
                                  <ColorPickerOutput />
                                  <ColorPickerFormat className="flex-1" />
                                </div>
                              </ColorPicker>
                              <Button
                                size="sm" className="w-full"
                                onClick={createTag}
                                disabled={!newTagName.trim() || !!dupTag || creatingTag}
                              >
                                {creatingTag ? "Creating…" : "Create & assign"}
                              </Button>
                            </div>
                          );
                        })()}
                      </DialogContent>
                    </Dialog>
                  </div>

                  {/* Assigned tags */}
                  <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                    {session.tags.length > 0
                      ? session.tags.map((name, i) => {
                          const tagUuid = session.tag_uuids[i];
                          const meta = allTags.find((t) => t.uuid === tagUuid);
                          return (
                            <Badge
                              key={tagUuid ?? name}
                              variant="secondary"
                              className="gap-1 pr-1 text-xs"
                              style={meta?.color ? { borderColor: meta.color + "44", backgroundColor: meta.color + "18" } : {}}
                            >
                              {meta?.color && (
                                <span className="size-1.5 rounded-full inline-block" style={{ backgroundColor: meta.color }} />
                              )}
                              {name}
                              <button
                                onClick={() => tagUuid && removeTag(tagUuid)}
                                disabled={tagBusy}
                                className="ml-0.5 cursor-pointer rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                              >
                                <X className="size-2.5" />
                              </button>
                            </Badge>
                          );
                        })
                      : <p className="text-sm text-muted-foreground">No tags assigned</p>
                    }
                  </div>

                  {/* Tag picker */}
                  <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline" size="sm"
                        className="gap-1.5 text-xs text-muted-foreground h-7"
                        disabled={tagBusy}
                      >
                        <Plus className="size-3" />
                        Add tag
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search tags…" />
                        <CommandList>
                          <CommandEmpty>No unassigned tags.</CommandEmpty>
                          <CommandGroup>
                            {unassignedTags.map((t) => (
                              <CommandItem
                                key={t.uuid}
                                value={t.name}
                                onSelect={() => addTag(t)}
                                className="gap-2"
                              >
                                <span
                                  className="size-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: t.color }}
                                />
                                {t.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <Separator />

                {/* Network logging */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Wifi className="size-3.5" />
                    Network Logging
                  </div>
                  <Badge variant={session.enable_traffic_log ? "default" : "secondary"} className="text-xs">
                    {session.enable_traffic_log ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* ── Notes ── */}
          {activeTab === "notes" && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="p-5 space-y-4">
                {notes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <StickyNote className="size-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No notes yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notes.map((n) => (
                      <div key={n.uuid} className="rounded-lg border bg-muted/30 p-3 space-y-1">
                        <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(n.created_at)}</p>
                      </div>
                    ))}
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-medium">Add note</p>
                  <Textarea
                    placeholder="Write a note about this session…"
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    rows={3}
                    className="text-sm resize-none"
                  />
                  <Button
                    size="sm"
                    onClick={addNote}
                    disabled={!noteBody.trim() || addingNote || !user.csrfToken}
                    className="gap-1.5"
                  >
                    <Plus className="size-3.5" />
                    {addingNote ? "Adding…" : "Add Note"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Network ── */}
          {activeTab === "network" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{traffic.length} events shown</p>
                <Button
                  variant="outline" size="sm"
                  className="gap-1.5"
                  onClick={() => router.push(`/${workspace_uuid}/history/${session_uuid}/traffic`)}
                >
                  <ExternalLink className="size-3.5" />
                  Full log
                </Button>
              </div>
              <div className="rounded-xl border bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[130px] font-mono text-[11px]">Time</TableHead>
                      <TableHead className="w-[68px]">Method</TableHead>
                      <TableHead className="w-[220px]">Host</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {traffic.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="flex flex-col items-center justify-center py-10 gap-2">
                            <Activity className="size-8 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">No network events recorded</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : traffic.map((e) => (
                      <TableRow
                        key={e.id}
                        className={cn(
                          "font-mono text-xs border-b last:border-b-0",
                          e.flagged && "bg-amber-50/60 dark:bg-amber-950/20"
                        )}
                      >
                        <TableCell className="tabular-nums text-muted-foreground whitespace-nowrap">
                          {format(new Date(e.timestamp), "HH:mm:ss")}
                        </TableCell>
                        <TableCell><MethodBadge method={e.method} /></TableCell>
                        <TableCell className="truncate max-w-[220px]">
                          <Tooltip>
                            <TooltipTrigger asChild><span className="truncate inline-block max-w-full">{e.host}</span></TooltipTrigger>
                            <TooltipContent>{e.host}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-muted-foreground truncate max-w-xs">
                          <Tooltip>
                            <TooltipTrigger asChild><span className="truncate inline-block max-w-full">{e.url}</span></TooltipTrigger>
                            <TooltipContent className="max-w-md break-all">{e.url}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="pr-3 text-right">
                          <button
                            onClick={() => toggleFlag(e)}
                            className={cn(
                              "cursor-pointer rounded p-0.5 transition-colors",
                              e.flagged ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground/30 hover:text-amber-400"
                            )}
                          >
                            <Flag className="size-3" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* ── IOCs ── */}
          {activeTab === "iocs" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {iocs.length} unique {iocs.length === 1 ? "host" : "hosts"} contacted
              </p>
              <div className="rounded-xl border bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="font-mono text-[11px]">Host</TableHead>
                      <TableHead className="w-[80px]">Type</TableHead>
                      <TableHead className="w-[80px] text-right">Events</TableHead>
                      <TableHead className="w-[60px] text-right">Flagged</TableHead>
                      <TableHead className="w-[160px]">First Seen</TableHead>
                      <TableHead className="w-[160px]">Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {iocs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <div className="flex flex-col items-center justify-center py-10 gap-2">
                            <Activity className="size-8 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">No hosts recorded</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : iocs.map((ioc) => (
                      <TableRow key={ioc.host} className="font-mono text-xs border-b last:border-b-0">
                        <TableCell className="truncate max-w-[300px]">
                          <Tooltip>
                            <TooltipTrigger asChild><span className="truncate inline-block max-w-full">{ioc.host}</span></TooltipTrigger>
                            <TooltipContent>{ioc.host}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Badge variant={ioc.is_ip ? "secondary" : "outline"} className="text-[10px]">
                            {ioc.is_ip ? "IP" : "Domain"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{ioc.event_count}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {ioc.flagged_count > 0 ? (
                            <span className="text-amber-500">{ioc.flagged_count}</span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {format(new Date(ioc.first_seen), "MMM d, HH:mm:ss")}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {format(new Date(ioc.last_seen), "MMM d, HH:mm:ss")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </motion.div>
      </div>{/* end relative z-10 */}
    </div>
  );
}
