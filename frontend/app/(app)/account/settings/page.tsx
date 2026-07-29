"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useAuthContext } from "@/store/AuthContext";
import { accountApi, type MFAStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { baseUrlAccounts } from '@/constants/constants'
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  ShieldCheckIcon,
  ShieldAlertIcon,
  KeyRoundIcon,
  UserIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react";

// ─── Sub-sections ─────────────────────────────────────────────────────────────

function ProfileSection({
  csrfToken,
  initialFirstName,
  initialLastName,
  email,
}: {
  csrfToken: string;
  initialFirstName: string;
  initialLastName: string;
  email: string;
}) {
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFirstName(initialFirstName);
    setLastName(initialLastName);
  }, [initialFirstName, initialLastName]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!csrfToken) return;
    setSaving(true);
    try {
      await accountApi.updateProfile({ first_name: firstName, last_name: lastName }, csrfToken);
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
      <div className="flex flex-col space-y-1">
        <h3 className="font-semibold flex items-center gap-2">
          <UserIcon className="size-4" /> Profile
        </h3>
        <p className="text-muted-foreground text-sm">Update your display name.</p>
      </div>

      <div className="lg:col-span-2">
        <form onSubmit={save} className="flex flex-col gap-4 max-w-md">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={email} disabled className="opacity-60" />
            <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
          </div>
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordSection({ csrfToken }: { csrfToken: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const strength = useMemo(() => {
    if (!next) return 0;
    let s = 0;
    if (next.length >= 8) s++;
    if (/[A-Z]/.test(next)) s++;
    if (/[0-9]/.test(next)) s++;
    if (/[^A-Za-z0-9]/.test(next)) s++;
    return s;
  }, [next]);

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = [
    "",
    "bg-red-500",
    "bg-yellow-500",
    "bg-blue-400",
    "bg-green-500",
  ][strength];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (next.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      const res = await accountApi.changePassword(
        { current_password: current, new_password: next },
        csrfToken
      ) as { success: boolean; message?: string } | undefined;
      if (res && res.success === false) {
        toast.error(res.message ?? "Failed to change password");
      } else {
        toast.success("Password changed successfully");
        setCurrent(""); setNext(""); setConfirm("");
      }
    } catch {
      toast.error("Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
      <div className="flex flex-col space-y-1">
        <h3 className="font-semibold flex items-center gap-2">
          <LockIcon className="size-4" /> Password
        </h3>
        <p className="text-muted-foreground text-sm">
          Change your account password. Use a strong, unique password.
        </p>
      </div>

      <div className="lg:col-span-2">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
          <div className="space-y-1.5">
            <Label htmlFor="current_pw">Current password</Label>
            <div className="relative">
              <Input
                id="current_pw"
                type={showCurrent ? "text" : "password"}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => setShowCurrent((v) => !v)}
              >
                {showCurrent ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new_pw">New password</Label>
            <div className="relative">
              <Input
                id="new_pw"
                type={showNext ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => setShowNext((v) => !v)}
              >
                {showNext ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
            {next && (
              <div className="space-y-1 mt-1">
                <div className="flex gap-1 h-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-full transition-all ${
                        i <= strength ? strengthColor : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{strengthLabel}</p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm_pw">Confirm new password</Label>
            <div className="relative">
              <Input
                id="confirm_pw"
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => setShowConfirm((v) => !v)}
              >
                {showConfirm ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
            {confirm && next && (
              <p className={`text-xs ${next === confirm ? "text-green-500" : "text-red-500"}`}>
                {next === confirm ? "Passwords match" : "Passwords do not match"}
              </p>
            )}
          </div>

          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TwoFactorSection({
  mfaStatus,
  onRefresh,
}: {
  mfaStatus: MFAStatus | null;
  onRefresh: () => void;
}) {
  const oidcActive = mfaStatus?.oidc_active ?? false;
  const totpEnabled = mfaStatus?.totp_enabled ?? false;

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
      <div className="flex flex-col space-y-1">
        <h3 className="font-semibold flex items-center gap-2">
          <KeyRoundIcon className="size-4" /> Two-Factor Authentication
        </h3>
        <p className="text-muted-foreground text-sm">
          Manage TOTP authenticator app (2FA) for your account.
        </p>
      </div>

      <div className="lg:col-span-2">
        <div className="rounded-lg border p-5 space-y-4">
          {/* Status */}
          <div className="flex items-center gap-3">
            {totpEnabled ? (
              <>
                <ShieldCheckIcon className="size-5 text-green-500 shrink-0" />
                <div>
                  <p className="font-medium text-sm">Authenticator app is active</p>
                  <p className="text-xs text-muted-foreground">
                    Your account is protected with two-factor authentication.
                  </p>
                </div>
                <Badge variant="secondary" className="ml-auto bg-green-600/10 text-green-500 border-green-600/20">
                  Active
                </Badge>
              </>
            ) : (
              <>
                <ShieldAlertIcon className="size-5 text-yellow-500 shrink-0" />
                <div>
                  <p className="font-medium text-sm">Two-factor authentication is not enabled</p>
                  <p className="text-xs text-muted-foreground">
                    Add an extra layer of security to your account.
                  </p>
                </div>
                <Badge variant="secondary" className="ml-auto bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                  Inactive
                </Badge>
              </>
            )}
          </div>

          {oidcActive && (
            <div className="rounded-md bg-muted/50 border px-4 py-3 text-sm text-muted-foreground">
              MFA is enforced by your SSO/OIDC provider. Per-account TOTP settings are disabled while SSO is active.
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant={totpEnabled ? "outline" : "default"}
                      disabled={oidcActive}
                      onClick={() => {
                        window.location.href = totpEnabled
                          ? `${baseUrlAccounts}accounts/2fa/totp/deactivate/`
                          : `${baseUrlAccounts}accounts/2fa/totp/activate/`;
                      }}
                    >
                      {totpEnabled ? "Deactivate Authenticator" : "Enable Authenticator App"}
                    </Button>
                  </span>
                </TooltipTrigger>
                {oidcActive && (
                  <TooltipContent side="bottom">
                    MFA is enforced by your OIDC/SSO provider
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            {totpEnabled && !oidcActive && (
              <Button
                variant="ghost"
                onClick={() => {
                  window.location.href = `${baseUrlAccounts}accounts/2fa/`;
                }}
              >
                Manage Recovery Codes
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AccountSettingsPage() {
  const { user } = useAuthContext();
  const router = useRouter();

  const [profileData, setProfileData] = useState<{
    first_name: string;
    last_name: string;
    email: string;
  } | null>(null);
  const [mfaStatus, setMfaStatus] = useState<MFAStatus | null>(null);

  useEffect(() => {
    if (user.isLoggedIn === false) {
      router.replace("/accounts/login/");
      return;
    }
    if (user.isLoggedIn) loadData();
  }, [user.isLoggedIn]);

  async function loadData() {
    try {
      const [me, mfa] = await Promise.all([
        accountApi.me(),
        accountApi.getMFAStatus(),
      ]);
      setProfileData({
        first_name: me.first_name ?? "",
        last_name: me.last_name ?? "",
        email: me.email ?? "",
      });
      setMfaStatus(mfa);
    } catch {
      toast.error("Failed to load account data");
    }
  }

  if (!user.isLoggedIn) return null;

  return (
    <div className="w-full py-8">
      <div className="mx-auto min-h-screen max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight">Account Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your profile and security settings.
          </p>
        </div>

        <section className="py-2 space-y-0">
          {/* Profile */}
          <ProfileSection
            csrfToken={user.csrfToken}
            initialFirstName={profileData?.first_name ?? ""}
            initialLastName={profileData?.last_name ?? ""}
            email={profileData?.email ?? ""}
          />

          <Separator className="my-10" />

          {/* Password */}
          <PasswordSection csrfToken={user.csrfToken} />

          <Separator className="my-10" />

          {/* Two-Factor Auth */}
          <TwoFactorSection
            mfaStatus={mfaStatus}
            onRefresh={loadData}
          />

          <div className="py-10" />
        </section>
      </div>
    </div>
  );
}
