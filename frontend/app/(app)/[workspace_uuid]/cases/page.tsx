"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { casesApi, type Case } from "@/lib/api";
import { useAuthContext } from "@/store/AuthContext";
import { useWorkspace } from "@/store/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Plus, Search, X, FolderOpen, MoreHorizontal, Pencil, Archive,
  CheckCircle2, Circle, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "MMM d, yyyy");
}

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  open: { label: "Open", icon: <Circle className="size-3" />, className: "text-primary border-primary/30 bg-primary/10" },
  closed: { label: "Closed", icon: <CheckCircle2 className="size-3" />, className: "text-muted-foreground border-border bg-muted/20" },
  archived: { label: "Archived", icon: <Archive className="size-3" />, className: "text-muted-foreground/60 border-border/50 bg-muted/10" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.open;
  return (
    <Badge variant="outline" className={cn("gap-1 text-[11px] font-medium py-0.5", meta.className)}>
      {meta.icon}{meta.label}
    </Badge>
  );
}

// ─── Create / Edit dialog ─────────────────────────────────────────────────────

interface CaseFormData { name: string; description: string; status: string }

function CaseDialog({ open, initial, onClose, onSave }: {
  open: boolean; initial?: Case | null; onClose: () => void; onSave: (d: CaseFormData) => Promise<void>;
}) {
  const [form, setForm] = React.useState<CaseFormData>({ name: "", description: "", status: "open" });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm({ name: initial?.name ?? "", description: initial?.description ?? "", status: initial?.status ?? "open" });
  }, [open, initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onSave(form); onClose(); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{initial ? "Edit case" : "New case"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4 pt-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input placeholder="Case name…" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Description</label>
            <Textarea placeholder="Optional description…" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="resize-none" />
          </div>
          {initial && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>{saving ? "Saving…" : initial ? "Save changes" : "Create case"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveDialog({ open, caseName, onClose, onConfirm }: {
  open: boolean; caseName: string; onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  async function confirm() { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Archive case</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Archive <span className="font-medium text-foreground">&ldquo;{caseName}&rdquo;</span>? Sessions linked to this case will not be deleted.
        </p>
        <DialogFooter className="pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>{busy ? "Archiving…" : "Archive"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const STATUS_TABS = ["all", "open", "closed", "archived"] as const;

export default function CasesPage() {
  const { workspace_uuid } = useParams<{ workspace_uuid: string }>();
  const { user } = useAuthContext();
  const { workspaces, setActiveWorkspace } = useWorkspace();
  const router = useRouter();

  // Sync active workspace from URL param
  React.useEffect(() => {
    const ws = workspaces.find((w) => w.uuid === workspace_uuid);
    if (ws) setActiveWorkspace(ws);
  }, [workspace_uuid, workspaces]);

  const [cases, setCases] = React.useState<Case[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [tab, setTab] = React.useState<typeof STATUS_TABS[number]>("all");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Case | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<Case | null>(null);

  React.useEffect(() => {
    if (!user.isLoggedIn) { router.replace("/accounts/login/"); return; }
    if (workspace_uuid) load();
  }, [user.isLoggedIn, workspace_uuid]);

  async function load() {
    setLoading(true);
    try {
      const data = await casesApi.list(workspace_uuid);
      setCases(data);
    } catch { toast.error("Failed to load cases"); }
    finally { setLoading(false); }
  }

  async function handleCreate(form: CaseFormData) {
    const created = await casesApi.create(
      { name: form.name, description: form.description, workspace_uuid },
      user.csrfToken!
    );
    setCases((prev) => [created, ...prev]);
    toast.success("Case created");
  }

  async function handleEdit(form: CaseFormData) {
    if (!editTarget) return;
    const updated = await casesApi.update(editTarget.uuid, { name: form.name, description: form.description, status: form.status }, user.csrfToken!);
    setCases((prev) => prev.map((c) => c.uuid === updated.uuid ? updated : c));
    toast.success("Case updated");
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    await casesApi.delete(archiveTarget.uuid, user.csrfToken!);
    setCases((prev) => prev.map((c) => c.uuid === archiveTarget.uuid ? { ...c, status: "archived" } : c));
    toast.success("Case archived");
  }

  const filtered = cases.filter((c) => {
    if (tab !== "all" && c.status !== tab) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = React.useMemo(() => ({
    all: cases.length,
    open: cases.filter((c) => c.status === "open").length,
    closed: cases.filter((c) => c.status === "closed").length,
    archived: cases.filter((c) => c.status === "archived").length,
  }), [cases]);

  if (!user.isLoggedIn) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Cases</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Organise sessions into investigations and track their progress.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" />New case
        </Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }} className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/20 p-0.5">
          {STATUS_TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize",
              tab === t ? "bg-background text-foreground shadow-sm border border-border/60" : "text-muted-foreground hover:text-foreground"
            )}>
              {t}<span className={cn("ml-1.5 tabular-nums", tab === t ? "text-primary" : "text-muted-foreground/60")}>{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search cases…" className="pl-8 h-9 w-52 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
          <AnimatePresence>
            {search && (
              <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.1 }} className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Case</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[90px]"><span className="flex items-center gap-1.5"><Activity className="size-3.5" />Sessions</span></TableHead>
              <TableHead className="w-[130px]">Created</TableHead>
              <TableHead className="w-[130px]">Updated</TableHead>
              <TableHead className="w-[44px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {[1, 2, 3, 4, 5, 6].map((j) => (
                    <TableCell key={j}><Skeleton className={cn("h-4", j === 1 ? "w-48" : "w-16")} /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <FolderOpen className="size-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      {search || tab !== "all" ? "No cases match your filters." : "No cases yet. Create one to get started."}
                    </p>
                    {!search && tab === "all" && (
                      <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                        <Plus className="size-3.5 mr-1.5" />New case
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c, i) => (
                <motion.tr key={c.uuid} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}
                  className="border-b transition-colors hover:bg-muted/20 group cursor-pointer"
                  onClick={() => router.push(`/${workspace_uuid}/cases/${c.uuid}`)}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-sm leading-snug">{c.name}</span>
                      {c.description && <span className="text-xs text-muted-foreground line-clamp-1 max-w-lg">{c.description}</span>}
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell><span className="text-sm tabular-nums text-muted-foreground">{c.session_count}</span></TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{formatDate(c.created_at)}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{formatDate(c.updated_at)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => setEditTarget(c)}><Pencil className="size-3.5 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setArchiveTarget(c)}>
                          <Archive className="size-3.5 mr-2" />Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </motion.tr>
              ))
            )}
          </TableBody>
        </Table>
      </motion.div>

      <CaseDialog open={createOpen} onClose={() => setCreateOpen(false)} onSave={handleCreate} />
      <CaseDialog open={!!editTarget} initial={editTarget} onClose={() => setEditTarget(null)} onSave={handleEdit} />
      <ArchiveDialog open={!!archiveTarget} caseName={archiveTarget?.name ?? ""} onClose={() => setArchiveTarget(null)} onConfirm={handleArchive} />
    </div>
  );
}
