"use client";

import React from "react";
import { sessionsApi, type SessionHistory } from "@/lib/api";
import { useAuthContext } from "@/store/AuthContext";
import { useWorkspace } from "@/store/WorkspaceContext";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarIcon, Search, X, ChevronLeft, ChevronRight, Clock, Zap, Tag, FolderOpen, History, StickyNote, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import type { DateRange } from "react-day-picker";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return format(new Date(iso), "MMM d, yyyy · HH:mm");
}

// ─── Date range picker ────────────────────────────────────────────────────────

function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
}) {
  const [open, setOpen] = React.useState(false);

  const label = value?.from
    ? value.to
      ? `${format(value.from, "MMM d")} – ${format(value.to, "MMM d, yyyy")}`
      : format(value.from, "MMM d, yyyy")
    : "Date range";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 gap-2 text-sm font-normal",
            !value?.from && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="size-3.5" />
          {label}
          {value?.from && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange(undefined); }}
              className="ml-1 rounded-full hover:bg-muted p-0.5 -mr-1"
            >
              <X className="size-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          numberOfMonths={2}
          captionLayout="label"
          disabled={{ after: new Date() }}
        />
      </PopoverContent>
    </Popover>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function HistoryPage() {
  const { workspace_uuid } = useParams<{ workspace_uuid: string }>();
  const { user } = useAuthContext();
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspace();
  const router = useRouter();

  React.useEffect(() => {
    const ws = workspaces.find((w) => w.uuid === workspace_uuid);
    if (ws) setActiveWorkspace(ws);
  }, [workspace_uuid, workspaces]);

  const [sessions, setSessions] = React.useState<SessionHistory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [browser, setBrowser] = React.useState("");
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>();

  React.useEffect(() => {
    if (!user.isLoggedIn) {
      router.replace("/accounts/login/");
      return;
    }
    load();
  }, [user.isLoggedIn, page, browser, dateRange, workspace_uuid, activeWorkspace]);

  async function load() {
    setLoading(true);
    try {
      const data = await sessionsApi.history({
        page,
        browser: browser || undefined,
        from_date: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined,
        to_date: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined,
        workspace_uuid: workspace_uuid,
      });
      setSessions(data);
    } catch {
      toast.error("Failed to load history");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setBrowser("");
    setDateRange(undefined);
    setPage(1);
  }

  const hasFilters = !!browser || !!dateRange?.from;

  if (!user.isLoggedIn) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Session History</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Browse and filter your past browser sessions.</p>
        </div>
      </motion.div>

      {/* Filter bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Filter by browser…"
            className="pl-8 h-9 w-48 text-sm"
            value={browser}
            onChange={(e) => { setBrowser(e.target.value); setPage(1); }}
          />
          <AnimatePresence>
            {browser && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => { setBrowser(""); setPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <DateRangePicker
          value={dateRange}
          onChange={(r) => { setDateRange(r); setPage(1); }}
        />

        <AnimatePresence>
          {hasFilters && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Button variant="ghost" size="sm" onClick={reset} className="h-9 text-muted-foreground gap-1.5">
                <X className="size-3.5" />
                Clear filters
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border bg-card overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[140px]">Application</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="w-[100px]">
                <span className="flex items-center gap-1.5"><Clock className="size-3.5" />Duration</span>
              </TableHead>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead className="w-[90px]">Cost</TableHead>
              <TableHead className="w-[80px]">
                <span className="flex items-center gap-1.5"><StickyNote className="size-3.5" />Notes</span>
              </TableHead>
              <TableHead className="w-[100px]">
                <span className="flex items-center gap-1.5"><Activity className="size-3.5" />Net Logs</span>
              </TableHead>
              <TableHead>
                <span className="flex items-center gap-1.5"><Tag className="size-3.5" />Tags</span>
              </TableHead>
              <TableHead>
                <span className="flex items-center gap-1.5"><FolderOpen className="size-3.5" />Case</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className={cn("h-4", j === 0 ? "w-20" : j === 7 ? "w-12" : "w-full")} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : sessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="size-12 rounded-xl bg-muted flex items-center justify-center">
                      <History className="size-5 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">No sessions found</p>
                    {hasFilters && (
                      <Button variant="ghost" size="sm" onClick={reset} className="text-xs">
                        Clear filters
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sessions.map((s, i) => {
                const hasLogs = s.enable_traffic_log && s.traffic_event_count > 0;
                return (
                  <motion.tr
                    key={s.uuid}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03, duration: 0.2 }}
                    className="border-b transition-colors hover:bg-muted/30 cursor-pointer"
                    onClick={() => router.push(`/${workspace_uuid}/history/${s.uuid}`)}
                  >
                     <TableCell className="font-medium capitalize">
                      <div className="flex items-center gap-2">
                        {s.type ?? "—"}
                        {s.active && (
                          <span className="size-1.5 rounded-full bg-green-500 animate-pulse inline-block" title="Live" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {formatDate(s.start_time)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatDuration(s.duration_seconds)}
                    </TableCell>
                    <TableCell>
                      {s.capacity_provider ? (
                        <Badge
                          variant={s.capacity_provider === "FARGATE_SPOT" ? "secondary" : "outline"}
                          className="gap-1 text-xs"
                        >
                          {s.capacity_provider === "FARGATE_SPOT" && <Zap className="size-2.5 text-amber-500" />}
                          {s.capacity_provider === "FARGATE_SPOT" ? "Spot" : "Standard"}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {s.session_cost_usd ? `$${Number(s.session_cost_usd).toFixed(4)}` : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.notes_count > 0 ? (
                        <Badge variant="secondary" className="text-xs">{s.notes_count}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {hasLogs ? (
                        <Badge variant="secondary" className="gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <Activity className="size-2.5" />
                          {s.traffic_event_count.toLocaleString()}
                        </Badge>
                      ) : s.enable_traffic_log ? (
                        <span className="text-xs text-muted-foreground">0</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {s.tags.length > 0
                          ? s.tags.map((t) => (
                              <Badge key={t} variant="outline" className="text-xs px-1.5 py-0 h-5">{t}</Badge>
                            ))
                          : <span className="text-sm text-muted-foreground">—</span>
                        }
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.case_name ?? "—"}
                    </TableCell>
                  </motion.tr>
                );
              })
            )}
          </TableBody>
        </Table>
      </motion.div>

      {/* Pagination */}
      {!loading && sessions.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex items-center justify-between"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="gap-1.5"
          >
            <ChevronLeft className="size-3.5" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">Page {page}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={sessions.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
            className="gap-1.5"
          >
            Next
            <ChevronRight className="size-3.5" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}
