"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthContext } from "@/store/AuthContext";
import {
  sessionsApi, casesApi,
  type SessionDetail, type Note, type Tag, type Case, type TrafficEvent,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Flag, X,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const PING_INTERVAL_MS          = 10_000;
const POLL_INTERVAL_MS          = 5_000;
const SESSION_CHECK_INTERVAL_MS = 10_000;
const MAX_LIVE_EVENTS           = 200;

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
      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono shrink-0",
      METHOD_COLORS[m] ?? "bg-muted text-muted-foreground"
    )}>
      {m || "—"}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SessionPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const { user } = useAuthContext();
  const router = useRouter();

  // ── Session state ─────────────────────────────────────────────────────────
  const [session, setSession]       = React.useState<SessionDetail | null>(null);
  const [notes, setNotes]           = React.useState<Note[]>([]);
  const [tags, setTags]             = React.useState<Tag[]>([]);
  const [cases, setCases]           = React.useState<Case[]>([]);
  const [noteBody, setNoteBody]       = React.useState("");
  const [closing, setClosing]         = React.useState(false);
  const [elapsed, setElapsed]         = React.useState(0);
  const [remaining, setRemaining]     = React.useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const startedAt = React.useRef<Date | null>(null);
  const expiresAt = React.useRef<Date | null>(null);

  // ── Traffic drawer state ──────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen]         = React.useState(false);
  const [trafficEvents, setTrafficEvents]   = React.useState<TrafficEvent[]>([]);
  const [newEventCount, setNewEventCount]   = React.useState(0);   // unread badge when drawer is closed
  const [hasTrafficLog, setHasTrafficLog]   = React.useState(false);
  const lastEventIdRef                      = React.useRef<number>(0);
  const listEndRef                          = React.useRef<HTMLDivElement>(null);
  const flagging                            = React.useRef<Set<number>>(new Set());

  // ─────────────────────────────────────────────────────────────────────────
  // Load session
  // ─────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!user.isLoggedIn) { router.replace("/accounts/login/"); return; }
    loadSession();
  }, [user.isLoggedIn]);

  async function loadSession() {
    try {
      const s = await sessionsApi.get(uuid);

      // If the session is already closed, go straight to the history page
      if (!s.active) {
        if (s.workspace_uuid) {
          router.replace(`/${s.workspace_uuid}/history/${s.uuid}`);
        } else {
          router.replace("/");
        }
        return;
      }

      setSession(s);
      setHasTrafficLog(!!s.enable_traffic_log);
      if (s.start_time) startedAt.current = new Date(s.start_time);
      expiresAt.current = s.expires_at ? new Date(s.expires_at) : null;

      const [n, t, c] = await Promise.all([
        sessionsApi.getNotes(uuid),
        casesApi.listTags(),
        casesApi.list(),
      ]);
      setNotes(n); setTags(t); setCases(c);
    } catch {
      toast.error("Failed to load session");
      router.push("/");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Ping heartbeat — redirect to history when session terminates (404)
  // ─────────────────────────────────────────────────────────────────────────

  const redirectToHistory = React.useCallback((s: SessionDetail) => {
    if (s.workspace_uuid) {
      router.replace(`/${s.workspace_uuid}/history/${s.uuid}`);
    } else {
      router.replace("/");
    }
  }, [router]);

  React.useEffect(() => {
    if (!user.csrfToken || !session?.active) return;
    const ping = async () => {
      try {
        await sessionsApi.ping(uuid, user.csrfToken!);
      } catch (err: unknown) {
        // 404 means the session no longer exists on the server
        if (err instanceof Error && err.message.startsWith("API 404")) {
          redirectToHistory(session);
        }
      }
    };
    ping();
    const id = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [uuid, user.csrfToken, session?.active]);

  // ─────────────────────────────────────────────────────────────────────────
  // Session status polling — detect server-side termination (idle timeout etc.)
  // ─────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!session?.active) return;
    const check = async () => {
      try {
        const updated = await sessionsApi.get(uuid);
        if (!updated.active) {
          redirectToHistory(updated);
        }
      } catch {
        // Ignore transient errors; ping will catch hard 404s
      }
    };
    const id = setInterval(check, SESSION_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [uuid, session?.active]);

  // ─────────────────────────────────────────────────────────────────────────
  // Elapsed timer
  // ─────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    const id = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current.getTime());
      if (expiresAt.current) setRemaining(expiresAt.current.getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Traffic polling — always runs when network logging is on, regardless of
  // drawer open/closed state. Uses since_id to only fetch new rows each tick.
  // ─────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!hasTrafficLog || !session?.active) return;

    async function poll() {
      try {
        const newEvents = await sessionsApi.trafficLogs(uuid, {
          since_id: lastEventIdRef.current || undefined,
        });
        if (!newEvents.length) return;

        lastEventIdRef.current = newEvents[newEvents.length - 1].id;

        setTrafficEvents((prev) => {
          const merged = [...prev, ...newEvents];
          // Cap at MAX_LIVE_EVENTS — drop oldest
          return merged.length > MAX_LIVE_EVENTS
            ? merged.slice(merged.length - MAX_LIVE_EVENTS)
            : merged;
        });

        // Count unread only when drawer is closed
        setDrawerOpen((open) => {
          if (!open) setNewEventCount((c) => c + newEvents.length);
          return open;
        });
      } catch {
        // Silently ignore — don't disturb the session over a poll failure
      }
    }

    poll(); // immediate first fetch
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasTrafficLog, session?.active, uuid]);

  // Auto-scroll to bottom when drawer is open and new events arrive
  React.useEffect(() => {
    if (drawerOpen) listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [trafficEvents, drawerOpen]);

  // Clear unread count when drawer opens
  function openDrawer() {
    setNewEventCount(0);
    setDrawerOpen(true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Flagging
  // ─────────────────────────────────────────────────────────────────────────

  async function toggleFlag(event: TrafficEvent) {
    if (!user.csrfToken || flagging.current.has(event.id)) return;
    flagging.current.add(event.id);
    // Optimistic update
    setTrafficEvents((prev) =>
      prev.map((e) => e.id === event.id ? { ...e, flagged: !e.flagged } : e)
    );
    try {
      await sessionsApi.flagTrafficEvent(uuid, event.id, user.csrfToken);
    } catch {
      // Revert on failure
      setTrafficEvents((prev) =>
        prev.map((e) => e.id === event.id ? { ...e, flagged: event.flagged } : e)
      );
      toast.error("Failed to update flag");
    } finally {
      flagging.current.delete(event.id);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Session actions
  // ─────────────────────────────────────────────────────────────────────────

  async function closeSession() {
    if (!user.csrfToken) return;
    setClosing(true);
    try {
      await sessionsApi.delete(uuid, user.csrfToken);
      toast.success("Session closed");
      router.push("/");
    } catch {
      toast.error("Failed to close session");
      setClosing(false);
    }
  }

  async function addNote() {
    if (!noteBody.trim() || !user.csrfToken) return;
    try {
      const note = await sessionsApi.addNote(uuid, noteBody.trim(), user.csrfToken);
      setNotes((prev) => [...prev, note]);
      setNoteBody("");
    } catch {
      toast.error("Failed to add note");
    }
  }

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  };

  const formatRemaining = (ms: number) => {
    if (ms <= 0) return "0s";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading session…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">


      {/* ── Main area: iframe + sidebar ─────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 relative">

        {/* KasmVNC iframe */}
        <div className="flex-1 relative">
          {session.container_url ? (
            <iframe
              src={session.container_url}
              className="w-full h-full border-0"
              allow="microphone *; camera *; speaker-selection *; autoplay *; fullscreen *; clipboard-read *; clipboard-write *; display-capture *"
              allowFullScreen
              title="Browser session"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Session not ready</p>
            </div>
          )}
        </div>

        {/* Session panel — right-edge notch + slide-in drawer.
            No overlay: the browser iframe stays fully visible and interactive
            while the drawer is open. pointer-events-none on the wrapper lets
            clicks pass through to the iframe everywhere except the notch/panel. */}
        <motion.div
          className="absolute top-0 right-0 h-full z-30 flex pointer-events-none"
          animate={{ x: sidebarOpen ? 0 : 320 }}
          transition={{ type: "spring", stiffness: 340, damping: 30 }}
        >
          {/* Notch / handle (always visible, toggles the panel) */}
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? "Close session panel" : "Open session panel"}
            className="pointer-events-auto w-8 self-center h-16 flex items-center justify-center bg-background border border-r-0 rounded-l-md shadow-md hover:bg-muted/50 transition-colors cursor-pointer"
          >
            {sidebarOpen
              ? <ChevronRight className="size-4" />
              : <ChevronLeft className="size-4" />}
          </button>

          {/* Panel body */}
          <div className="pointer-events-auto w-80 h-full bg-background border-l flex flex-col overflow-hidden shadow-xl">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium capitalize">{session.type}</p>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Close panel"
                  className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {session.capacity_provider === "FARGATE_SPOT" ? "Spot" : "Standard"} •{" "}
                {formatElapsed(elapsed)}
              </p>
              {remaining !== null && (
                <p className={cn(
                  "text-xs font-medium",
                  remaining < 5 * 60 * 1000 ? "text-destructive" : "text-muted-foreground"
                )}>
                  Ends in {formatRemaining(remaining)}
                </p>
              )}
              {session.idle_timeout_minutes != null && (
                <p className="text-xs text-muted-foreground">
                  Idle timeout: {session.idle_timeout_minutes}m
                </p>
              )}
            </div>

            <ScrollArea className="flex-1 p-4">
              {/* Actions */}
              <div className="flex flex-col gap-2 mb-4">
                <Button variant="destructive" size="sm" onClick={closeSession} disabled={closing}>
                  {closing ? "Closing…" : "Close Session"}
                </Button>
              </div>

              <Separator className="my-3" />

              {/* Notes */}
              <p className="text-xs font-medium mb-2">Notes</p>
              <div className="flex flex-col gap-2 mb-3">
                {notes.map((n) => (
                  <div key={n.uuid} className="text-xs bg-muted rounded p-2">
                    <p>{n.body}</p>
                    <p className="text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <Textarea
                  placeholder="Add a note…"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
                <Button size="sm" onClick={addNote} disabled={!noteBody.trim()}>
                  Add Note
                </Button>
              </div>
            </ScrollArea>
          </div>
        </motion.div>
      </div>

      {/* ── Network log bottom drawer — notch + slide-up panel ──────────── */}
      {hasTrafficLog && (
        <motion.div
          className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center pointer-events-none"
          animate={{ y: drawerOpen ? 0 : 280 }}
          transition={{ type: "spring", stiffness: 340, damping: 30 }}
        >
          {/* Notch / handle — centered at bottom edge when closed, top of panel when open */}
          <button
            type="button"
            onClick={() => drawerOpen ? setDrawerOpen(false) : openDrawer()}
            aria-label={drawerOpen ? "Close network logs" : "Open network logs"}
            className="pointer-events-auto h-8 px-3 flex items-center justify-center gap-1.5 bg-background border border-b-0 rounded-t-md shadow-md hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <Activity className="size-3.5 text-blue-500" />
            <AnimatePresence>
              {!drawerOpen && newEventCount > 0 && (
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  className="inline-flex items-center rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums"
                >
                  +{newEventCount > 999 ? "999" : newEventCount}
                </motion.span>
              )}
            </AnimatePresence>
            {drawerOpen
              ? <ChevronDown className="size-3.5 text-muted-foreground" />
              : <ChevronUp className="size-3.5 text-muted-foreground" />}
          </button>

          {/* Panel body */}
          <div className="pointer-events-auto w-full h-[280px] bg-background border-t flex flex-col overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-1.5 border-b">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Network Logs</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {trafficEvents.length} events
                  {trafficEvents.length >= MAX_LIVE_EVENTS && " (last 200)"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close network logs"
                className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-xs">
              {trafficEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                  <Activity className="size-4 opacity-40" />
                  <span>Waiting for network events…</span>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                    <tr>
                      <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground w-[110px]">Time</th>
                      <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground w-[68px]">Method</th>
                      <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground w-[220px]">Host</th>
                      <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">URL</th>
                      <th className="px-2 py-1.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {trafficEvents.map((e) => (
                      <tr
                        key={e.id}
                        className={cn(
                          "border-b border-border/50 hover:bg-muted/30 transition-colors",
                          e.flagged && "bg-amber-50/60 dark:bg-amber-950/20"
                        )}
                      >
                        <td className="px-3 py-1 text-muted-foreground whitespace-nowrap tabular-nums">
                          {new Date(e.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td className="px-2 py-1">
                          <MethodBadge method={e.method} />
                        </td>
                        <td className="px-2 py-1 truncate max-w-[220px] text-foreground">
                          <Tooltip>
                            <TooltipTrigger asChild><span className="truncate inline-block max-w-full">{e.host}</span></TooltipTrigger>
                            <TooltipContent>{e.host}</TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-2 py-1 text-muted-foreground truncate max-w-xs">
                          <Tooltip>
                            <TooltipTrigger asChild><span className="truncate inline-block max-w-full">{e.url}</span></TooltipTrigger>
                            <TooltipContent className="max-w-md break-all">{e.url}</TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-2 py-1 text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => toggleFlag(e)}
                                className={cn(
                                  "cursor-pointer rounded p-0.5 transition-colors",
                                  e.flagged
                                    ? "text-amber-500 hover:text-amber-600"
                                    : "text-muted-foreground/30 hover:text-amber-400"
                                )}
                              >
                            <Flag className="size-3" />
                          </button>
                            </TooltipTrigger>
                            <TooltipContent>{e.flagged ? "Remove flag" : "Flag for review"}</TooltipContent>
                          </Tooltip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {/* Auto-scroll anchor */}
              <div ref={listEndRef} />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
