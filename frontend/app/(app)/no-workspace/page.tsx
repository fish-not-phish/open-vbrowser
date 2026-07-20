"use client";

import { useAuthContext } from "@/store/AuthContext";
import { motion } from "motion/react";
import { ShieldAlert } from "lucide-react";

export default function NoWorkspacePage() {
  const { user } = useAuthContext();

  return (
    <div className="flex flex-1 items-center justify-center min-h-[60dvh]">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col items-center gap-5 text-center max-w-sm px-4"
      >
        <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
          <ShieldAlert className="size-7 text-muted-foreground" />
        </div>

        <div className="space-y-2">
          <h1 className="text-lg font-semibold tracking-tight">No workspace access</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You don&apos;t have access to any workspaces yet.
            Contact your administrator to be added to a workspace.
          </p>
          {user.email && (
            <p className="text-xs text-muted-foreground pt-1">
              Signed in as <span className="font-medium text-foreground">{user.email}</span>
            </p>
          )}
        </div>

        <a
          href="/accounts/logout/"
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
        >
          Sign out
        </a>
      </motion.div>
    </div>
  );
}
