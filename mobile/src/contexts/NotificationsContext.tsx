import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api/client";

/**
 * In-app notification feed state (round-2 QA §9). Holds the unread count so
 * the Home bell badge and the feed screen stay in sync without refetching
 * everywhere. Refresh is cheap (a tiny count endpoint) and fire-and-forget —
 * a failure never blocks a screen.
 */
interface NotificationsContextValue {
  unreadCount: number;
  refreshUnread: () => Promise<void>;
  setUnread: (n: number) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    try {
      const data = await api.get<number>("/me/notifications/unread-count");
      setUnread(typeof data === "number" ? data : 0);
    } catch {
      // Bell badge is a nice-to-have — fail silently.
    }
  }, []);

  const value = useMemo(
    () => ({ unreadCount, refreshUnread, setUnread }),
    [unreadCount, refreshUnread],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within a NotificationsProvider",
    );
  }
  return ctx;
}
