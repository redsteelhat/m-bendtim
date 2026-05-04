const rawBase = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
const base = rawBase.replace(/\/+$/, "");
const isSupabaseProjectUrl =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base);

function getCookie(name: string): string | null {
  const prefix = `${name}=`;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

function isUnsafeMethod(method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  return !["GET", "HEAD", "OPTIONS"].includes(m);
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (isSupabaseProjectUrl && path.startsWith("/api/")) {
    throw new Error(
      "VITE_API_BASE_URL backend API adresi olmali. Supabase project URL yerine deploy edilen backend adresini girin."
    );
  }

  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (isUnsafeMethod(options.method) && !headers.has("X-CSRF-Token")) {
    const csrfToken = getCookie("mbendtim_csrf");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  const url = path.startsWith("http") ? path : `${base}${path}`;
  const res = await fetch(url, { ...options, headers, credentials: "include" });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: string }).error)
        : typeof data === "string" && data.trim()
        ? data
        : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data as T;
}
