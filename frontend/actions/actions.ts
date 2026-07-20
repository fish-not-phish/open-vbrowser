import { AuthProps } from "@/types/auth";
import { baseUrl } from "@/constants/constants";

/* =========================
   LOGOUT
========================= */

export const logout: AuthProps = async (
  csrfToken,
  setUser
) => {
  setUser(prev => ({ ...prev, isLoading: true }));

  try {
    const response = await fetch(`${baseUrl}accounts/logout`, {
      method: "POST",
      headers: {
        "X-CSRFToken": csrfToken,
      },
      credentials: "include",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Logout failed");
    }

    setUser(prev => ({
      ...prev,
      isLoggedIn: false,
      isLoading: false,
    }));
  } catch (error: any) {
    console.error("Error logging out:", error);
    alert(error.message);
    setUser(prev => ({ ...prev, isLoading: false }));
  }
};
