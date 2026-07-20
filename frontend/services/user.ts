import { baseUrl } from "@/constants/constants";

export async function fetchMe() {
  const res = await fetch(`${baseUrl}accounts/me`, {
    credentials: "include",
  });

  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}