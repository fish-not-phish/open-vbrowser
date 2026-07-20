"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthContext } from "@/store/AuthContext";
import { useWorkspace } from "@/store/WorkspaceContext";
import { browsersApi, sessionsApi, type Browser } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Image from "next/image";
import { Globe, ShieldCheck, MessageSquare, Network, LayoutGrid, Loader2, Search, Zap, X, TriangleAlert, Activity, Lock, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

// ─── Apps that do not support network logging (mitmproxy) ─────────────────────
// ENABLE_TRAFFIC_LOG is forced to false for these regardless of the toggle.

const TRAFFIC_LOG_UNSUPPORTED = new Set([
  "kali", "telegram", "tor",
]);

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  browser:  { label: "Browsers",       icon: Globe,          color: "text-blue-500"   },
  security: { label: "Security",       icon: ShieldCheck,    color: "text-red-500"    },
  comms:    { label: "Communications", icon: MessageSquare,  color: "text-green-500"  },
  vpn:      { label: "VPN",            icon: Network,        color: "text-purple-500" },
};

// ─── Animation variants ───────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.04 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show:   { opacity: 1, y: 0,  scale: 1,   transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
  exit:   { opacity: 0, y: -8, scale: 0.95, transition: { duration: 0.15 } },
};

// ─── App card ─────────────────────────────────────────────────────────────────

function AppCard({ browser, launching, onLaunch }: {
  browser: Browser;
  launching: string | null;
  onLaunch: (b: Browser) => void;
}) {
  const isLaunching = launching === browser.slug;
  const isDisabled = !!launching;
  const meta = CATEGORY_META[browser.category];

  return (
    <motion.button
      layout
      variants={cardVariants}
      whileHover={isDisabled ? {} : { y: -3, transition: { type: "spring" as const, stiffness: 400, damping: 20 } }}
      whileTap={isDisabled ? {} : { scale: 0.96 }}
      onClick={() => !isDisabled && onLaunch(browser)}
      disabled={isDisabled}
      className={cn(
        "group relative flex flex-col items-center gap-3 rounded-2xl border bg-card p-4 text-left",
        "transition-colors duration-150",
        "hover:border-primary/40 hover:bg-accent/30 hover:shadow-lg hover:shadow-black/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        isLaunching && "border-primary/60 bg-primary/5"
      )}
    >
      {/* Category colour dots — one per category */}
      <div className="absolute top-2.5 right-2.5 flex gap-0.5">
        {browser.categories.map((cat) => {
          const m = CATEGORY_META[cat];
          return m ? (
            <span key={cat} className={cn("size-1.5 rounded-full opacity-60", m.color.replace("text-", "bg-"))} />
          ) : null;
        })}
      </div>

      {/* Icon */}
      <div className="relative size-12 flex-shrink-0 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {isLaunching ? (
            <motion.div
              key="spinner"
              initial={{ opacity: 0, rotate: -90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Loader2 className="size-8 text-primary animate-spin" />
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              <Image
                src={`/images/browsers/${browser.icon_filename}`}
                alt={browser.display_name}
                fill
                className="object-contain transition-transform duration-200 group-hover:scale-110"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/images/browsers/browser_transparent.png";
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Name */}
      <span className="text-xs font-medium text-center leading-snug line-clamp-2 w-full">
        {browser.display_name}
      </span>

      {/* Spot badge */}
      {browser.requires_spot && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 -mt-1">
          <Zap className="size-2.5 text-amber-500" />
          Spot
        </Badge>
      )}

      {/* Launch overlay */}
      <AnimatePresence>
        {isLaunching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 rounded-2xl bg-primary/5 flex items-end justify-center pb-2"
          >
            <span className="text-[10px] font-medium text-primary tracking-wide">Launching…</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { workspace_uuid } = useParams<{ workspace_uuid: string }>();
  const { user } = useAuthContext();
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspace();
  const router = useRouter();

  // Sync active workspace from URL param
  React.useEffect(() => {
    const ws = workspaces.find((w) => w.uuid === workspace_uuid);
    if (ws) setActiveWorkspace(ws);
  }, [workspace_uuid, workspaces]);

  const [allBrowsers, setAllBrowsers] = React.useState<Browser[]>([]);
  const [browsers, setBrowsers] = React.useState<Browser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [launching, setLaunching] = React.useState<string | null>(null);
  const [useSpot, setUseSpot] = React.useState(false);
  const [networkLogging, setNetworkLogging] = React.useState(false);
  const [fileProtection, setFileProtection] = React.useState(false);
  const [openUrl, setOpenUrl] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all");

  React.useEffect(() => {
    if (!user.isLoggedIn) {
      router.replace("/accounts/login/");
      return;
    }
    loadData();
  }, [user.isLoggedIn]);

  // Re-filter browsers when active workspace changes; also reset feature toggles
  React.useEffect(() => {
    if (!allBrowsers.length) return;
    const allowed = activeWorkspace?.allowed_browser_slugs ?? [];
    setBrowsers(allowed.length ? allBrowsers.filter((b) => allowed.includes(b.slug)) : allBrowsers);
    // Reset toggles — personal workspaces never have these features; team workspaces
    // only if the specific feature flag is off.
    if (activeWorkspace?.is_personal || !activeWorkspace?.enable_network_logging) setNetworkLogging(false);
    if (activeWorkspace?.is_personal || !activeWorkspace?.enable_file_protection) setFileProtection(false);
  }, [activeWorkspace, allBrowsers]);

  async function loadData() {
    try {
      const bs = await browsersApi.list();
      setAllBrowsers(bs);
      const allowed = activeWorkspace?.allowed_browser_slugs ?? [];
      setBrowsers(allowed.length ? bs.filter((b) => allowed.includes(b.slug)) : bs);
    } catch {
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  }

  async function launchSession(browser: Browser) {
    if (!user.csrfToken) {
      toast.error("Session expired — please refresh");
      return;
    }
    setLaunching(browser.slug);
    try {
      const session = await sessionsApi.create(
          {
            browser_type: browser.slug,
            auto_open_url: openUrl,
            session_type: useSpot || browser.requires_spot ? "vspot" : "vstandard",
            workspace_uuid: activeWorkspace?.is_personal ? undefined : activeWorkspace?.uuid,
            enable_traffic_log: networkLogging && !TRAFFIC_LOG_UNSUPPORTED.has(browser.slug),
            file_protection: fileProtection,
          },
          user.csrfToken
        );
      router.push(`/${workspace_uuid}/loading/${session.uuid}`);
    } catch (err: any) {
      const msg = err?.message?.includes("429")
        ? "You've reached the concurrent session limit"
        : "Failed to launch session";
      toast.error(msg);
    } finally {
      setLaunching(null);
    }
  }

  const categories = ["all", ...Array.from(new Set(browsers.flatMap((b) => b.categories))).sort()];

  const filteredBrowsers = React.useMemo(() => {
    let list = selectedCategory === "all" ? browsers : browsers.filter((b) => b.categories.includes(selectedCategory));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) => b.display_name.toLowerCase().includes(q));
    }
    if (networkLogging) {
      list = list.filter((b) => !TRAFFIC_LOG_UNSUPPORTED.has(b.slug));
    }
    return list;
  }, [browsers, selectedCategory, search, networkLogging]);

  if (!user.isLoggedIn) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-xl font-semibold tracking-tight">Applications</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Launch an isolated browser or application in a secure cloud session.
        </p>
      </motion.div>

      {/* Options bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="rounded-2xl border bg-card p-4 flex flex-wrap items-center gap-x-6 gap-y-3"
      >
        {/* Search */}
        <div className="flex-1 min-w-[180px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search applications…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
          <AnimatePresence>
            {search && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Starting URL */}
        <div className="flex-1 min-w-[200px] relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Starting URL (optional)"
            value={openUrl}
            onChange={(e) => setOpenUrl(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>

        {/* Spot toggle */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Switch id="spot-toggle" checked={useSpot} onCheckedChange={setUseSpot} />
          <Label htmlFor="spot-toggle" className="cursor-pointer flex items-center gap-1.5 text-sm select-none">
            <Zap className={cn("size-3.5 transition-colors", useSpot ? "text-amber-500" : "text-muted-foreground")} />
            Spot instances
          </Label>
        </div>

        {/* Network logging, file protection, and persistent storage toggles — only shown for team workspaces with the feature enabled */}
        {!activeWorkspace?.is_personal && (activeWorkspace?.enable_network_logging || activeWorkspace?.enable_file_protection) && (
          <>
            {/* Divider */}
            <div className="h-5 w-px bg-border shrink-0" />

            {activeWorkspace?.enable_network_logging && (
              <div className="flex items-center gap-2.5 shrink-0">
                <Switch id="network-logging-toggle" checked={networkLogging} onCheckedChange={setNetworkLogging} />
                <Label
                  htmlFor="network-logging-toggle"
                  className="cursor-pointer flex items-center gap-1.5 text-sm select-none"
                   title="Captures domain, HTTP method, and full URL for supported browsers. Not available for Kali, Telegram, or Tor."
                >
                  <Activity className={cn("size-3.5 transition-colors", networkLogging ? "text-blue-500" : "text-muted-foreground")} />
                  Network logging
                </Label>
              </div>
            )}

            {activeWorkspace?.enable_file_protection && (
              <div className="flex items-center gap-2.5 shrink-0">
                <Switch
                  id="file-protection-toggle"
                  checked={fileProtection}
                  onCheckedChange={(v) => {
                    setFileProtection(v);
                  }}
                />
                <Label
                  htmlFor="file-protection-toggle"
                  className="cursor-pointer flex items-center gap-1.5 text-sm select-none"
                  title="All downloaded files are 7z-encrypted and password-protected. Increases resource usage and adds latency to downloads."
                >
                  <Lock className={cn("size-3.5 transition-colors", fileProtection ? "text-green-500" : "text-muted-foreground")} />
                  File protection
                </Label>
              </div>
            )}

          </>
        )}
      </motion.div>

      {/* File protection info alert */}
      <AnimatePresence>
        {fileProtection && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-400">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <p>
                File protection zips and password-protects every downloaded file, which means each file is processed twice.
                Only files under 10 MB are supported — larger files may fail or be skipped.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category tabs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex flex-wrap gap-1.5"
      >
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat];
          const Icon = cat === "all" ? LayoutGrid : meta?.icon;
          const label = cat === "all" ? "All" : (meta?.label ?? cat);
          const count = cat === "all" ? browsers.length : browsers.filter((b) => b.categories.includes(cat)).length;
          const isActive = selectedCategory === cat;

          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "relative inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {Icon && <Icon className="size-3.5" />}
              {label}
              <span className={cn(
                "rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
                isActive ? "bg-white/20 text-primary-foreground" : "bg-background text-muted-foreground"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </motion.div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
            >
              <Skeleton className="h-[116px] rounded-2xl" />
            </motion.div>
          ))}
        </div>
      ) : filteredBrowsers.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 text-center gap-3"
        >
          <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
            <LayoutGrid className="size-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No applications found</p>
          {search && (
            <button onClick={() => setSearch("")} className="text-xs text-primary hover:underline">
              Clear search
            </button>
          )}
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3"
        >
          <AnimatePresence mode="popLayout">
            {filteredBrowsers.map((browser) => (
              <AppCard
                key={browser.slug}
                browser={browser}
                launching={launching}
                onLaunch={launchSession}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Legal disclaimer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-400"
      >
        <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
        <p>
          By launching a session you accept full responsibility for your actions and compliance with all applicable laws in your jurisdiction.
          We are not liable for any activity conducted through these sessions, any content accessed, or any files downloaded.
          Do not use this platform for unlawful purposes.
        </p>
      </motion.div>
    </div>
  );
}
