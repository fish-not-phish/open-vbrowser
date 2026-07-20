export async function csrfFetch(
  url: string,
  init: RequestInit = {},
  csrfToken: string
) {
  const headers = new Headers(init.headers);

  // JSON by default if body is present and caller didn't set it
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (csrfToken) {
    headers.set("X-CSRFToken", csrfToken);
  }

  return fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });
}
