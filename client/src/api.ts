const rawBase = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
const base = rawBase.replace(/\/+$/, "");
const isSupabaseProjectUrl =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base);

function getToken(): string | null {
  return localStorage.getItem("token");
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
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const url = path.startsWith("http") ? path : `${base}${path}`;
  const res = await fetch(url, { ...options, headers });
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
