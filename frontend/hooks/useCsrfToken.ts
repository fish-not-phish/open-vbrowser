import { useEffect, useState } from "react";

export default function useCsrfToken(url: string) {
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(url, { method: "GET", credentials: "include" });
        const data = await res.json();
        setCsrfToken(data.csrfToken || "");
      } catch (e) {
        console.error("Error fetching CSRF token:", e);
      }
    })();
  }, [url]);

  return csrfToken;
}