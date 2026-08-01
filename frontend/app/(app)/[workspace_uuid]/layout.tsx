"use client";

import { useParams, notFound } from "next/navigation";
import { useWorkspace } from "@/store/WorkspaceContext";
import { Spinner } from "@/components/ui/spinner";

// The [workspace_uuid] dynamic segment matches ANY single path segment, so this
// layout is the single gatekeeper for every /<uuid>/... route. A path only renders
// the workspace pages if the UUID corresponds to a workspace the current user can
// actually access. Anything else — a typo, a malformed value, or a valid UUID that
// isn't one of their workspaces — triggers next/navigation's notFound(), which
// renders the root app/not-found.tsx OUTSIDE the (app) shell, so the sidebar,
// header and footer are hidden. We wait on the workspace list first so no wrong
// content ever renders.
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ workspace_uuid: string }>();
  const workspace_uuid = params?.workspace_uuid;
  const { workspaces, loading } = useWorkspace();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  if (!workspaces.some((w) => w.uuid === workspace_uuid)) {
    notFound();
  }

  return <>{children}</>;
}
