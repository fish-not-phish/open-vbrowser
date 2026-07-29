"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { workspacesApi, type WorkspaceDashboard } from "@/lib/api";
import { useAuthContext } from "@/store/AuthContext";
import { useWorkspace } from "@/store/WorkspaceContext";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  Clock,
  DollarSign,
  FolderOpen,
  Monitor,
  Users,
  Zap,
  CheckCircle2,
  Circle,
  Archive,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { motion } from "motion/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Cell,
  Line,
  LineChart,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds === 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return format(new Date(iso), "MMM d · HH:mm");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={cn("rounded-md p-1.5", accent ?? "bg-muted")}>
          <Icon className="size-4 text-foreground/70" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Skeleton layout ──────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    </div>
  );
}

// ─── Capacity badge ───────────────────────────────────────────────────────────

function CapacityBadge({ provider }: { provider: string | null }) {
  const isSpot = provider?.toLowerCase().includes("spot");
  return (
    <Badge variant="outline" className="text-xs gap-1">
      {isSpot ? <Zap className="size-2.5" /> : <Monitor className="size-2.5" />}
      {isSpot ? "Spot" : "Standard"}
    </Badge>
  );
}

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    owner: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    admin: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    member: "bg-muted text-muted-foreground",
    analyst: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    viewer: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  };
  return (
    <Badge variant="outline" className={cn("text-xs capitalize", colors[role] ?? colors.member)}>
      {role}
    </Badge>
  );
}

// ─── Case status icon ─────────────────────────────────────────────────────────

function CaseStatusIcon({ status }: { status: string }) {
  if (status === "open") return <Circle className="size-3 text-green-500 fill-green-500" />;
  if (status === "closed") return <CheckCircle2 className="size-3 text-muted-foreground" />;
  return <Archive className="size-3 text-muted-foreground" />;
}

// ─── Sparkline chart ─────────────────────────────────────────────────────────

const sparkConfig: ChartConfig = {
  sessions: { label: "Sessions", color: "var(--primary)" },
};

function SparklineChart({ data }: { data: { date: string; sessions: number }[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-28 text-sm text-muted-foreground">
        No session data yet
      </div>
    );
  }
  return (
    <ChartContainer config={sparkConfig} className="h-28 w-full">
      <BarChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => format(new Date(v), "M/d")}
        />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(l) => format(new Date(l), "MMM d, yyyy")}
            />
          }
        />
        <Bar dataKey="sessions" radius={[3, 3, 0, 0]} fill="var(--primary)" />
      </BarChart>
    </ChartContainer>
  );
}

// ─── Spend per day line chart ─────────────────────────────────────────────────

const spendConfig: ChartConfig = {
  cost_usd: { label: "Spend (USD)", color: "var(--chart-2)" },
};

const SPEND_COLOR = "var(--chart-2)";

function SpendChart({ data }: { data: { date: string; sessions: number; cost_usd: number }[] }) {
  // Only plot days that actually had spend — zero-cost days collapse the Y scale
  const spendData = data.filter((d) => d.cost_usd > 0);
  const totalCost = spendData.reduce((s, d) => s + d.cost_usd, 0);

  if (!spendData.length) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No spend data yet
      </div>
    );
  }

  // Format Y-axis labels at the right precision for the scale
  const maxCost = Math.max(...spendData.map((d) => d.cost_usd));
  const yFormatter = (v: number) =>
    maxCost < 0.01 ? `$${v.toFixed(4)}` : maxCost < 1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`;

  return (
    <ChartContainer config={spendConfig} className="h-40 w-full">
      <LineChart data={spendData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => format(new Date(v), "M/d")}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10 }}
          width={56}
          domain={["auto", "auto"]}
          tickFormatter={yFormatter}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border bg-popover p-2 shadow-lg text-xs">
                <p className="font-medium mb-1">{format(new Date(label), "MMM d, yyyy")}</p>
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full" style={{ backgroundColor: SPEND_COLOR }} />
                  <span className="text-muted-foreground">Spend:</span>
                  <span className="font-medium">${Number(payload[0].value).toFixed(4)}</span>
                </div>
              </div>
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="cost_usd"
          stroke={SPEND_COLOR}
          strokeWidth={2}
          dot={{ r: 4, fill: SPEND_COLOR, stroke: "var(--background)", strokeWidth: 2 }}
          activeDot={{ r: 6, fill: SPEND_COLOR, stroke: "var(--background)", strokeWidth: 2 }}
        />
      </LineChart>
    </ChartContainer>
  );
}

// ─── Top apps chart ───────────────────────────────────────────────────────────

const appsConfig: ChartConfig = {
  count: { label: "Sessions", color: "var(--primary)" },
};

const APP_COLORS = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function TopAppsChart({ data }: { data: { type: string; count: number }[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-28 text-sm text-muted-foreground">
        No sessions yet
      </div>
    );
  }
  return (
    <ChartContainer config={appsConfig} className="h-28 w-full">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
        <YAxis dataKey="type" type="category" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={56} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" radius={[0, 3, 3, 0]}>
          {data.map((_, idx) => (
            <Cell key={idx} fill={APP_COLORS[idx % APP_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { workspace_uuid } = useParams<{ workspace_uuid: string }>();
  const { user } = useAuthContext();
  const { setActiveWorkspace, workspaces } = useWorkspace();
  const router = useRouter();

  const [data, setData] = React.useState<WorkspaceDashboard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Sync active workspace from URL
  React.useEffect(() => {
    const ws = workspaces.find((w) => w.uuid === workspace_uuid);
    if (ws) setActiveWorkspace(ws);
  }, [workspace_uuid, workspaces, setActiveWorkspace]);

  // Auth guard
  React.useEffect(() => {
    if (user.isLoggedIn === false) {
      window.location.replace("/accounts/login/");
    }
  }, [user.isLoggedIn]);

  React.useEffect(() => {
    if (!workspace_uuid) return;
    setLoading(true);
    setError(null);
    workspacesApi
      .getDashboard(workspace_uuid)
      .then(setData)
      .catch((e) => setError(e?.message ?? "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [workspace_uuid]);

  if (user.isLoggedIn !== true) return null;

  const isPrivileged = data?.role === "owner" || data?.role === "admin";

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.is_personal ? "Your personal workspace" : isPrivileged ? "Workspace overview" : "Your activity"}
            {" · "}Last 30 days
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push(`/${workspace_uuid}`)}>
          <Monitor className="size-3.5 mr-1.5" />
          Launch App
        </Button>
      </div>

      {loading && <DashboardSkeleton />}
      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-6 text-center text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {data && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="space-y-6"
        >
          {/* ── Stat cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Active Sessions"
              value={String(data.stats.active_sessions)}
              sub={data.stats.active_sessions === 1 ? "session running now" : "sessions running now"}
              icon={Activity}
              accent="bg-green-500/10"
            />
            <StatCard
              label="Sessions (30d)"
              value={String(data.stats.total_sessions_30d)}
              sub="total launched"
              icon={Monitor}
              accent="bg-primary/10"
            />
            <StatCard
              label="Avg. Duration"
              value={formatDuration(data.stats.avg_duration_seconds)}
              sub="per completed session"
              icon={Clock}
              accent="bg-blue-500/10"
            />
            <StatCard
              label="Cost (30d)"
              value={formatCost(data.stats.total_cost_30d_usd)}
              sub="across completed sessions"
              icon={DollarSign}
              accent="bg-amber-500/10"
            />
          </div>

          {/* ── Activity + Spend charts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sessions per day */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="size-4 text-muted-foreground" />
                  Sessions per day (14d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SparklineChart data={data.sessions_per_day} />
              </CardContent>
            </Card>

            {/* Spend per day */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="size-4 text-muted-foreground" />
                  Spend per day (14d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SpendChart data={data.sessions_per_day} />
              </CardContent>
            </Card>
          </div>

          {/* ── Active sessions ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active sessions */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="size-4 text-green-500" />
                    Active now
                  </CardTitle>
                  {data.active_sessions.length > 0 && (
                    <span className="flex size-2 rounded-full bg-green-500 animate-pulse" />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {data.active_sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No active sessions</p>
                ) : (
                  <ul className="space-y-2">
                    {data.active_sessions.map((s) => (
                      <li
                        key={s.uuid}
                        className="flex items-center justify-between gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/60 transition-colors"
                        onClick={() => router.push(`/session/${s.uuid}`)}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="flex size-1.5 rounded-full bg-green-500" />
                          <span className="font-medium truncate">{s.type ?? "unknown"}</span>
                          {isPrivileged && s.user_email && (
                            <span className="text-muted-foreground text-xs truncate">{s.user_email}</span>
                          )}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <CapacityBadge provider={s.capacity_provider} />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {s.start_time ? timeAgo(s.start_time) : "—"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Recent history + Cases + Top apps ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent history */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Recent sessions</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 gap-1"
                    onClick={() => router.push(`/${workspace_uuid}/history`)}
                  >
                    View all <ArrowRight className="size-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {data.recent_history.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No sessions yet</p>
                ) : (
                  <ul>
                    {data.recent_history.map((s, i) => (
                      <React.Fragment key={s.uuid}>
                        {i > 0 && <Separator />}
                        <li
                          className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-muted/50 transition-colors cursor-pointer text-sm"
                          onClick={() => router.push(`/${workspace_uuid}/history/${s.uuid}`)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {s.active ? (
                              <span className="flex size-1.5 rounded-full bg-green-500 shrink-0" />
                            ) : (
                              <span className="flex size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                            )}
                            <span className="font-medium truncate">{s.type ?? "unknown"}</span>
                            {isPrivileged && s.user_email && (
                              <span className="text-muted-foreground text-xs truncate">{s.user_email}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                            {s.case_name && (
                              <span className="flex items-center gap-1">
                                <FolderOpen className="size-3" />
                                <span className="truncate max-w-[80px]">{s.case_name}</span>
                              </span>
                            )}
                            <CapacityBadge provider={s.capacity_provider} />
                            <span>{formatDuration(s.duration_seconds)}</span>
                            {s.session_cost_usd && (
                              <span className="text-amber-600">{formatCost(parseFloat(s.session_cost_usd))}</span>
                            )}
                            <span className="hidden sm:inline">{formatDate(s.start_time)}</span>
                          </div>
                        </li>
                      </React.Fragment>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Cases + Top apps stacked */}
            <div className="space-y-6">
              {/* Cases summary */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <FolderOpen className="size-4 text-muted-foreground" />
                      Cases
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 gap-1"
                      onClick={() => router.push(`/${workspace_uuid}/cases`)}
                    >
                      View all <ArrowRight className="size-3" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Counts */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-md bg-green-500/10 py-2">
                      <div className="font-bold text-base text-green-600">{data.cases.open}</div>
                      <div className="text-muted-foreground mt-0.5">Open</div>
                    </div>
                    <div className="rounded-md bg-muted py-2">
                      <div className="font-bold text-base">{data.cases.closed}</div>
                      <div className="text-muted-foreground mt-0.5">Closed</div>
                    </div>
                    <div className="rounded-md bg-muted py-2">
                      <div className="font-bold text-base">{data.cases.archived}</div>
                      <div className="text-muted-foreground mt-0.5">Archived</div>
                    </div>
                  </div>
                  {/* Recent cases */}
                  {data.cases.recent.length > 0 && (
                    <ul className="space-y-1.5 pt-1">
                      {data.cases.recent.map((c) => (
                        <li
                          key={c.uuid}
                          className="flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-0.5 hover:bg-muted/60 transition-colors"
                          onClick={() => router.push(`/${workspace_uuid}/cases/${c.uuid}`)}
                        >
                          <CaseStatusIcon status={c.status} />
                          <span className="truncate flex-1">{c.name}</span>
                          <span className="text-muted-foreground shrink-0">{timeAgo(c.updated_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Top apps */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Monitor className="size-4 text-muted-foreground" />
                    Top apps (30d)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TopAppsChart data={data.top_apps} />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ── Members (privileged only, team workspaces) ── */}
          {isPrivileged && !data.is_personal && data.members.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    Members
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 gap-1"
                    onClick={() => router.push(`/${workspace_uuid}/settings`)}
                  >
                    Manage <ArrowRight className="size-3" />
                  </Button>
                </div>
                <CardDescription className="text-xs">{data.members.length} member{data.members.length !== 1 ? "s" : ""}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {data.members.map((m) => (
                    <li
                      key={m.user_id}
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="truncate text-sm">{m.email}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {m.active_sessions > 0 && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <span className="flex size-1.5 rounded-full bg-green-500" />
                            {m.active_sessions}
                          </span>
                        )}
                        <RoleBadge role={m.role} />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}
    </div>
  );
}
