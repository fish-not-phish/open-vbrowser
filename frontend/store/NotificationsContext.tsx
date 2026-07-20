"use client";

import React, { createContext, useContext } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification } from "@/lib/api";

interface NotificationsContextValue {
  notifications: Notification[];
  unreadCount: number;
  connected: boolean;
  markRead: (uuid: string, csrfToken: string) => void;
  markAllRead: (csrfToken: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const value = useNotifications();
  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotificationsContext must be used within NotificationsProvider");
  return ctx;
}
