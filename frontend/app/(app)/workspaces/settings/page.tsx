"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/store/WorkspaceContext";

/**
 * /workspaces/settings — redirects to the active workspace's settings page.
 * The sidebar links here so there's a stable URL regardless of which workspace is active.
 */
export default function WorkspaceSettingsRedirectPage() {
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();

  useEffect(() => {
    if (activeWorkspace) {
      router.replace(`/${activeWorkspace.uuid}/settings`);
    }
  }, [activeWorkspace]);

  return null;
}
