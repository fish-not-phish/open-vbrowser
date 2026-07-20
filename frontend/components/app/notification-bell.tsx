"use client";

import * as React from "react";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNotificationsContext } from "@/store/NotificationsContext";
import { useAuthContext } from "@/store/AuthContext";
import { useRouter } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { user } = useAuthContext();
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationsContext();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  function handleClick(uuid: string, workspaceUuid: string | null, caseUuid: string | null) {
    if (user.csrfToken) markRead(uuid, user.csrfToken);
    if (workspaceUuid && caseUuid) {
      router.push(`/${workspaceUuid}/cases/${caseUuid}`);
      setOpen(false);
    }
  }

  function handleMarkAll() {
    if (user.csrfToken) markAllRead(user.csrfToken);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SidebarMenuButton tooltip="Notifications" className="relative">
          <Bell />
          <span>Notifications</span>
          {unreadCount > 0 && (
            <span className="ml-auto flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-80 p-0 border-border/60 bg-card"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <span className="text-sm font-semibold tracking-wide">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground/50">
            <Bell className="size-6" />
            <p className="text-xs">No notifications</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[360px]">
            <div className="flex flex-col">
              {notifications.map((n) => (
                <button
                  key={n.uuid}
                  onClick={() => handleClick(n.uuid, n.workspace_uuid, n.case_uuid)}
                  className={cn(
                    "flex flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-sidebar-accent/50 border-b border-border/20 last:border-0",
                    !n.read && "bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />
                    )}
                    <p className={cn("text-xs leading-relaxed", !n.read ? "text-foreground" : "text-muted-foreground pl-3.5")}>
                      <span className="font-semibold text-primary">
                        {n.actor_email ?? "Someone"}
                      </span>{" "}
                      mentioned you
                      {n.case_name && (
                        <> in <span className="font-medium text-foreground">{n.case_name}</span></>
                      )}
                    </p>
                  </div>
                  <p className={cn("text-[11px] text-muted-foreground/50", !n.read ? "pl-3.5" : "pl-3.5")}>
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
