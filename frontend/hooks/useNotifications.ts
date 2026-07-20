"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { notificationsApi, type Notification } from "@/lib/api";
import { useAuthContext } from "@/store/AuthContext";

// Derive WebSocket base from NEXT_PUBLIC_BASE_URL_ACCOUNTS
// e.g. https://jfbox.io/ → wss://jfbox.io
const _accountsBase = (process.env.NEXT_PUBLIC_BASE_URL_ACCOUNTS ?? "http://127.0.0.1:8000/")
  .replace(/\/$/, "")                          // strip trailing slash
  .replace(/^https:\/\//, "wss://")           // https → wss
  .replace(/^http:\/\//, "ws://");            // http → ws
const WS_BASE = _accountsBase + "/ws/notifications/";

const POLL_INTERVAL = 30_000; // fallback polling every 30s

export function useNotifications() {
  const { user } = useAuthContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchAll = useCallback(async () => {
    if (!user.isLoggedIn) return;  // null or false
    try {
      const data = await notificationsApi.list();
      if (mountedRef.current) setNotifications(data);
    } catch {
      // silent — polling fallback
    }
  }, [user.isLoggedIn]);

  const markRead = useCallback((uuid: string, csrfToken: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.uuid === uuid ? { ...n, read: true } : n))
    );
    notificationsApi.markRead(uuid, csrfToken).catch(() => {});
    // Also tell WS
    wsRef.current?.send(JSON.stringify({ action: "mark_read", uuid }));
  }, []);

  const markAllRead = useCallback(async (csrfToken: string) => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await notificationsApi.markAllRead(csrfToken).catch(() => {});
  }, []);

  const connect = useCallback(() => {
    if (!user.isLoggedIn) return;  // null or false
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_BASE);
    wsRef.current = ws;

    ws.onopen = () => {
      if (mountedRef.current) setConnected(true);
      // Stop polling fallback when WS is live
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    ws.onmessage = (evt) => {
      try {
        const notif: Notification = JSON.parse(evt.data);
        if (mountedRef.current) {
          setNotifications((prev) => {
            // Replace if exists (e.g. read update), prepend if new
            const exists = prev.find((n) => n.uuid === notif.uuid);
            if (exists) return prev.map((n) => (n.uuid === notif.uuid ? notif : n));
            return [notif, ...prev];
          });
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      // Start polling fallback and schedule reconnect
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchAll, POLL_INTERVAL);
      }
      reconnectRef.current = setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [user.isLoggedIn, fetchAll]);

  useEffect(() => {
    mountedRef.current = true;
    if (!user.isLoggedIn) return;  // null or false

    fetchAll();
    connect();

    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [user.isLoggedIn]);

  return { notifications, unreadCount, connected, markRead, markAllRead, refetch: fetchAll };
}
