"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { sessionsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CircuitBackground } from "@/components/ui/circuit-background";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 300_000; // 5 minutes

// Simple animated dots for the "Connecting" label
function BouncingDots() {
  return (
    <span className="inline-flex gap-[3px] items-end h-3 ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-[3px] h-[3px] rounded-full bg-current"
          style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </span>
  );
}

export default function LoadingPage() {
  const { session_uuid: uuid } = useParams<{ workspace_uuid: string; session_uuid: string }>();
  const router = useRouter();

  const [elapsed, setElapsed] = React.useState(0);
  const [status, setStatus] = React.useState<string>("pending");
  const [error, setError] = React.useState<string | null>(null);

  const startedAt = React.useRef(Date.now());

  // Tick elapsed timer every 500 ms
  React.useEffect(() => {
    const tick = setInterval(() => {
      setElapsed(Date.now() - startedAt.current);
    }, 500);
    return () => clearInterval(tick);
  }, []);

  // Poll session status
  React.useEffect(() => {
    if (!uuid) return;
    const poll = async () => {
      try {
        const res = await sessionsApi.getStatus(uuid);
        setStatus(res.status);
        if (res.status === "active") {
          router.replace(`/session/${uuid}`);
        }
      } catch {
        setError("Failed to check session status.");
      }
    };
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [uuid, router]);

  const timedOut = elapsed >= MAX_WAIT_MS;
  const elapsedSec = Math.floor(elapsed / 1000);
  // Progress bar: 90 s is "expected full" — caps at 95 % until actually done.
  const progress = Math.min((elapsed / 90_000) * 95, 95);

  return (
    <CircuitBackground
      background="#0d0d14"
      color="#CF7287"
      accentColor="#CF7287"
      pulseCount={18}
      density={0.45}
      gridSpacing={60}
      speed={0.85}
    >
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="relative w-full max-w-sm">
          {/* Glow backdrop */}
          <div className="absolute inset-0 rounded-2xl blur-2xl opacity-20 bg-[#CF7287]" />

          {/* Card */}
          <div className="relative rounded-2xl border border-[#CF728733] bg-[#12121e]/90 backdrop-blur-sm p-8 flex flex-col gap-6">

            {/* Icon / spinner */}
            <div className="flex justify-center">
              <div className="relative size-14 flex items-center justify-center">
                {/* Outer ring */}
                <svg className="absolute inset-0 size-full animate-spin" style={{ animationDuration: "2.5s" }} viewBox="0 0 56 56" fill="none">
                  <circle cx="28" cy="28" r="25" stroke="#CF728733" strokeWidth="2" />
                  <path d="M28 3 A25 25 0 0 1 53 28" stroke="#CF7287" strokeWidth="2" strokeLinecap="round" />
                </svg>
                {/* Inner ring counter-spin */}
                <svg className="absolute inset-[10px] size-[calc(100%-20px)] animate-spin" style={{ animationDuration: "1.8s", animationDirection: "reverse" }} viewBox="0 0 36 36" fill="none">
                  <circle cx="18" cy="18" r="15" stroke="#CF728722" strokeWidth="1.5" />
                  <path d="M18 3 A15 15 0 0 1 33 18" stroke="#CF7287" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
                </svg>
                {/* Center dot */}
                <div className="size-2 rounded-full bg-[#CF7287]" style={{ boxShadow: "0 0 8px #CF7287" }} />
              </div>
            </div>

            {/* Title */}
            <div className="text-center">
              <p className="text-xs tracking-[0.25em] uppercase text-[#CF7287]/60 mb-1">Open vBrowser</p>
              <h1 className="text-lg font-medium tracking-wide text-[#CF7287]">
                {error ? "Connection failed" : timedOut ? "Taking longer than expected" : (
                  <>Connecting<BouncingDots /></>
                )}
              </h1>
            </div>

            {/* Progress bar / status */}
            {!timedOut && !error && (
              <div className="flex flex-col gap-3">
                <div className="h-px w-full bg-[#CF728722] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#CF7287] rounded-full transition-all duration-500"
                    style={{
                      width: `${progress}%`,
                      boxShadow: "0 0 8px #CF7287",
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#CF7287]/40 font-mono">
                  <span>
                    {status === "pending" ? "PROVISIONING" : status.toUpperCase()}
                  </span>
                  <span>{elapsedSec}s</span>
                </div>
              </div>
            )}

            {/* Error / timeout state */}
            {(timedOut || error) && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-[#CF7287]/60 text-center leading-relaxed">
                  {error ?? "The container is taking longer than 5 minutes. You can wait or return home."}
                </p>
                <Button
                  variant="outline"
                  className="w-full border-[#CF728733] text-[#CF7287] hover:bg-[#CF728715]"
                  onClick={() => router.push("/")}
                >
                  Back to home
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </CircuitBackground>
  );
}
