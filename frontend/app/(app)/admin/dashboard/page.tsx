"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceLine,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";
import {
  Activity,
  ArrowUpDown,
  Building2,
  CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  DollarSign,
  Filter,
  FolderOpen,
  Minus,
  Monitor,
  Search,
  TrendingDown,
  TrendingUp,
  User,
  X,
} from "lucide-react";

import type { DateRange } from "react-day-picker";

import { useAuthContext } from "@/store/AuthContext";
import {
  adminApi,
  type AdminAnalytics,
  type AnalyticsUserRow,
  type AnalyticsWorkspaceRow,
  type AnalyticsAppRow,
  type SessionsPerDayRow,
} from "@/lib/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider as ShadTooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Palette (mirrors the reference, but uses OVB CSS vars) ──────────────────

const mixBase = "var(--background)";
const palette = {
  primary: "var(--primary)",
  secondary: `color-mix(in oklch, var(--primary) 75%, ${mixBase})`,
  tertiary: `color-mix(in oklch, var(--primary) 55%, ${mixBase})`,
  quaternary: `color-mix(in oklch, var(--primary) 40%, ${mixBase})`,
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compactUsdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const numFmt = new Intl.NumberFormat("en-US");

function fmtDuration(s: number): string {
  if (!s) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  return `$${usd.toFixed(4)}`;
}

// ─── Scope selector types ─────────────────────────────────────────────────────

type ScopeUser = { id: number; email: string; name: string };
type ScopeWorkspace = { uuid: string; name: string };
type Scope =
  | { type: "global" }
  | { type: "user"; entity: ScopeUser }
  | { type: "workspace"; entity: ScopeWorkspace };

// ─── Date range picker ────────────────────────────────────────────────────────

function DateRangePicker({ value, onChange }: { value: DateRange | undefined; onChange: (r: DateRange | undefined) => void }) {
  const [open, setOpen] = React.useState(false);
  const label = value?.from
    ? value.to ? `${format(value.from, "MMM d")} – ${format(value.to, "MMM d, yyyy")}` : format(value.from, "MMM d, yyyy")
    : "All time";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs justify-start font-normal min-w-[150px]">
          <CalendarIcon className="size-3.5 text-muted-foreground shrink-0" />
          <span className={cn(!value?.from && "text-muted-foreground")}>{label}</span>
          {value?.from && (
            <X className="size-3 ml-auto text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onChange(undefined); }} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar mode="range" selected={value} onSelect={(r) => { onChange(r); if (r?.from && r?.to) setOpen(false); }} numberOfMonths={2} initialFocus />
      </PopoverContent>
    </Popover>
  );
}

// ─── Scope selector ───────────────────────────────────────────────────────────

function ScopeSelector({ scope, onSelect }: { scope: Scope; onSelect: (s: Scope) => void }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<{ users: ScopeUser[]; workspaces: ScopeWorkspace[] }>({ users: [], workspaces: [] });
  const [searching, setSearching] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults({ users: [], workspaces: [] }); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try { setResults(await adminApi.searchEntities(query.trim())); } catch { /* ignore */ } finally { setSearching(false); }
    }, 300);
  }, [query]);

  const label = scope.type === "global" ? "Global" : scope.type === "user" ? (scope.entity.name || scope.entity.email) : scope.entity.name;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs justify-between font-normal min-w-[140px]">
          <span className="flex items-center gap-1.5">
            {scope.type === "user" ? <User className="size-3.5 text-muted-foreground" /> : scope.type === "workspace" ? <Building2 className="size-3.5 text-muted-foreground" /> : <Activity className="size-3.5 text-muted-foreground" />}
            <span className="truncate max-w-[100px]">{label}</span>
          </span>
          <ChevronDown className="size-3 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input placeholder="Search users or workspaces…" className="pl-8 h-8 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          <button className={cn("flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent transition-colors", scope.type === "global" && "bg-accent")} onClick={() => { onSelect({ type: "global" }); setOpen(false); setQuery(""); }}>
            <Activity className="size-3.5 text-muted-foreground" /><span>Global (all data)</span>
          </button>
          {!query.trim() && <p className="px-2 py-3 text-xs text-muted-foreground text-center">Type to search</p>}
          {searching && <p className="px-2 py-3 text-xs text-muted-foreground text-center">Searching…</p>}
          {query.trim() && !searching && results.users.length === 0 && results.workspaces.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground text-center">No results</p>}
          {results.users.length > 0 && (
            <>
              <p className="px-2 pt-2 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Users</p>
              {results.users.map((u) => (
                <button key={u.id} className={cn("flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent transition-colors", scope.type === "user" && scope.entity.id === u.id && "bg-accent")} onClick={() => { onSelect({ type: "user", entity: u }); setOpen(false); setQuery(""); }}>
                  <User className="size-3.5 text-muted-foreground shrink-0" />
                  <div className="text-left min-w-0"><p className="truncate">{u.name || u.email}</p>{u.name && <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>}</div>
                </button>
              ))}
            </>
          )}
          {results.workspaces.length > 0 && (
            <>
              <p className="px-2 pt-2 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Workspaces</p>
              {results.workspaces.map((ws) => (
                <button key={ws.uuid} className={cn("flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent transition-colors", scope.type === "workspace" && scope.entity.uuid === ws.uuid && "bg-accent")} onClick={() => { onSelect({ type: "workspace", entity: ws }); setOpen(false); setQuery(""); }}>
                  <Building2 className="size-3.5 text-muted-foreground shrink-0" /><span className="truncate">{ws.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Stat cards ───────────────────────────────────────────────────────────────

type StatItem = {
  title: string;
  value: string;
  sub: string;
  trend: number | null; // positive = up, negative = down, null = neutral
  icon: React.ReactNode;
};

function StatCards({ data, loading }: { data: AdminAnalytics | null; loading: boolean }) {
  const items: StatItem[] = [
    {
      title: "Total Cost",
      value: data ? fmtCost(data.total_cost_usd) : "—",
      sub: "All tracked sessions",
      trend: null,
      icon: <DollarSign className="size-4" />,
    },
    {
      title: "Active Sessions",
      value: data ? numFmt.format(data.active_sessions) : "—",
      sub: "Running right now",
      trend: null,
      icon: <Activity className="size-4" />,
    },
    {
      title: "Total Sessions",
      value: data ? numFmt.format(data.total_sessions) : "—",
      sub: "All time",
      trend: null,
      icon: <Monitor className="size-4" />,
    },
    {
      title: "Avg Duration",
      value: data ? fmtDuration(data.avg_session_duration_seconds) : "—",
      sub: "Per closed session",
      trend: null,
      icon: <Clock className="size-4" />,
    },
    {
      title: "Open Cases",
      value: data ? numFmt.format(data.total_open_cases) : "—",
      sub: "Awaiting resolution",
      trend: null,
      icon: <FolderOpen className="size-4" />,
    },
    {
      title: "Workspaces",
      value: data ? numFmt.format(data.total_workspaces) : "—",
      sub: "Excluding personal",
      trend: null,
      icon: <Building2 className="size-4" />,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((stat) => {
        const Icon = stat.trend === null ? Minus : stat.trend > 0 ? TrendingUp : TrendingDown;
        return (
          <Card key={stat.title} className="@container/card shadow-none gap-3">
            <CardHeader className="pb-0">
              <CardDescription className="font-medium flex items-center gap-1.5">
                {stat.icon}{stat.title}
              </CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums @[200px]/card:text-3xl">
                {loading ? <Skeleton className="h-7 w-24" /> : stat.value}
              </CardTitle>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-0.5 text-xs pt-0">
              <div className="flex items-center gap-1 text-muted-foreground font-medium">
                <span>{stat.sub}</span>
                <Icon className="size-3 shrink-0" />
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Session trend line chart (real daily data) ───────────────────────────────

const sessionTrendConfig = {
  sessions: { label: "Sessions", color: palette.primary },
} satisfies ChartConfig;

function formatChartDate(dateStr: string) {
  // "YYYY-MM-DD" → "Jan 5", "Feb 20", etc.
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SessionTrendChart({ data, loading }: { data: AdminAnalytics | null; loading: boolean }) {
  const chartData: SessionsPerDayRow[] = data?.sessions_per_day ?? [];
  const totalSessions = chartData.reduce((s, d) => s + d.sessions, 0);
  const avgSessions = chartData.length > 0 ? totalSessions / chartData.length : 0;

  // Decide how many X-axis ticks to show based on data length
  const tickInterval = chartData.length <= 14 ? 0
    : chartData.length <= 60 ? Math.floor(chartData.length / 10)
    : Math.floor(chartData.length / 8);

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-xl border bg-card">
      <div className="flex h-14 items-center justify-between border-b px-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="icon" className="size-8" aria-label="Sessions">
            <Monitor className="size-4 text-muted-foreground" />
          </Button>
          <h2 className="text-sm font-medium">Session Activity</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-2 rounded-full" style={{ backgroundColor: palette.primary }} />
          <span className="text-xs text-muted-foreground">Sessions / day</span>
        </div>
      </div>
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          {loading ? <Skeleton className="h-7 w-24" /> : (
            <p className="text-2xl font-semibold tracking-tight">{numFmt.format(totalSessions)}</p>
          )}
          <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
            {chartData.length > 0
              ? `${chartData.length} day${chartData.length !== 1 ? "s" : ""} · avg ${avgSessions.toFixed(1)} / day`
              : "No sessions in range"}
          </p>
        </div>
        <div className="h-[180px] w-full min-w-0 sm:h-[220px]">
          {loading ? <Skeleton className="h-full w-full" /> : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">No data</p>
            </div>
          ) : (
            <ChartContainer config={sessionTrendConfig} className="h-full w-full">
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  dy={8}
                  interval={tickInterval}
                  tickFormatter={formatChartDate}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  dx={-5}
                  width={30}
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border bg-popover p-2 shadow-lg text-xs">
                        <p className="font-medium mb-1">{formatChartDate(label as string)}</p>
                        <div className="flex items-center gap-1.5">
                          <div className="size-2 rounded-full" style={{ backgroundColor: palette.primary }} />
                          <span className="text-muted-foreground">Sessions:</span>
                          <span className="font-medium">{numFmt.format(Number(payload[0].value))}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                {avgSessions > 0 && (
                  <ReferenceLine
                    y={avgSessions}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 3"
                    strokeOpacity={0.5}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="sessions"
                  stroke="var(--color-sessions)"
                  strokeWidth={2}
                  dot={chartData.length <= 30 ? { r: 3, fill: "var(--color-sessions)", strokeWidth: 0 } : false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Spend trend line chart ───────────────────────────────────────────────────

const spendTrendConfig = {
  cost_usd: { label: "Spend (USD)", color: "var(--chart-2)" },
} satisfies ChartConfig;

const ADMIN_SPEND_COLOR = "var(--chart-2)";

function SpendTrendChart({ data, loading }: { data: AdminAnalytics | null; loading: boolean }) {
  // Filter to days with actual spend so zero-days don't crush the Y scale
  const allData: SessionsPerDayRow[] = data?.sessions_per_day ?? [];
  const chartData = allData.filter((d) => (d.cost_usd ?? 0) > 0);
  const totalCost = allData.reduce((s, d) => s + (d.cost_usd ?? 0), 0);

  const tickInterval = chartData.length <= 14 ? 0
    : chartData.length <= 60 ? Math.floor(chartData.length / 10)
    : Math.floor(chartData.length / 8);

  const maxCost = chartData.length ? Math.max(...chartData.map((d) => d.cost_usd ?? 0)) : 0;
  const yFormatter = (v: number) =>
    maxCost < 0.01 ? `$${v.toFixed(4)}` : maxCost < 1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`;

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-xl border bg-card">
      <div className="flex h-14 items-center justify-between border-b px-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="icon" className="size-8" aria-label="Spend">
            <DollarSign className="size-4 text-muted-foreground" />
          </Button>
          <h2 className="text-sm font-medium">Daily Spend</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-2 rounded-full" style={{ backgroundColor: ADMIN_SPEND_COLOR }} />
          <span className="text-xs text-muted-foreground">USD / day</span>
        </div>
      </div>
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          {loading ? <Skeleton className="h-7 w-24" /> : (
            <p className="text-2xl font-semibold tracking-tight">${totalCost.toFixed(4)}</p>
          )}
          <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
            {chartData.length > 0 ? `${chartData.length} day${chartData.length !== 1 ? "s" : ""} with spend` : "No spend in range"}
          </p>
        </div>
        <div className="h-[180px] w-full min-w-0 sm:h-[220px]">
          {loading ? <Skeleton className="h-full w-full" /> : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">No spend data</p>
            </div>
          ) : (
            <ChartContainer config={spendTrendConfig} className="h-full w-full">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  dy={8}
                  interval={tickInterval}
                  tickFormatter={formatChartDate}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  dx={-5}
                  width={56}
                  domain={["auto", "auto"]}
                  tickFormatter={yFormatter}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border bg-popover p-2 shadow-lg text-xs">
                        <p className="font-medium mb-1">{formatChartDate(label as string)}</p>
                        <div className="flex items-center gap-1.5">
                          <div className="size-2 rounded-full" style={{ backgroundColor: ADMIN_SPEND_COLOR }} />
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
                  stroke={ADMIN_SPEND_COLOR}
                  strokeWidth={2}
                  dot={{ r: 4, fill: ADMIN_SPEND_COLOR, stroke: "var(--background)", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: ADMIN_SPEND_COLOR, stroke: "var(--background)", strokeWidth: 2 }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── App usage horizontal bar chart ──────────────────────────────────────────

const appChartConfig = { session_count: { label: "Sessions", color: palette.primary } } satisfies ChartConfig;

function AppUsageChart({ data, loading }: { data: AdminAnalytics | null; loading: boolean }) {
  const chartData = (data?.most_used_apps ?? []).slice(0, 8).map((a) => ({
    ...a,
    name: a.display_name || a.slug,
  }));
  const total = chartData.reduce((s, d) => s + d.session_count, 0);

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-xl border bg-card">
      <div className="flex h-14 items-center justify-between border-b px-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="icon" className="size-8" aria-label="App Usage">
            <Monitor className="size-4 text-muted-foreground" />
          </Button>
          <h2 className="text-sm font-medium">App Usage</h2>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {loading ? <Skeleton className="h-4 w-16 inline-block" /> : `${numFmt.format(total)} sessions`}
        </span>
      </div>
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="h-[220px] w-full min-w-0 sm:h-[260px]">
          {loading ? <Skeleton className="h-full w-full" /> : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No session data</div>
          ) : (
            <ChartContainer config={appChartConfig} className="h-full w-full">
              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis
                  type="category" dataKey="name" axisLine={false} tickLine={false}
                  tick={{ fontSize: 10 }} width={72} tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + "…" : v}
                />
                <ChartTooltip cursor={{ fillOpacity: 0.05 }} content={<ChartTooltipContent />} />
                <Bar dataKey="session_count" fill="var(--color-session_count)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Workspace radar chart ────────────────────────────────────────────────────

const wsRadarConfig = { session_count: { label: "Sessions", color: palette.primary } } satisfies ChartConfig;

function WorkspaceRadarChart({ data, loading }: { data: AdminAnalytics | null; loading: boolean }) {
  const radarData = (data?.most_active_workspaces ?? []).slice(0, 6).map((ws) => ({
    workspace: ws.name.length > 12 ? ws.name.slice(0, 12) + "…" : ws.name,
    session_count: ws.session_count,
  }));

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <Button variant="outline" size="icon" className="size-8" aria-label="Workspace Activity">
          <Building2 className="size-4 text-muted-foreground" />
        </Button>
        <h2 className="text-sm font-medium">Workspace Activity</h2>
      </div>
      <div className="mx-auto aspect-square max-h-[240px] w-full">
        {loading ? <Skeleton className="h-full w-full rounded-full" /> : radarData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No workspace data</div>
        ) : (
          <ChartContainer config={wsRadarConfig} className="h-full w-full">
            <RadarChart data={radarData}>
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <PolarAngleAxis dataKey="workspace" tick={{ fontSize: 10 }} />
              <PolarGrid />
              <Radar dataKey="session_count" fill="var(--color-session_count)" fillOpacity={0.5} stroke="var(--color-session_count)" strokeWidth={2} />
            </RadarChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}

// ─── Top workspaces by cost horizontal bar chart ──────────────────────────────

const wsCostChartConfig = { total_cost_usd: { label: "Cost (USD)", color: palette.primary } } satisfies ChartConfig;

function WorkspaceCostChart({ data, loading }: { data: AdminAnalytics | null; loading: boolean }) {
  const chartData = (data?.cost_per_workspace ?? []).slice(0, 6).map((ws) => ({
    ...ws,
    name: ws.name.length > 14 ? ws.name.slice(0, 14) + "…" : ws.name,
  }));
  const total = (data?.cost_per_workspace ?? []).reduce((s, w) => s + w.total_cost_usd, 0);

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="icon" className="size-8" aria-label="Cost by Workspace">
            <DollarSign className="size-4 text-muted-foreground" />
          </Button>
          <h2 className="text-sm font-medium">Cost by Workspace</h2>
        </div>
        {!loading && total > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">{fmtCost(total)} total</span>
        )}
      </div>
      <div className="h-[200px] w-full">
        {loading ? <Skeleton className="h-full w-full" /> : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No workspace cost data</div>
        ) : (
          <ChartContainer config={wsCostChartConfig} className="h-full w-full">
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
              <YAxis
                type="category" dataKey="name" axisLine={false} tickLine={false}
                tick={{ fontSize: 10 }} width={80}
              />
              <ChartTooltip
                cursor={{ fillOpacity: 0.05 }}
                content={<ChartTooltipContent formatter={(v) => fmtCost(Number(v))} />}
              />
              <Bar dataKey="total_cost_usd" fill="var(--color-total_cost_usd)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}

// ─── Active vs closed sessions donut ─────────────────────────────────────────

const sessionStatusColors = [palette.primary, palette.tertiary];
const sessionStatusConfig = {
  active: { label: "Active", color: palette.primary },
  closed: { label: "Closed", color: palette.tertiary },
} satisfies ChartConfig;

function SessionStatusChart({ data, loading }: { data: AdminAnalytics | null; loading: boolean }) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);

  const active = data?.active_sessions ?? 0;
  const total = data?.total_sessions ?? 0;
  const closed = Math.max(0, total - active);

  const pieData = [
    { key: "active", label: "Active", value: active },
    { key: "closed", label: "Closed", value: closed },
  ];

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <Button variant="outline" size="icon" className="size-8" aria-label="Session Status">
          <Activity className="size-4 text-muted-foreground" />
        </Button>
        <h2 className="text-sm font-medium">Session Status</h2>
      </div>

      <div className="relative mx-auto w-full max-w-[200px]">
        {loading ? <Skeleton className="aspect-square w-full rounded-full" /> : (
          <ChartContainer config={sessionStatusConfig} className="aspect-square w-full">
            <PieChart>
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={pieData} dataKey="value" nameKey="key"
                innerRadius="60%" outerRadius="85%" paddingAngle={2} strokeWidth={0}
                activeIndex={activeIndex ?? undefined}
                activeShape={({ outerRadius = 0, ...props }: PieSectorDataItem) => <Sector {...props} outerRadius={outerRadius + 8} />}
                onMouseEnter={(_, i) => setActiveIndex(i)} onMouseLeave={() => setActiveIndex(null)}
              >
                {pieData.map((entry, i) => (
                  <Cell key={entry.key} fill={sessionStatusColors[i]} fillOpacity={activeIndex !== null && activeIndex !== i ? 0.35 : 1} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] tracking-wider text-muted-foreground uppercase">Total</span>
          <span className="text-lg font-semibold tabular-nums">{numFmt.format(total)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {pieData.map((item, i) => (
          <button key={item.key} type="button"
            className={cn("flex items-center justify-between rounded-md px-1 py-0.5 transition-opacity", activeIndex !== null && activeIndex !== i && "opacity-40")}
            onPointerEnter={() => setActiveIndex(i)} onPointerLeave={() => setActiveIndex(null)}>
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: sessionStatusColors[i] }} />
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
            <span className="text-xs font-medium tabular-nums">{numFmt.format(item.value)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Sessions table (top users) ───────────────────────────────────────────────

type SortKey = "name" | "session_count" | "total_cost_usd";

function SessionsTable({ data, loading }: { data: AdminAnalytics | null; loading: boolean }) {
  const [search, setSearch] = React.useState("");
  const [costFilter, setCostFilter] = React.useState<"all" | "with-cost">("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(5);
  const [sortKey, setSortKey] = React.useState<SortKey>("session_count");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  const rows: AnalyticsUserRow[] = data?.most_active_users ?? [];

  const filtered = React.useMemo(() => rows.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
    const matchCost = costFilter === "all" || r.total_cost_usd > 0;
    return matchSearch && matchCost;
  }), [rows, search, costFilter]);

  const sorted = React.useMemo(() => [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") cmp = (a.name || a.email).localeCompare(b.name || b.email);
    else if (sortKey === "session_count") cmp = a.session_count - b.session_count;
    else cmp = a.total_cost_usd - b.total_cost_usd;
    return sortDir === "desc" ? -cmp : cmp;
  }), [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const hasFilters = costFilter !== "all";

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  function SortHead({ label, k, className }: { label: string; k: SortKey; className?: string }) {
    return (
      <TableHead className={cn("text-xs font-medium text-muted-foreground", className)}>
        <button type="button" className="inline-flex items-center gap-1 cursor-pointer" onClick={() => toggleSort(k)}>
          {label}<ArrowUpDown className="size-3 text-muted-foreground/60" />
        </button>
      </TableHead>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-medium">Top Users</h2>
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">{sorted.length}</span>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">Most active users by session count</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search users…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="h-8 pl-9 text-xs sm:w-[180px]" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs", hasFilters && "border-primary")}>
                <Filter className="size-3.5" /><span className="hidden sm:inline">Filter</span>
                {hasFilters && <span className="size-1.5 rounded-full bg-primary" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
              <DropdownMenuLabel>Filter</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={costFilter === "all"} onCheckedChange={() => setCostFilter("all")}>All users</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={costFilter === "with-cost"} onCheckedChange={() => setCostFilter("with-cost")}>With cost only</DropdownMenuCheckboxItem>
              {hasFilters && (<><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setCostFilter("all")} className="text-destructive"><X className="mr-2 size-4" />Clear</DropdownMenuItem></>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="overflow-x-auto pb-3">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <SortHead label="User" k="name" className="min-w-[160px]" />
              <SortHead label="Sessions" k="session_count" className="min-w-[90px]" />
              <SortHead label="Cost" k="total_cost_usd" className="min-w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{[160, 90, 100].map((w, j) => <TableCell key={j}><Skeleton className={`h-4 w-[${w}px]`} /></TableCell>)}</TableRow>
              ))
            ) : paginated.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="h-24 text-center text-sm text-muted-foreground">No users found.</TableCell></TableRow>
            ) : (
              paginated.map((u) => (
                <TableRow key={u.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-7">
                        <AvatarFallback className="text-xs">{(u.name || u.email).slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{u.name || u.email}</p>
                        {u.name && <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{numFmt.format(u.session_count)}</TableCell>
                  <TableCell className="text-xs tabular-nums font-mono">{fmtCost(u.total_cost_usd)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 border-t py-3 sm:flex-row">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Rows:</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="h-7 w-[60px]"><SelectValue /></SelectTrigger>
            <SelectContent>{[5, 10].map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <span>{sorted.length === 0 ? "0 of 0" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, sorted.length)} of ${sorted.length}`}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-7" onClick={() => setPage(1)} disabled={page === 1}><ChevronsLeft className="size-3.5" /></Button>
          <Button variant="outline" size="icon" className="size-7" onClick={() => setPage(page - 1)} disabled={page === 1}><ChevronLeft className="size-3.5" /></Button>
          <span className="px-2 text-xs">{page} / {totalPages}</span>
          <Button variant="outline" size="icon" className="size-7" onClick={() => setPage(page + 1)} disabled={page === totalPages}><ChevronRight className="size-3.5" /></Button>
          <Button variant="outline" size="icon" className="size-7" onClick={() => setPage(totalPages)} disabled={page === totalPages}><ChevronsRight className="size-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { user } = useAuthContext();
  const router = useRouter();

  const [scope, setScope] = React.useState<Scope>({ type: "global" });
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  const [analytics, setAnalytics] = React.useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (user && !user.isAdmin) router.replace("/");
  }, [user, router]);

  React.useEffect(() => {
    if (!user?.isAdmin) return;
    setLoading(true);
    const params: Parameters<typeof adminApi.getAnalytics>[0] = {};
    if (dateRange?.from) params.from_date = format(dateRange.from, "yyyy-MM-dd");
    if (dateRange?.to) params.to_date = format(dateRange.to, "yyyy-MM-dd");
    if (scope.type === "user") params.user_id = scope.entity.id;
    if (scope.type === "workspace") params.workspace_uuid = scope.entity.uuid;
    adminApi.getAnalytics(params).then(setAnalytics).catch(() => toast.error("Failed to load analytics")).finally(() => setLoading(false));
  }, [scope, dateRange, user]);

  const scopeLabel = scope.type === "global" ? null : scope.type === "user" ? (scope.entity.name || scope.entity.email) : scope.entity.name;

  return (
    <ShadTooltipProvider>
      {/* Page header */}
      <div className="flex w-full items-center gap-3 border-b bg-background px-4 py-4 sm:px-6 -mx-4 sm:-mx-6 mb-6 -mt-6">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-base font-medium">Dashboard Overview</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {scope.type === "global" ? "Platform-wide analytics" : scope.type === "user" ? `Scoped to: ${scopeLabel}` : `Workspace: ${scopeLabel}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <ScopeSelector scope={scope} onSelect={setScope} />
        </div>
      </div>

      {/* Scope badge */}
      {scope.type !== "global" && (
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="secondary" className="gap-1.5 text-xs pr-1">
            {scope.type === "user" ? <User className="size-3" /> : <Building2 className="size-3" />}
            {scopeLabel}
            <button className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5" onClick={() => setScope({ type: "global" })}>
              <X className="size-2.5" />
            </button>
          </Badge>
          <span className="text-xs text-muted-foreground">Scoped view — showing data for this {scope.type} only</span>
        </div>
      )}

      <div className="space-y-4 sm:space-y-6">
        {/* Stat cards */}
        <StatCards data={analytics} loading={loading} />

        {/* Charts row 1 — session + spend trends */}
        <div className="flex flex-col gap-4 sm:gap-6 xl:flex-row">
          <SessionTrendChart data={analytics} loading={loading} />
          <SpendTrendChart data={analytics} loading={loading} />
        </div>

        {/* Charts row 2 — app usage + workspace breakdowns */}
        <div className="flex flex-col gap-4 sm:gap-6 xl:flex-row">
          <AppUsageChart data={analytics} loading={loading} />
        </div>

        {/* Charts row 3 */}
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          <WorkspaceRadarChart data={analytics} loading={loading} />
          <SessionStatusChart data={analytics} loading={loading} />
          <WorkspaceCostChart data={analytics} loading={loading} />
        </div>

        {/* Sessions table */}
        <div className="rounded-xl border bg-card px-4 sm:px-6">
          <SessionsTable data={analytics} loading={loading} />
        </div>
      </div>
    </ShadTooltipProvider>
  );
}
