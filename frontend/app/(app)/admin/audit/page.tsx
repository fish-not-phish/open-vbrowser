"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/store/AuthContext";
import { auditApi, type AuditLogEntry } from "@/lib/api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import {
  SearchIcon, X, ChevronLeft, ChevronRight, ScrollText, Download, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Action display config ────────────────────────────────────────────────────

const ACTION_GROUPS: { value: string; label: string }[] = [
  { value: "user", label: "User Management" },
  { value: "workspace", label: "Workspace" },
  { value: "site_settings", label: "Site Settings" },
  { value: "session", label: "Session" },
  { value: "file", label: "Files" },
  { value: "case", label: "Cases" },
  { value: "api_key", label: "API Keys" },
];

const ACTION_LABELS: Record<string, string> = {
  // Users
  "user.create": "User Created",
  "user.update": "User Updated",
  "user.password_reset": "Password Reset",
  // Workspaces
  "workspace.create": "Workspace Created",
  "workspace.update": "Workspace Updated",
  "workspace.delete": "Workspace Deleted",
  "workspace.leave": "Workspace Left",
  "workspace.browsers.set": "Workspace Browsers Set",
  "workspace.member.add": "Member Added",
  "workspace.member.remove": "Member Removed",
  "workspace.member.role_change": "Member Role Changed",
  // Site settings
  "site_settings.update": "Site Settings Updated",
  // Sessions
  "session.create": "Session Started",
  "session.close": "Session Closed",
  "session.revoke": "Login Session Revoked",
  // Files
  "file.upload": "File Uploaded",
  "file.delete": "File Deleted",
  "file.mkdir": "Folder Created",
  "file.hash": "Hash Computed",
  "file.download_protected": "Protected Download",
  // Cases
  "case.create": "Case Created",
  "case.update": "Case Updated",
  "case.delete": "Case Archived",
  "case.attachment.upload": "Attachment Uploaded",
  "case.attachment.delete": "Attachment Deleted",
  // API keys
  "api_key.create": "API Key Created",
  "api_key.delete": "API Key Revoked",
};

const ACTION_BADGE_COLORS: Record<string, string> = {
  // Users
  "user.create": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "user.update": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "user.password_reset": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  // Workspaces
  "workspace.create": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "workspace.update": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "workspace.delete": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "workspace.leave": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "workspace.browsers.set": "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  "workspace.member.add": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "workspace.member.remove": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "workspace.member.role_change": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  // Site settings
  "site_settings.update": "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  // Sessions
  "session.create": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "session.close": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "session.revoke": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  // Files
  "file.upload": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "file.delete": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "file.mkdir": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "file.hash": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "file.download_protected": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  // Cases
  "case.create": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "case.update": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "case.delete": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "case.attachment.upload": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "case.attachment.delete": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  // API keys
  "api_key.create": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "api_key.delete": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

const PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString([], {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

function formatMetadata(meta: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (v == null || v === "") continue;
    parts.push(`${k}=${String(v)}`);
  }
  return parts.join(" · ");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const { user } = useAuthContext();
  const router = useRouter();

  const [entries, setEntries] = React.useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState<string>("all");
  const [offset, setOffset] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    if (!user.isLoggedIn) { router.replace("/login"); return; }
    if (!user.isAdmin) { router.replace("/"); return; }
  }, [user.isLoggedIn, user.isAdmin, router]);

  React.useEffect(() => {
    if (!user.isLoggedIn || !user.isAdmin) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await auditApi.list({
          action: actionFilter !== "all" ? actionFilter : undefined,
          q: search.trim() || undefined,
          limit: PAGE_SIZE,
          offset,
        });
        if (cancelled) return;
        setEntries(data);
        setHasMore(data.length === PAGE_SIZE);
      } catch {
        if (!cancelled) toast.error("Failed to load audit log");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timer = setTimeout(load, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [user.isLoggedIn, user.isAdmin, actionFilter, search, offset]);

  // Reset offset when filters change
  React.useEffect(() => { setOffset(0); }, [actionFilter, search]);

  async function handleExport(fmt: "json" | "csv") {
    setExporting(true);
    try {
      const res = await auditApi.export(fmt, {
        action: actionFilter !== "all" ? actionFilter : undefined,
        q: search.trim() || undefined,
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition");
      const match = cd?.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? `audit-log.${fmt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${fmt.toUpperCase()}`);
    } catch {
      toast.error("Failed to export audit log");
    } finally {
      setExporting(false);
    }
  }

  if (!user.isLoggedIn || !user.isAdmin) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <ScrollText className="size-5 text-muted-foreground" />
            Audit Log
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Track administrative actions across the platform.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exporting}>
              {exporting
                ? <Loader2 className="size-4 animate-spin" />
                : <Download className="size-4" />}
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport("json")}>
              Export as JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("csv")}>
              Export as CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="flex items-center gap-3"
      >
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor or action…"
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
        </div>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[180px] h-8 text-sm">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTION_GROUPS.map((g) => (
              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="overflow-hidden rounded-xl border bg-card"
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[160px]">Time</TableHead>
              <TableHead className="w-[120px]">Actor</TableHead>
              <TableHead className="w-[160px]">Action</TableHead>
              <TableHead className="w-[120px]">Target</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="w-[110px]">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                </TableRow>
              ))
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  No audit log entries found
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow
                  key={entry.id}
                  className="hover:bg-muted/20 transition-colors"
                >
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                    {formatTimestamp(entry.timestamp)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.actor_username ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
                      ACTION_BADGE_COLORS[entry.action] ?? "bg-muted text-muted-foreground"
                    )}>
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.target_user_username ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-[300px]">
                    <Tooltip>
                      <TooltipTrigger asChild><span className="truncate inline-block max-w-full">{formatMetadata(entry.metadata) || "—"}</span></TooltipTrigger>
                      <TooltipContent className="max-w-md break-all">{formatMetadata(entry.metadata) || "—"}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {entry.ip_address ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!loading && entries.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-t">
            <span className="text-xs text-muted-foreground tabular-nums">
              {offset + 1}–{offset + entries.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <ChevronLeft className="size-3.5" />
                Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                disabled={!hasMore}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
