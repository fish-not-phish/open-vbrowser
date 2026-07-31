"use client";

import React from "react";
import { useAuthContext } from "@/store/AuthContext";
import { useRouter } from "next/navigation";
import { adminApi, browsersApi, type SiteSettings, type Browser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { motion } from "motion/react";
import {
  Save, RotateCcw, CheckCircle2, Eye, EyeOff, Copy, Activity, Lock, Cpu, HardDrive,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LimitSlider } from "@/components/ui/limit-slider";
import Image from "next/image";

// ─── Shared sub-components ────────────────────────────────────────────────────

function FieldRow({
  label, description, children,
}: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-8">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="shrink-0 w-64">{children}</div>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col space-y-1">
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

// ─── Browser grid ─────────────────────────────────────────────────────────────

function BrowserGrid({
  browsers,
  selectedSlugs,
  disabledSlugs,
  onToggle,
  emptyLabel,
}: {
  browsers: Browser[];
  selectedSlugs: string[];
  /** Slugs that cannot be toggled on (outside the parent allowlist) */
  disabledSlugs?: Set<string>;
  onToggle: (slug: string) => void;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
        {browsers.map((b) => {
          const selected = selectedSlugs.includes(b.slug);
          const locked = disabledSlugs?.has(b.slug) ?? false;
          return (
            <button
              key={b.slug}
              disabled={locked}
              onClick={() => !locked && onToggle(b.slug)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-all",
                selected ? "border-primary bg-primary/5" : "border-border bg-card opacity-50",
                !locked && "hover:opacity-100 hover:border-primary/60 cursor-pointer",
                locked && "cursor-not-allowed opacity-30"
              )}
            >
              <div className="relative size-8">
                <Image
                  src={`/images/browsers/${b.icon_filename}`}
                  alt={b.display_name} fill className="object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/images/browsers/browser_transparent.png";
                  }}
                />
              </div>
              <span className="text-[10px] font-medium leading-tight line-clamp-1">
                {b.display_name}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {selectedSlugs.length === 0 ? emptyLabel : `${selectedSlugs.length} selected.`}
      </p>
    </div>
  );
}

// ─── Fargate resource presets ─────────────────────────────────────────────────
// Valid Fargate CPU/memory combinations as paired presets.
// cpu is stored as vCPU (float), memory as GB (float).

interface ResourcePreset {
  label: string;
  vcpu: number;
  memory_gb: number;
}

const FARGATE_PRESETS: ResourcePreset[] = [
  // 0.5 vCPU — 1–4 GB
  { label: "0.5 vCPU / 1 GB",     vcpu: 0.5,  memory_gb: 1.0  },
  { label: "0.5 vCPU / 2 GB",     vcpu: 0.5,  memory_gb: 2.0  },
  { label: "0.5 vCPU / 3 GB",     vcpu: 0.5,  memory_gb: 3.0  },
  { label: "0.5 vCPU / 4 GB",     vcpu: 0.5,  memory_gb: 4.0  },
  // 1 vCPU — 2–8 GB
  { label: "1 vCPU / 2 GB",       vcpu: 1.0,  memory_gb: 2.0  },
  { label: "1 vCPU / 3 GB",       vcpu: 1.0,  memory_gb: 3.0  },
  { label: "1 vCPU / 4 GB",       vcpu: 1.0,  memory_gb: 4.0  },
  { label: "1 vCPU / 5 GB",       vcpu: 1.0,  memory_gb: 5.0  },
  { label: "1 vCPU / 6 GB",       vcpu: 1.0,  memory_gb: 6.0  },
  { label: "1 vCPU / 7 GB",       vcpu: 1.0,  memory_gb: 7.0  },
  { label: "1 vCPU / 8 GB",       vcpu: 1.0,  memory_gb: 8.0  },
  // 2 vCPU — 4–16 GB
  { label: "2 vCPU / 4 GB",       vcpu: 2.0,  memory_gb: 4.0  },
  { label: "2 vCPU / 5 GB",       vcpu: 2.0,  memory_gb: 5.0  },
  { label: "2 vCPU / 6 GB",       vcpu: 2.0,  memory_gb: 6.0  },
  { label: "2 vCPU / 7 GB",       vcpu: 2.0,  memory_gb: 7.0  },
  { label: "2 vCPU / 8 GB",       vcpu: 2.0,  memory_gb: 8.0  },
  { label: "2 vCPU / 9 GB",       vcpu: 2.0,  memory_gb: 9.0  },
  { label: "2 vCPU / 10 GB",      vcpu: 2.0,  memory_gb: 10.0 },
  { label: "2 vCPU / 11 GB",      vcpu: 2.0,  memory_gb: 11.0 },
  { label: "2 vCPU / 12 GB",      vcpu: 2.0,  memory_gb: 12.0 },
  { label: "2 vCPU / 13 GB",      vcpu: 2.0,  memory_gb: 13.0 },
  { label: "2 vCPU / 14 GB",      vcpu: 2.0,  memory_gb: 14.0 },
  { label: "2 vCPU / 15 GB",      vcpu: 2.0,  memory_gb: 15.0 },
  { label: "2 vCPU / 16 GB",      vcpu: 2.0,  memory_gb: 16.0 },
  // 4 vCPU — 8–30 GB
  { label: "4 vCPU / 8 GB",       vcpu: 4.0,  memory_gb: 8.0  },
  { label: "4 vCPU / 9 GB",       vcpu: 4.0,  memory_gb: 9.0  },
  { label: "4 vCPU / 10 GB",      vcpu: 4.0,  memory_gb: 10.0 },
  { label: "4 vCPU / 11 GB",      vcpu: 4.0,  memory_gb: 11.0 },
  { label: "4 vCPU / 12 GB",      vcpu: 4.0,  memory_gb: 12.0 },
  { label: "4 vCPU / 13 GB",      vcpu: 4.0,  memory_gb: 13.0 },
  { label: "4 vCPU / 14 GB",      vcpu: 4.0,  memory_gb: 14.0 },
  { label: "4 vCPU / 15 GB",      vcpu: 4.0,  memory_gb: 15.0 },
  { label: "4 vCPU / 16 GB",      vcpu: 4.0,  memory_gb: 16.0 },
  { label: "4 vCPU / 17 GB",      vcpu: 4.0,  memory_gb: 17.0 },
  { label: "4 vCPU / 18 GB",      vcpu: 4.0,  memory_gb: 18.0 },
  { label: "4 vCPU / 19 GB",      vcpu: 4.0,  memory_gb: 19.0 },
  { label: "4 vCPU / 20 GB",      vcpu: 4.0,  memory_gb: 20.0 },
  { label: "4 vCPU / 21 GB",      vcpu: 4.0,  memory_gb: 21.0 },
  { label: "4 vCPU / 22 GB",      vcpu: 4.0,  memory_gb: 22.0 },
  { label: "4 vCPU / 23 GB",      vcpu: 4.0,  memory_gb: 23.0 },
  { label: "4 vCPU / 24 GB",      vcpu: 4.0,  memory_gb: 24.0 },
  { label: "4 vCPU / 25 GB",      vcpu: 4.0,  memory_gb: 25.0 },
  { label: "4 vCPU / 26 GB",      vcpu: 4.0,  memory_gb: 26.0 },
  { label: "4 vCPU / 27 GB",      vcpu: 4.0,  memory_gb: 27.0 },
  { label: "4 vCPU / 28 GB",      vcpu: 4.0,  memory_gb: 28.0 },
  { label: "4 vCPU / 29 GB",      vcpu: 4.0,  memory_gb: 29.0 },
  { label: "4 vCPU / 30 GB",      vcpu: 4.0,  memory_gb: 30.0 },
];

function presetKey(vcpu: number, memory_gb: number) {
  return `${vcpu}|${memory_gb}`;
}

function ResourcePresetSelect({
  vcpu, memory_gb, onSelect,
}: { vcpu: number; memory_gb: number; onSelect: (preset: ResourcePreset) => void }) {
  const current = presetKey(vcpu, memory_gb);
  return (
    <Select
      value={current}
      onValueChange={(val) => {
        const preset = FARGATE_PRESETS.find((p) => presetKey(p.vcpu, p.memory_gb) === val);
        if (preset) onSelect(preset);
      }}
    >
      <SelectTrigger className="h-9 text-sm w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FARGATE_PRESETS.map((p) => (
          <SelectItem key={presetKey(p.vcpu, p.memory_gb)} value={presetKey(p.vcpu, p.memory_gb)}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const { user } = useAuthContext();
  const router = useRouter();

  const [settings, setSettings] = React.useState<SiteSettings | null>(null);
  const [original, setOriginal] = React.useState<SiteSettings | null>(null);
  const [browsers, setBrowsers] = React.useState<Browser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [oidcSecret, setOidcSecret] = React.useState("");
  const [showSecret, setShowSecret] = React.useState(false);

  React.useEffect(() => {
    if (user.isLoggedIn === false) { router.replace("/"); return; }
    if (user.isLoggedIn && !user.isAdmin) { router.replace("/"); return; }
    if (user.isLoggedIn && user.isAdmin) load();
  }, [user.isLoggedIn, user.isAdmin]);

  async function load() {
    try {
      const [data, allBrowsers] = await Promise.all([
        adminApi.getSiteSettings(),
        browsersApi.list(),
      ]);
      setSettings(data);
      setOriginal(data);
      setBrowsers(allBrowsers);
    } catch {
      toast.error("Failed to load site settings");
    } finally {
      setLoading(false);
    }
  }

  function update<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev);
    setSaved(false);
  }

  function toggleGlobalBrowser(slug: string) {
    if (!settings) return;
    const global = settings.global_allowed_browser_slugs ?? [];
    const next = global.includes(slug)
      ? global.filter((s) => s !== slug)
      : [...global, slug];

    // If the slug is removed from global, also remove from personal defaults
    const personalNext = (settings.default_personal_browser_slugs ?? []).filter((s) => next.includes(s));

    setSettings((prev) => prev ? {
      ...prev,
      global_allowed_browser_slugs: next,
      default_personal_browser_slugs: personalNext,
    } : prev);
    setSaved(false);
  }

  function togglePersonalBrowser(slug: string) {
    if (!settings) return;
    setSettings((prev) => {
      if (!prev) return prev;
      const personal = prev.default_personal_browser_slugs ?? [];
      const next = personal.includes(slug)
        ? personal.filter((s) => s !== slug)
        : [...personal, slug];
      return { ...prev, default_personal_browser_slugs: next };
    });
    setSaved(false);
  }

  async function save() {
    if (!settings || !user.csrfToken) return;
    setSaving(true);
    try {
      const payload: any = { ...settings };
      delete payload.oidc_client_secret_set;
      if (oidcSecret) payload.oidc_client_secret = oidcSecret;
      const updated = await adminApi.updateSiteSettings(payload, user.csrfToken);
      setSettings(updated);
      setOriginal(updated);
      setOidcSecret("");
      setSaved(true);
      toast.success("Settings saved");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setSettings(original);
    setOidcSecret("");
    setSaved(false);
  }

  const isDirty = JSON.stringify(settings) !== JSON.stringify(original) || !!oidcSecret;

  if (!user.isLoggedIn || !user.isAdmin) return null;

  // Slugs NOT in global list → cannot be added to personal defaults
  const personalDisabled = settings
    ? new Set(
        browsers
          .map((b) => b.slug)
          .filter((s) => (settings.global_allowed_browser_slugs ?? []).length > 0
            && !(settings.global_allowed_browser_slugs ?? []).includes(s))
      )
    : new Set<string>();

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-32">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Site Settings</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Global configuration for this instance.
          </p>
        </div>
      </motion.div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : settings ? (
        <div className="space-y-10">

          {/* Save/Reset bar — fixed to the viewport bottom so it never shifts content */}
          {isDirty && (
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-6 inset-x-0 z-50 px-4 pointer-events-none"
            >
              <div className="max-w-3xl mx-auto pointer-events-auto">
                <div className="flex items-center justify-end gap-2 rounded-xl border bg-card/90 px-4 py-3 shadow-lg backdrop-blur">
                  <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
                    <RotateCcw className="size-3.5" /> Reset
                  </Button>
                  <Button
                    size="sm" onClick={save}
                    disabled={!isDirty || saving}
                    className="gap-1.5 min-w-[90px]"
                  >
                    {saved
                      ? <><CheckCircle2 className="size-3.5" />Saved</>
                      : <><Save className="size-3.5" />{saving ? "Saving…" : "Save"}</>}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Registration ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
            <SectionHeader
              title="Registration"
              description="Control who can sign up and what they can do."
            />
            <div className="space-y-5 lg:col-span-2">
              <FieldRow
                label="Allow public registration"
                description="When disabled, only admins can create new accounts."
              >
                <Switch
                  checked={settings.allow_registration}
                  onCheckedChange={(v) => update("allow_registration", v)}
                />
              </FieldRow>
              <Separator />
              <FieldRow
                label="Allow personal workspaces"
                description="When disabled, no personal workspace is created for new users. Users with no workspace assignment will see a contact-admin page."
              >
                <Switch
                  checked={settings.allow_personal_workspaces}
                  onCheckedChange={(v) => update("allow_personal_workspaces", v)}
                />
              </FieldRow>
              <Separator />
              <FieldRow
                label="Allow workspace creation"
                description="When disabled, only admins can create new workspaces. Users can still be added to existing workspaces."
              >
                <Switch
                  checked={settings.allow_workspace_creation}
                  onCheckedChange={(v) => update("allow_workspace_creation", v)}
                />
              </FieldRow>
            </div>
          </div>

          <Separator />

          {/* ── Default session limits ────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
            <SectionHeader
              title="Default Session Limits"
              description="Site-wide fallbacks used when a workspace hasn't set its own limits."
            />
            <div className="space-y-5 lg:col-span-2">
              <FieldRow
                label="Idle timeout"
                description="Minutes of inactivity before a session closes."
              >
                <LimitSlider
                  value={settings.default_idle_timeout_minutes}
                  onChange={(v) => update("default_idle_timeout_minutes", v ?? 1)}
                  min={1} max={60} step={1} unit="min"
                  allowUnlimited={false}
                />
              </FieldRow>
              <Separator />
              <FieldRow
                label="Max concurrent sessions"
                description="Maximum active sessions per user."
              >
                <LimitSlider
                  value={settings.default_max_concurrent_sessions}
                  onChange={(v) => update("default_max_concurrent_sessions", v ?? 1)}
                  min={1} max={10} step={1} unit="sessions"
                  allowUnlimited={false}
                />
              </FieldRow>
              <Separator />
              <FieldRow
                label="Max session duration"
                description="Hard cap on session length. All the way right = no limit."
              >
                <LimitSlider
                  value={settings.default_max_session_duration_hours ?? null}
                  onChange={(v) => update("default_max_session_duration_hours", v)}
                  min={1} max={24} step={1} unit="hr"
                  unlimitedLabel="Unlimited"
                />
              </FieldRow>
            </div>
          </div>

          <Separator />

          {/* ── Application access ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
            <SectionHeader
              title="Application Access"
              description="Control which browsers are available across the instance."
            />
            <div className="space-y-8 lg:col-span-2">

              {/* Global allowlist */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Globally allowed apps</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Workspaces can only enable browsers from this set. Select none to allow all browsers everywhere.
                </p>
                <BrowserGrid
                  browsers={browsers}
                  selectedSlugs={settings.global_allowed_browser_slugs ?? []}
                  onToggle={toggleGlobalBrowser}
                  emptyLabel="All browsers are available to workspaces."
                />
              </div>

              <Separator />

              {/* Personal workspace defaults */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Default personal workspace apps</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Personal workspaces are pre-configured with these browsers. Must be a subset of globally allowed apps. Select none to inherit all globally allowed.
                </p>
                <BrowserGrid
                  browsers={browsers}
                  selectedSlugs={settings.default_personal_browser_slugs ?? []}
                  disabledSlugs={personalDisabled}
                  onToggle={togglePersonalBrowser}
                  emptyLabel={
                    (settings.global_allowed_browser_slugs ?? []).length === 0
                      ? "All browsers available to personal workspaces."
                      : "Inherits all globally allowed browsers."
                  }
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Session Features ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
            <SectionHeader
              title="Session Features"
              description="Enable or disable advanced session capabilities instance-wide. Workspace admins can then opt their workspaces in."
            />
            <div className="space-y-5 lg:col-span-2">
              <FieldRow
                label="Network logging"
                description="When enabled, workspace admins can allow members to capture network traffic logs for sessions."
              >
                <div className="flex items-center gap-2">
                  <Activity className={cn(
                    "size-4 transition-colors",
                    settings.enable_network_logging ? "text-blue-500" : "text-muted-foreground"
                  )} />
                  <Switch
                    checked={settings.enable_network_logging}
                    onCheckedChange={(v) => update("enable_network_logging", v)}
                  />
                </div>
              </FieldRow>
              <Separator />
              <FieldRow
                label="File protection"
                description="When enabled, workspace admins can allow members to use encrypted file protection for downloaded files."
              >
                <div className="flex items-center gap-2">
                  <Lock className={cn(
                    "size-4 transition-colors",
                    settings.enable_file_protection ? "text-green-500" : "text-muted-foreground"
                  )} />
                  <Switch
                    checked={settings.enable_file_protection}
                    onCheckedChange={(v) => update("enable_file_protection", v)}
                  />
                </div>
              </FieldRow>
              <Separator />
              <FieldRow
                label="Persistent storage"
                description="When enabled, workspace admins can allow members to mount per-workspace S3 storage at /config/Downloads for persistent files across sessions."
              >
                <div className="flex items-center gap-2">
                  <HardDrive className={cn(
                    "size-4 transition-colors",
                    settings.enable_persistent_storage ? "text-purple-500" : "text-muted-foreground"
                  )} />
                  <Switch
                    checked={settings.enable_persistent_storage}
                    onCheckedChange={(v) => update("enable_persistent_storage", v)}
                  />
                </div>
              </FieldRow>
            </div>
          </div>

          <Separator />

          {/* ── Resource Provisioning ────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
            <SectionHeader
              title="Resource Provisioning"
              description="ECS Fargate CPU and memory allocated to new sessions. Changes apply to future sessions only."
            />
            <div className="space-y-5 lg:col-span-2">
              <FieldRow
                label="Standard browsers"
                description="Chrome, Firefox, and other browser-based apps."
              >
                <ResourcePresetSelect
                  vcpu={settings.browser_vcpu}
                  memory_gb={settings.browser_memory_gb}
                  onSelect={(p) => {
                    update("browser_vcpu", p.vcpu);
                    update("browser_memory_gb", p.memory_gb);
                  }}
                />
              </FieldRow>
              <Separator />
              <FieldRow
                label="OS-based apps"
                description="Kali, Ubuntu, Alpine, and other full OS sessions."
              >
                <ResourcePresetSelect
                  vcpu={settings.os_vcpu}
                  memory_gb={settings.os_memory_gb}
                  onSelect={(p) => {
                    update("os_vcpu", p.vcpu);
                    update("os_memory_gb", p.memory_gb);
                  }}
                />
              </FieldRow>
            </div>
          </div>

          <Separator />

          {/* ── OIDC / SSO ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
            <SectionHeader
              title="OIDC / SSO"
              description="Configure single sign-on via an external identity provider."
            />
            <div className="space-y-5 lg:col-span-2">
              <FieldRow label="Enable OIDC" description="Allow users to sign in via your identity provider.">
                <Switch
                  checked={settings.oidc_enabled}
                  onCheckedChange={(v) => update("oidc_enabled", v)}
                />
              </FieldRow>

              <Separator />

              <FieldRow
                label="Provider ID"
                description="A unique slug identifying this provider (e.g. my-server). Used in the callback URL."
              >
                <Input
                  placeholder="my-server"
                  value={settings.oidc_provider_type}
                  onChange={(e) => update("oidc_provider_type", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  disabled={!settings.oidc_enabled}
                  className="h-9 text-sm font-mono"
                />
              </FieldRow>

              {settings.oidc_enabled && settings.oidc_provider_type && (
                <>
                  <Separator />
                  <FieldRow
                    label="Callback URL"
                    description="Register this with your identity provider as the redirect/callback URI."
                  >
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-xs font-mono text-muted-foreground break-all select-all">
                        {`${typeof window !== "undefined" ? window.location.origin : ""}/accounts/oidc/${settings.oidc_provider_type}/login/callback/`}
                      </code>
                      <button
                        type="button"
                        className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/accounts/oidc/${settings.oidc_provider_type}/login/callback/`);
                          toast.success("Copied to clipboard");
                        }}
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </div>
                  </FieldRow>
                </>
              )}

              <Separator />

              <FieldRow label="Client ID" description="The client ID registered with your identity provider.">
                <Input
                  placeholder="client-id"
                  value={settings.oidc_client_id}
                  onChange={(e) => update("oidc_client_id", e.target.value)}
                  disabled={!settings.oidc_enabled}
                  className="h-9 text-sm"
                />
              </FieldRow>

              <Separator />

              <FieldRow
                label="Client secret"
                description={
                  settings.oidc_client_secret_set
                    ? "A secret is currently set. Enter a new value to replace it."
                    : "The client secret from your identity provider."
                }
              >
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    placeholder={settings.oidc_client_secret_set ? "••••••••" : "Enter secret…"}
                    value={oidcSecret}
                    onChange={(e) => { setOidcSecret(e.target.value); setSaved(false); }}
                    disabled={!settings.oidc_enabled}
                    className="h-9 text-sm pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
                {settings.oidc_client_secret_set && !oidcSecret && (
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-green-500" />
                    Secret is set
                  </p>
                )}
              </FieldRow>

              <Separator />

              <FieldRow
                label="Server URL"
                description="The .well-known/openid-configuration URL of your provider."
              >
                <Input
                  placeholder="https://auth.example.com/realms/main"
                  value={settings.oidc_server_url}
                  onChange={(e) => update("oidc_server_url", e.target.value)}
                  disabled={!settings.oidc_enabled}
                  className="h-9 text-sm"
                />
              </FieldRow>
            </div>
          </div>

        </div>
      ) : null}
    </div>
  );
}
