"use client";

import React from "react";
import { useParams } from "next/navigation";
import { filesApi, type FileEntry } from "@/lib/api";
import { useAuthContext } from "@/store/AuthContext";
import { useWorkspace } from "@/store/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Folder, File as FileIcon, Download, Trash2, Upload, FolderPlus,
  ChevronRight, Home, MoreHorizontal, Shield, Hash, Loader2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number) {
  if (bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "MMM d, yyyy HH:mm");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FilesPage() {
  const { workspace_uuid } = useParams<{ workspace_uuid: string }>();
  const { user } = useAuthContext();
  const { activeWorkspace } = useWorkspace();

  const [entries, setEntries] = React.useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [mkdirOpen, setMkdirOpen] = React.useState(false);
  const [folderName, setFolderName] = React.useState("");
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [hashing, setHashing] = React.useState<string | null>(null);
  const [protecting, setProtecting] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadFiles = React.useCallback(async (path: string) => {
    setLoading(true);
    try {
      const result = await filesApi.list(workspace_uuid, path || undefined);
      setEntries(result.entries);
      setCurrentPath(result.path);
    } catch {
      toast.error("Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [workspace_uuid]);

  React.useEffect(() => {
    loadFiles("");
  }, [loadFiles]);

  // Sort: folders first, then files, alphabetical
  const sorted = React.useMemo(() => {
    return [...entries].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [entries]);

  const breadcrumbs = React.useMemo(() => {
    if (!currentPath) return [];
    return currentPath.split("/").filter(Boolean);
  }, [currentPath]);

  function navigateTo(path: string) {
    loadFiles(path);
  }

  function navigateToBreadcrumb(index: number) {
    const parts = breadcrumbs.slice(0, index + 1);
    loadFiles(parts.join("/"));
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      await filesApi.upload(workspace_uuid, file, currentPath, user.csrfToken);
      toast.success(`Uploaded ${file.name}`);
      await loadFiles(currentPath);
    } catch {
      toast.error(`Failed to upload ${file.name}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(entry: FileEntry) {
    const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    try {
      const res = await filesApi.download(workspace_uuid, fullPath);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(`Failed to download ${entry.name}`);
    }
  }

  async function handleDownloadProtected(entry: FileEntry) {
    const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    setProtecting(fullPath);
    try {
      const res = await filesApi.downloadProtected(workspace_uuid, fullPath);
      if (!res.ok) throw new Error("Protected download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entry.name}-PROTECTED.7z`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${entry.name}-PROTECTED.7z`);
    } catch {
      toast.error(`Failed to create protected archive for ${entry.name}`);
    } finally {
      setProtecting(null);
    }
  }

  async function handleComputeHash(entry: FileEntry) {
    const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    setHashing(fullPath);
    try {
      const result = await filesApi.computeHash(workspace_uuid, fullPath);
      setEntries((prev) => prev.map((e) =>
        e.name === entry.name ? { ...e, sha256: result.sha256 } : e
      ));
      toast.success(`SHA-256 computed for ${entry.name}`);
    } catch {
      toast.error(`Failed to compute hash for ${entry.name}`);
    } finally {
      setHashing(null);
    }
  }

  async function handleDelete(entry: FileEntry) {
    const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    setDeleting(fullPath);
    try {
      await filesApi.delete(workspace_uuid, fullPath, user.csrfToken);
      toast.success(`Deleted ${entry.name}`);
      await loadFiles(currentPath);
    } catch {
      toast.error(`Failed to delete ${entry.name}`);
    } finally {
      setDeleting(null);
    }
  }

  async function handleMkdir() {
    if (!folderName.trim()) return;
    const path = currentPath ? `${currentPath}/${folderName.trim()}` : folderName.trim();
    try {
      await filesApi.mkdir(workspace_uuid, path, user.csrfToken);
      toast.success(`Created folder ${folderName.trim()}`);
      setFolderName("");
      setMkdirOpen(false);
      await loadFiles(currentPath);
    } catch {
      toast.error("Failed to create folder");
    }
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
    e.target.value = "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Files</h1>
          <p className="text-sm text-muted-foreground">
            Persistent storage for {activeWorkspace?.name ?? "workspace"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={onFileInputChange}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="size-4 mr-1.5" />
            {uploading ? "Uploading…" : "Upload"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMkdirOpen(true)}
          >
            <FolderPlus className="size-4 mr-1.5" />
            New Folder
          </Button>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <button
          onClick={() => navigateTo("")}
          className="hover:text-foreground transition-colors flex items-center"
        >
          <Home className="size-3.5" />
        </button>
        {breadcrumbs.map((part, i) => (
          <React.Fragment key={i}>
            <ChevronRight className="size-3.5" />
            <button
              onClick={() => navigateToBreadcrumb(i)}
              className="hover:text-foreground transition-colors"
            >
              {part}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* File table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Name</TableHead>
              <TableHead className="w-[100px]">Size</TableHead>
              <TableHead className="w-[160px]">Modified</TableHead>
              <TableHead className="w-[120px]">SHA-256</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell />
                </TableRow>
              ))
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                  No files in this folder
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((entry) => {
                const fullPath = currentPath
                  ? `${currentPath}/${entry.name}`
                  : entry.name;
                return (
                  <TableRow key={fullPath} className="group">
                    <TableCell>
                      <button
                        onClick={() => entry.is_dir && navigateTo(fullPath)}
                        className={`flex items-center gap-2 text-sm ${entry.is_dir ? "hover:text-primary cursor-pointer" : "cursor-default"}`}
                      >
                        {entry.is_dir
                          ? <Folder className="size-4 text-blue-500 shrink-0" />
                          : <FileIcon className="size-4 text-muted-foreground shrink-0" />}
                        <span className="truncate">{entry.name}</span>
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.is_dir ? "—" : formatSize(entry.size)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(entry.last_modified)}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {entry.is_dir ? (
                        "—"
                      ) : entry.sha256 ? (
                        <span title={entry.sha256} className="cursor-help">
                          {entry.sha256.slice(0, 8)}…
                        </span>
                      ) : hashing === fullPath ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="size-3 animate-spin" />
                          Computing…
                        </span>
                      ) : (
                        <button
                          onClick={() => handleComputeHash(entry)}
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <Hash className="size-3" />
                          Compute
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!entry.is_dir && (
                            <DropdownMenuItem onClick={() => handleDownload(entry)}>
                              <Download className="size-4 mr-2" />
                              Download
                            </DropdownMenuItem>
                          )}
                          {!entry.is_dir && activeWorkspace?.enable_file_protection && (
                            <DropdownMenuItem
                              onClick={() => handleDownloadProtected(entry)}
                              disabled={protecting === fullPath}
                            >
                              <Shield className="size-4 mr-2" />
                              {protecting === fullPath ? "Archiving…" : "Download Protected (7z)"}
                            </DropdownMenuItem>
                          )}
                          {!entry.is_dir && entry.sha256 && (
                            <DropdownMenuItem
                              onClick={() => {
                                navigator.clipboard.writeText(entry.sha256!);
                                toast.success("SHA-256 copied to clipboard");
                              }}
                            >
                              <Hash className="size-4 mr-2" />
                              Copy SHA-256
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(entry)}
                            disabled={deleting === fullPath}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-4 mr-2" />
                            {deleting === fullPath ? "Deleting…" : "Delete"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* New folder dialog */}
      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleMkdir()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMkdirOpen(false)}>Cancel</Button>
            <Button onClick={handleMkdir} disabled={!folderName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
