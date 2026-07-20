"use client";

import React from "react";
import useCsrfToken from "@/hooks/useCsrfToken";
import { baseUrl } from "@/constants/constants";
import { UserStateData } from "@/types/userData";
import { Spinner } from "@/components/ui/spinner";
import { fetchMe } from "@/services/user";

type AuthContextProps = {
  user: UserStateData;
  setUser: React.Dispatch<React.SetStateAction<UserStateData>>;
};

export const AuthContext = React.createContext<AuthContextProps | null>(null);

export const AuthContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = React.useState<UserStateData>({
    csrfToken: "",
    isLoggedIn: null,
    isLoading: true,
    isAdmin: false,
    canCreateWorkspaces: false,
    personalWorkspacesEnabled: true,
  });

  const csrfToken = useCsrfToken(`${baseUrl}accounts/csrf`);

  React.useEffect(() => {
    async function init() {
      setUser((p) => ({ ...p, isLoading: true }));

      try {
        const statusRes = await fetch(`${baseUrl}accounts/status`, {
          method: "GET",
          credentials: "include",
        });
        const status = await statusRes.json();
        setUser((p) => ({ ...p, isLoggedIn: !!status.isLoggedIn }));
      } catch {
        setUser((p) => ({ ...p, isLoggedIn: false }));
      }

      if (csrfToken) {
        setUser((p) => ({ ...p, csrfToken }));
      }

      try {
        const me = await fetchMe();
        setUser((p) => ({ ...p, ...me }));
      } catch {
        // ignore
      }

      setUser((p) => ({ ...p, isLoading: false }));
    }

    init();
  }, [csrfToken]);

  if (user.isLoading) {
    return (
      <div className="h-[100dvh] w-full flex justify-center items-center">
        <Spinner />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthContextProvider");
  return ctx;
};