"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { casesApi, filesApi, workspacesApi, type Case, type CaseSession, type CaseComment, type CaseFile, type FileEntry, type WorkspaceMember, roleAtLeast } from "@/lib/api";
import { useAuthContext } from "@/store/AuthContext";
import { useWorkspace } from "@/store/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft, Pencil, CheckCircle2, Circle, Archive, Activity,
  MessageSquare, Paperclip, Upload, Trash2,
  File as FileIconGeneric, Send, Check, X, Monitor, DollarSign,
  Folder, ChevronRight, Home, Plus, Link2, AlertTriangle, Cloud, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// BlockNote
import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { filterSuggestionItems, BlockNoteSchema, defaultInlineContentSpecs } from "@blocknote/core";
import { MentionInlineContent } from "@/lib/blocknote-mention";
import { FileRefInlineContent } from "@/lib/blocknote-file-ref";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "MMM d, yyyy");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function emailInitials(email: string | null) {
  if (!email) return "?";
  const [local] = email.split("@");
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function parseBlocks(body: string): any[] {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [{ id: "legacy", type: "paragraph", props: {}, content: [{ type: "text", text: body, styles: {} }], children: [] }];
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

// ─── Shared schema with mention inline content ────────────────────────────────

const mentionSchema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: MentionInlineContent,
    fileRef: FileRefInlineContent,
  },
});

// ─── BlockNote read-only renderer ─────────────────────────────────────────────

function BlockNoteRenderer({ body }: { body: string }) {
  const editor = useCreateBlockNote({
    schema: mentionSchema,
    initialContent: parseBlocks(body),
  });
  return (
    <BlockNoteView
      editor={editor}
      editable={false}
      theme="dark"
      className="[&_.bn-container]:!bg-transparent [&_.bn-editor]:!px-0 [&_.bn-editor]:!py-0"
    />
  );
}

// ─── BlockNote composer ───────────────────────────────────────────────────────

function BlockNoteComposer({ onPost, onCancel, posting, initialBlocks, submitLabel = "Post", members = [], caseFiles = [] }: {
  onPost: (json: string) => Promise<void>;
  onCancel?: () => void;
  posting: boolean;
  initialBlocks?: any[];
  submitLabel?: string;
  members?: WorkspaceMember[];
  caseFiles?: CaseFile[];
}) {
  const editor = useCreateBlockNote({
    schema: mentionSchema,
    initialContent: initialBlocks,
  });

  async function submit() {
    const blocks = editor.document;
    const hasContent = blocks.some((b) => {
      const c = (b as any).content;
      if (!Array.isArray(c)) return false;
      return c.some((x: any) => x.text?.trim() || x.type === "mention" || x.type === "fileRef");
    });
    if (!hasContent) return;
    await onPost(JSON.stringify(blocks));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden [&_.bn-container]:!bg-transparent [&_.bn-editor]:min-h-[80px] [&_.bn-editor]:!px-0 [&_.bn-editor]:!py-0">
        <BlockNoteView editor={editor} theme="dark" slashMenu={false}>
          {/* Slash menu without media blocks */}
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                getDefaultReactSlashMenuItems(editor).filter(
                  (item) => !["audio", "video", "file", "image"].includes((item as any).key ?? (item as any).name ?? (item as any).title)
                ),
                query
              )
            }
          />
          {/* @ mention menu */}
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={async (query) => {
              const filtered = members.filter((m) =>
                m.email.toLowerCase().includes(query.toLowerCase())
              );
              return filtered.map((m) => ({
                title: m.email,
                onItemClick: () => {
                  editor.insertInlineContent([
                    { type: "mention", props: { email: m.email } },
                    { type: "text", text: " ", styles: {} },
                  ]);
                },
              }));
            }}
          />
          {/* # file reference menu */}
          <SuggestionMenuController
            triggerCharacter="#"
            getItems={async (query) => {
              const filtered = caseFiles.filter((f) =>
                f.filename.toLowerCase().includes(query.toLowerCase())
              );
              return filtered.map((f) => ({
                title: f.filename,
                onItemClick: () => {
                  editor.insertInlineContent([
                    { type: "fileRef", props: { uuid: f.uuid, filename: f.filename, source: f.source } },
                    { type: "text", text: " ", styles: {} },
                  ]);
                },
              }));
            }}
          />
        </BlockNoteView>
      </div>
      <div className="flex items-center gap-2 justify-end">
        {onCancel && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
        )}
        <Button size="sm" className="h-7 text-xs gap-1.5" onClick={submit} disabled={posting}>
          <Send className="size-3" />{posting ? "Posting…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

// ─── Inline name editor ───────────────────────────────────────────────────────

function InlineNameEditor({ value, onSave, readOnly }: { value: string; onSave: (v: string) => Promise<void>; readOnly?: boolean }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    if (!draft.trim() || draft === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft.trim()); setEditing(false); } finally { setSaving(false); }
  }

  if (readOnly) {
    return <h1 className="text-xl font-semibold tracking-tight">{value}</h1>;
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="h-8 text-xl font-semibold tracking-tight"
          autoFocus
        />
        <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={save} disabled={saving}><Check className="size-3.5" /></Button>
        <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => setEditing(false)}><X className="size-3.5" /></Button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      className="text-xl font-semibold tracking-tight text-left cursor-pointer hover:text-primary/80 transition-colors group flex items-center gap-2"
    >
      {value}
      <Pencil className="size-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />
    </button>
  );
}

// ─── Comments tab ─────────────────────────────────────────────────────────────

function CommentsTab({ caseUuid, workspaceUuid, currentUserId, csrfToken }: {
  caseUuid: string; workspaceUuid: string; currentUserId: number | null; csrfToken: string | null;
}) {
  const [comments, setComments] = React.useState<CaseComment[]>([]);
  const [members, setMembers] = React.useState<WorkspaceMember[]>([]);
  const [caseFiles, setCaseFiles] = React.useState<CaseFile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [posting, setPosting] = React.useState(false);
  const [editingUuid, setEditingUuid] = React.useState<string | null>(null);
  const [composerKey, setComposerKey] = React.useState(0);

  React.useEffect(() => {
    casesApi.listComments(caseUuid)
      .then(setComments)
      .catch(() => toast.error("Failed to load comments"))
      .finally(() => setLoading(false));
    workspacesApi.listMembers(workspaceUuid)
      .then(setMembers)
      .catch(() => {});
    casesApi.listFiles(caseUuid)
      .then(setCaseFiles)
      .catch(() => {});
  }, [caseUuid, workspaceUuid]);

  async function downloadFile(uuid: string, source: string, filename: string) {
    try {
      const res = source === "upload"
        ? await casesApi.downloadAttachment(caseUuid, uuid)
        : await casesApi.downloadFileLink(caseUuid, uuid);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}-PROTECTED.7z`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { toast.error(`Failed to download ${filename}`); }
  }

  async function post(json: string) {
    if (!csrfToken) return;
    setPosting(true);
    try {
      const c = await casesApi.addComment(caseUuid, json, csrfToken);
      setComments((prev) => [...prev, c]);
      setComposerKey((k) => k + 1);
    } catch { toast.error("Failed to post comment"); }
    finally { setPosting(false); }
  }

  async function saveEdit(comment: CaseComment, json: string) {
    if (!csrfToken) return;
    try {
      const updated = await casesApi.editComment(caseUuid, comment.uuid, json, csrfToken);
      setComments((prev) => prev.map((c) => c.uuid === updated.uuid ? updated : c));
      setEditingUuid(null);
    } catch { toast.error("Failed to update comment"); }
  }

  async function del(comment: CaseComment) {
    if (!csrfToken) return;
    try {
      await casesApi.deleteComment(caseUuid, comment.uuid, csrfToken);
      setComments((prev) => prev.filter((c) => c.uuid !== comment.uuid));
    } catch { toast.error("Failed to delete comment"); }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Thread */}
      {loading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-8 rounded-full shrink-0" />
            <div className="flex-1 flex flex-col gap-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <MessageSquare className="size-8 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        </div>
      ) : (
        comments.map((c, i) => {
          const isOwn = c.author_id === currentUserId;
          const isEditing = editingUuid === c.uuid;
          return (
            <motion.div key={c.uuid} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
              className="flex gap-4 group">
              <Avatar className="size-8 shrink-0 mt-0.5">
                <AvatarFallback className="text-xs">{emailInitials(c.author_email)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-sm font-medium">{c.author_email ?? "Unknown"}</span>
                  <span className="text-xs text-muted-foreground/60">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                  {c.created_at !== c.updated_at && <span className="text-xs text-muted-foreground/40">(edited)</span>}
                  {isOwn && !isEditing && (
                    <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingUuid(c.uuid)}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-destructive"
                        onClick={() => del(c)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </span>
                  )}
                </div>
                {isEditing ? (
                  <BlockNoteComposer
                    onPost={(json) => saveEdit(c, json)}
                    onCancel={() => setEditingUuid(null)}
                    posting={false}
                    initialBlocks={parseBlocks(c.body)}
                    submitLabel="Save"
                    members={members}
                    caseFiles={caseFiles}
                  />
                ) : (
                  <div
                    className="rounded-lg border border-border/40 bg-card/60 px-4 py-3"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      const chip = target.closest("[data-file-ref-uuid]");
                      if (chip) {
                        e.preventDefault();
                        downloadFile(
                          chip.getAttribute("data-file-ref-uuid")!,
                          chip.getAttribute("data-file-ref-source")!,
                          chip.textContent?.replace(/^#/, "") ?? "file",
                        );
                      }
                    }}
                  >
                    <BlockNoteRenderer body={c.body} />
                  </div>
                )}
              </div>
            </motion.div>
          );
        })
      )}

      {/* Compose */}
      <div className="border-t border-border/40 pt-6">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Add a comment</p>
        <BlockNoteComposer key={composerKey} onPost={post} posting={posting} members={members} caseFiles={caseFiles} />
      </div>
    </div>
  );
}

// ─── Attachments tab ──────────────────────────────────────────────────────────

function FilesTab({ caseUuid, workspaceUuid, currentUserId, csrfToken, storageEnabled, canManage }: {
  caseUuid: string; workspaceUuid: string; currentUserId: number | null; csrfToken: string | null; storageEnabled: boolean; canManage: boolean;
}) {
  const [files, setFiles] = React.useState<CaseFile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [linking, setLinking] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadFiles = React.useCallback(() => {
    setLoading(true);
    casesApi.listFiles(caseUuid)
      .then(setFiles)
      .catch(() => toast.error("Failed to load files"))
      .finally(() => setLoading(false));
  }, [caseUuid]);

  React.useEffect(() => { loadFiles(); }, [loadFiles]);

  async function handleFiles(files: FileList | null) {
    if (!files || !csrfToken) return;
    setUploading(true);
    try {
      await Promise.all(Array.from(files).map((f) => casesApi.uploadAttachment(caseUuid, f, csrfToken)));
      toast.success(`${files.length} file${files.length !== 1 ? "s" : ""} uploaded`);
      loadFiles();
    } catch { toast.error("Upload failed"); }
    finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleLink(path: string) {
    if (!csrfToken) return;
    setLinking(true);
    try {
      await casesApi.createFileLink(caseUuid, path, csrfToken);
      toast.success("File linked to case");
      setPickerOpen(false);
      loadFiles();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg.includes("API 409") ? "Already linked to this case" : "Failed to link file");
    } finally { setLinking(false); }
  }

  async function handleDownload(file: CaseFile) {
    try {
      const res = file.source === "upload"
        ? await casesApi.downloadAttachment(caseUuid, file.uuid)
        : await casesApi.downloadFileLink(caseUuid, file.uuid);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${file.filename}-PROTECTED.7z`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { toast.error(`Failed to download ${file.filename}`); }
  }

  async function handleDelete(file: CaseFile) {
    if (!csrfToken) return;
    try {
      if (file.source === "upload") {
        await casesApi.deleteAttachment(caseUuid, file.uuid, csrfToken);
      } else {
        await casesApi.deleteFileLink(caseUuid, file.uuid, csrfToken);
      }
      setFiles((prev) => prev.filter((f) => f.uuid !== file.uuid));
      toast.success("Removed");
    } catch { toast.error("Failed to remove file"); }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Actions */}
      {canManage && (
      <div className="flex flex-col gap-3">
        {/* Drop zone */}
        <div
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-muted/10 hover:bg-muted/20 hover:border-primary/40 transition-colors cursor-pointer py-8 text-center"
        >
          <Upload className="size-6 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{uploading ? "Uploading…" : "Drop files here or click to browse"}</p>
          <p className="text-xs text-muted-foreground/40">Uploads stay on this server · Max 50 MB per file</p>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>
        {storageEnabled && (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setPickerOpen(true)}>
            <Link2 className="size-4 mr-1.5" />Add from workspace
          </Button>
        )}
      </div>
      )}

      {/* Unified file list */}
      {loading ? (
        Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border/40">
            <Skeleton className="size-9 rounded" />
            <div className="flex-1 flex flex-col gap-1.5"><Skeleton className="h-3 w-48" /><Skeleton className="h-3 w-28" /></div>
          </div>
        ))
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No files attached yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {files.map((file, i) => (
            <motion.div key={`${file.source}-${file.uuid}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 p-3 hover:bg-card/80 group transition-colors">
              <div className="size-9 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                <FileIconGeneric className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{file.filename}</p>
                  {file.source === "upload" ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                      <Paperclip className="size-2.5" />Uploaded
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                      <Cloud className="size-2.5" />Workspace
                    </Badge>
                  )}
                  {file.source === "workspace" && !file.exists && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                      <AlertTriangle className="size-2.5" />Missing
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size_bytes)} · {file.uploaded_by_email ?? "Unknown"} · {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {(file.source === "upload" || file.exists) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => handleDownload(file)}>
                        <Shield className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download as protected 7z</TooltipContent>
                  </Tooltip>
                )}
                {canManage && (
                  <Button variant="ghost" size="icon" className="size-7 hover:text-destructive" onClick={() => handleDelete(file)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Workspace file picker */}
      {pickerOpen && (
        <WorkspaceFilePicker
          workspaceUuid={workspaceUuid}
          linking={linking}
          onLink={handleLink}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Workspace file picker ────────────────────────────────────────────────────

function WorkspaceFilePicker({ workspaceUuid, linking, onLink, onClose }: {
  workspaceUuid: string; linking: boolean; onLink: (path: string) => void; onClose: () => void;
}) {
  const [entries, setEntries] = React.useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);

  const loadFiles = React.useCallback(async (path: string) => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await filesApi.list(workspaceUuid, path || undefined);
      setEntries(result.entries);
      setCurrentPath(result.path);
    } catch {
      setLoadError(true);
      setEntries([]);
    } finally { setLoading(false); }
  }, [workspaceUuid]);

  React.useEffect(() => { loadFiles(""); }, [loadFiles]);

  const sorted = React.useMemo(() =>
    [...entries].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    }), [entries]);

  const breadcrumbs = React.useMemo(() => currentPath.split("/").filter(Boolean), [currentPath]);

  const selectedFullPath = selected
    ? (currentPath ? `${currentPath}/${selected}` : selected)
    : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link a workspace file</DialogTitle>
        </DialogHeader>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
          <button onClick={() => { setSelected(null); loadFiles(""); }} className="cursor-pointer hover:text-foreground transition-colors flex items-center">
            <Home className="size-3.5" />
          </button>
          {breadcrumbs.map((part, i) => (
            <React.Fragment key={i}>
              <ChevronRight className="size-3.5" />
              <button
                onClick={() => { setSelected(null); loadFiles(breadcrumbs.slice(0, i + 1).join("/")); }}
                className="cursor-pointer hover:text-foreground transition-colors"
              >
                {part}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* File list */}
        <div className="border rounded-lg max-h-[40vh] overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <AlertTriangle className="size-5 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Failed to load workspace files.</p>
              <Button variant="outline" size="sm" onClick={() => loadFiles(currentPath)}>Retry</Button>
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No files in this folder</p>
          ) : (
            <div className="divide-y">
              {sorted.map((entry) => {
                const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
                const isSelected = !entry.is_dir && selected === entry.name;
                return (
                  <button
                    key={fullPath}
                    onClick={() => entry.is_dir ? (setSelected(null), loadFiles(fullPath)) : setSelected(entry.name)}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 text-sm text-left cursor-pointer transition-colors",
                      isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/40"
                    )}
                  >
                    {entry.is_dir
                      ? <Folder className="size-4 text-blue-500 shrink-0" />
                      : <FileIconGeneric className="size-4 text-muted-foreground shrink-0" />}
                    <span className="truncate flex-1">{entry.name}</span>
                    {isSelected && <Check className="size-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedFullPath && (
          <p className="text-xs text-muted-foreground truncate">
            Selected: <span className="font-mono">{selectedFullPath}</span>
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => selectedFullPath && onLink(selectedFullPath)} disabled={!selectedFullPath || linking}>
            {linking ? "Linking…" : (<><Plus className="size-4 mr-1.5" />Link to case</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sessions Tab ─────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function SessionsTab({ sessions, workspaceUuid, onNavigate }: {
  sessions: CaseSession[];
  workspaceUuid: string;
  onNavigate: (uuid: string) => void;
}) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No sessions attached to this case yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((s, i) => (
        <motion.div
          key={String(s.uuid)}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          onClick={() => onNavigate(String(s.uuid))}
          className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 p-3 hover:bg-card/80 cursor-pointer transition-colors group"
        >
          {/* Browser icon + active dot */}
          <div className="relative shrink-0">
            <div className="size-9 rounded-lg bg-muted/40 flex items-center justify-center">
              <Monitor className="size-4 text-muted-foreground" />
            </div>
            {s.active && (
              <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-green-500 ring-2 ring-background" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium capitalize truncate">
              {s.type ?? "Browser"}{s.active && <span className="ml-2 text-xs text-green-500 font-normal">Live</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {s.start_time ? format(new Date(s.start_time), "MMM d, yyyy HH:mm") : "—"}
              {" · "}{formatDuration(s.duration_seconds)}
              {" · "}{s.capacity_provider === "FARGATE_SPOT" ? "Spot" : s.capacity_provider ? "Standard" : "—"}
            </p>
          </div>

          {/* Cost */}
          {s.session_cost_usd && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <DollarSign className="size-3" />
              {Number(s.session_cost_usd).toFixed(4)}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CaseDetailPage() {
  const { workspace_uuid, case_uuid: uuid } = useParams<{ workspace_uuid: string; case_uuid: string }>();
  const { user } = useAuthContext();
  const { workspaces, activeWorkspace } = useWorkspace();
  const router = useRouter();
  const canManageCase = roleAtLeast(activeWorkspace?.role, "analyst");

  // Redirect personal workspaces away — cases are team-only
  React.useEffect(() => {
    const ws = workspaces.find((w) => w.uuid === workspace_uuid);
    if (ws?.is_personal) router.replace(`/${workspace_uuid}/dashboard`);
  }, [workspace_uuid, workspaces]);

  const [caseData, setCaseData] = React.useState<Case | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [savingStatus, setSavingStatus] = React.useState(false);

  React.useEffect(() => {
    if (!user.isLoggedIn) { router.replace("/accounts/login/"); return; }
    casesApi.get(uuid)
      .then(setCaseData)
      .catch(() => { toast.error("Case not found"); router.replace(`/${workspace_uuid}/cases`); })
      .finally(() => setLoading(false));
  }, [uuid, user.isLoggedIn]);

  async function saveName(name: string) {
    if (!caseData || !user.csrfToken) return;
    const updated = await casesApi.update(caseData.uuid, { name }, user.csrfToken);
    setCaseData(updated);
  }

  async function saveStatus(status: string) {
    if (!caseData || !user.csrfToken) return;
    setSavingStatus(true);
    try {
      const updated = await casesApi.update(caseData.uuid, { status }, user.csrfToken);
      setCaseData(updated);
    } catch { toast.error("Failed to update status"); }
    finally { setSavingStatus(false); }
  }

  if (!user.isLoggedIn) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Back nav */}
      <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => router.push(`/${workspace_uuid}/cases`)}>
          <ArrowLeft className="size-3.5" />Cases
        </Button>
      </motion.div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}
        className="flex flex-col gap-3">
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-96" />
            <Skeleton className="h-4 w-64" />
          </div>
        ) : caseData ? (
          <>
            <InlineNameEditor value={caseData.name} onSave={saveName} readOnly={!canManageCase} />
            {caseData.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{caseData.description}</p>
            )}
            {/* Meta row */}
            <div className="flex items-center gap-4 flex-wrap">
              <Select value={caseData.status} onValueChange={saveStatus} disabled={savingStatus || !canManageCase}>
                <SelectTrigger className="w-32 h-7 text-xs border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>

              <span className="text-xs text-muted-foreground">Created {formatDate(caseData.created_at)}</span>
              <span className="text-xs text-muted-foreground">Updated {formatDate(caseData.updated_at)}</span>
            </div>
          </>
        ) : null}
      </motion.div>

      {/* Tabs */}
      {!loading && caseData && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: 0.1 }}>
          <Tabs defaultValue="sessions">
            <TabsList className="border border-border/60 bg-muted/20 h-8 mb-6">
              <TabsTrigger value="sessions" className="text-xs gap-1.5 h-6">
                <Monitor className="size-3" />Sessions {caseData.session_count > 0 && `(${caseData.session_count})`}
              </TabsTrigger>
              <TabsTrigger value="comments" className="text-xs gap-1.5 h-6">
                <MessageSquare className="size-3" />Comments
              </TabsTrigger>
              <TabsTrigger value="attachments" className="text-xs gap-1.5 h-6">
                <Paperclip className="size-3" />Files
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sessions">
              <SessionsTab
                sessions={caseData.sessions}
                workspaceUuid={workspace_uuid}
                onNavigate={(sessionUuid) => router.push(`/${workspace_uuid}/history/${sessionUuid}`)}
              />
            </TabsContent>
            <TabsContent value="comments">
              <CommentsTab caseUuid={caseData.uuid} workspaceUuid={workspace_uuid} currentUserId={user.id ?? null} csrfToken={user.csrfToken ?? null} />
            </TabsContent>
            <TabsContent value="attachments">
              <FilesTab
                caseUuid={caseData.uuid}
                workspaceUuid={workspace_uuid}
                currentUserId={user.id ?? null}
                csrfToken={user.csrfToken ?? null}
                storageEnabled={!!activeWorkspace?.storage_ready}
                canManage={canManageCase}
              />
            </TabsContent>
          </Tabs>
        </motion.div>
      )}
    </div>
  );
}
