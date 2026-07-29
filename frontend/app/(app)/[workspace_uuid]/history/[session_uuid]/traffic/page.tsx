"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthContext } from "@/store/AuthContext";
import { sessionsApi, type TrafficEvent } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Activity, ArrowLeft, ChevronLeft, ChevronRight, Flag, Search, X,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET:     "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  POST:    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  PUT:     "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  PATCH:   "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  DELETE:  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  OPTIONS: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  HEAD:    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  CONNECT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function MethodBadge({ method }: { method: string }) {
  const m = (method || "").toUpperCase();
  return (
    <span className={cn(
      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono tabular-nums",
      METHOD_COLORS[m] ?? "bg-muted text-muted-foreground"
    )}>
      {m || "—"}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

export default function TrafficLogPage() {
  const { workspace_uuid, session_uuid } = useParams<{ workspace_uuid: string; session_uuid: string }>();
  const { user } = useAuthContext();
  const router = useRouter();

  const [events, setEvents]             = React.useState<TrafficEvent[]>([]);
  const [loading, setLoading]           = React.useState(true);
  const [page, setPage]                 = React.useState(1);
  const [search, setSearch]             = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [flaggedOnly, setFlaggedOnly]   = React.useState(false);
  const [selectedMethods, setSelectedMethods] = React.useState<Set<string>>(new Set());
  const flagging                        = React.useRef<Set<number>>(new Set());

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    if (!user.isLoggedIn) { router.replace("/accounts/login/"); return; }
    load();
  }, [user.isLoggedIn, page, debouncedSearch, flaggedOnly, selectedMethods]);

  async function load() {
    setLoading(true);
    try {
      const data = await sessionsApi.trafficLogs(session_uuid, {
        page,
        search: debouncedSearch || undefined,
        flagged_only: flaggedOnly || undefined,
        method: selectedMethods.size > 0 ? Array.from(selectedMethods).join(",") : undefined,
      });
      setEvents(data);
    } catch {
      toast.error("Failed to load network logs");
    } finally {
      setLoading(false);
    }
  }

  async function toggleFlag(event: TrafficEvent) {
    if (!user.csrfToken || flagging.current.has(event.id)) return;
    flagging.current.add(event.id);
    // Optimistic update
    setEvents((prev) => prev.map((e) => e.id === event.id ? { ...e, flagged: !e.flagged } : e));
    try {
      await sessionsApi.flagTrafficEvent(session_uuid, event.id, user.csrfToken);
      // If flagged-only filter is on and we just unflagged, remove from list
      if (flaggedOnly) {
        setEvents((prev) => prev.filter((e) => e.id !== event.id || !event.flagged));
      }
    } catch {
      // Revert
      setEvents((prev) => prev.map((e) => e.id === event.id ? { ...e, flagged: event.flagged } : e));
      toast.error("Failed to update flag");
    } finally {
      flagging.current.delete(event.id);
    }
  }

  function toggleMethod(m: string) {
    setSelectedMethods((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
    setPage(1);
  }

  function resetFilters() {
    setSearch("");
    setFlaggedOnly(false);
    setSelectedMethods(new Set());
    setPage(1);
  }

  if (!user.isLoggedIn) return null;

  const hasMore     = events.length === PAGE_SIZE;
  const hasFilters  = !!search || flaggedOnly || selectedMethods.size > 0;
  const startRow    = (page - 1) * PAGE_SIZE + 1;
  const endRow      = (page - 1) * PAGE_SIZE + events.length;

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-start gap-4"
      >
        <Button
          variant="ghost" size="sm"
          onClick={() => router.push(`/${workspace_uuid}/history`)}
          className="mt-0.5 gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
        >
          <ArrowLeft className="size-3.5" />
          History
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-blue-500" />
            <h1 className="text-xl font-semibold tracking-tight">Network Logs</h1>
          </div>
          <p className="text-muted-foreground mt-0.5 font-mono text-xs">
            {session_uuid}
          </p>
        </div>
      </motion.div>

      {/* Filter bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="flex flex-wrap items-center gap-2"
      >
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search host or URL…"
            className="pl-8 h-9 w-64 text-sm"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <AnimatePresence>
            {search && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => { setSearch(""); setPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Flagged-only toggle */}
        <Toggle
          variant="outline"
          pressed={flaggedOnly}
          onPressedChange={(v) => { setFlaggedOnly(v); setPage(1); }}
          className="h-9 gap-1.5 text-sm data-[state=on]:border-amber-400 data-[state=on]:bg-amber-50 data-[state=on]:text-amber-700 dark:data-[state=on]:bg-amber-950/40 dark:data-[state=on]:text-amber-400"
        >
          <Flag className="size-3.5" />
          Flagged only
        </Toggle>

        {/* Divider */}
        <div className="h-5 w-px bg-border shrink-0" />

        {/* Method filters */}
        {(["GET","POST","PUT","PATCH","DELETE"] as const).map((m) => (
          <button
            key={m}
            onClick={() => toggleMethod(m)}
            className={cn(
              "inline-flex items-center rounded px-2 py-1 text-[11px] font-semibold font-mono border cursor-pointer transition-all",
              selectedMethods.has(m)
                ? METHOD_COLORS[m] + " border-transparent ring-1 ring-current"
                : "bg-transparent border-border text-muted-foreground hover:border-muted-foreground/50"
            )}
          >
            {m}
          </button>
        ))}

        {/* Clear filters */}
        <AnimatePresence>
          {hasFilters && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 text-muted-foreground gap-1.5">
                <X className="size-3.5" />
                Clear filters
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Event count */}
        {!loading && events.length > 0 && (
          <span className="text-sm text-muted-foreground tabular-nums ml-auto">
            {hasMore ? `${startRow}–${endRow}+` : `${startRow}–${endRow}`} events
          </span>
        )}
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
              <TableHead className="w-[160px] tabular-nums">Timestamp</TableHead>
              <TableHead className="w-[70px]">Method</TableHead>
              <TableHead className="w-[260px]">Host</TableHead>
              <TableHead>URL</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 12 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className={cn("h-4", j === 3 ? "w-full" : j === 0 ? "w-32" : j === 4 ? "w-4" : "w-16")} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="size-12 rounded-xl bg-muted flex items-center justify-center">
                      {flaggedOnly
                        ? <Flag className="size-5 text-muted-foreground/50" />
                        : <Activity className="size-5 text-muted-foreground/50" />
                      }
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">
                      {flaggedOnly ? "No flagged events" : search ? "No events match your search" : "No network events recorded"}
                    </p>
                    {hasFilters && (
                      <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">
                        Clear filters
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              events.map((e, i) => (
                <motion.tr
                  key={e.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.008, duration: 0.15 }}
                  className={cn(
                    "border-b last:border-b-0 font-mono text-xs transition-colors",
                    e.flagged
                      ? "bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                      : "hover:bg-muted/30"
                  )}
                >
                  <TableCell className="tabular-nums text-muted-foreground whitespace-nowrap">
                    {format(new Date(e.timestamp), "HH:mm:ss.SSS")}
                  </TableCell>
                  <TableCell>
                    <MethodBadge method={e.method} />
                  </TableCell>
                  <TableCell className="text-foreground truncate max-w-[260px]">
                    <Tooltip>
                      <TooltipTrigger asChild><span className="truncate inline-block max-w-full">{e.host}</span></TooltipTrigger>
                      <TooltipContent>{e.host}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-muted-foreground break-all">
                    <Tooltip>
                      <TooltipTrigger asChild><span>{e.url}</span></TooltipTrigger>
                      <TooltipContent className="max-w-md break-all">{e.url}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-right pr-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => toggleFlag(e)}
                          className={cn(
                            "cursor-pointer rounded p-1 transition-colors",
                            e.flagged
                              ? "text-amber-500 hover:text-amber-600"
                              : "text-muted-foreground/30 hover:text-amber-400"
                          )}
                        >
                      <Flag className="size-3.5" />
                    </button>
                      </TooltipTrigger>
                      <TooltipContent>{e.flagged ? "Remove flag" : "Flag for review"}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </motion.tr>
              ))
            )}
          </TableBody>
        </Table>
      </motion.div>

      {/* Pagination */}
      {!loading && events.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex items-center justify-between"
        >
          <Button
            variant="outline" size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="gap-1.5"
          >
            <ChevronLeft className="size-3.5" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">Page {page}</span>
          <Button
            variant="outline" size="sm"
            disabled={!hasMore}
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
