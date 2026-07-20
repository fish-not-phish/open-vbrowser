"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/store/WorkspaceContext";
import { Spinner } from "@/components/ui/spinner";

/**
 * Root app route — redirects to the active workspace launcher.
 * WorkspaceContext defaults to personal workspace on load, so this
 * lands at /{personal_workspace_uuid} immediately.
 */
export default function RootRedirect() {
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();

  useEffect(() => {
    if (activeWorkspace) {
      router.replace(`/${activeWorkspace.uuid}`);
    }
  }, [activeWorkspace]);

  return (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  );
}
