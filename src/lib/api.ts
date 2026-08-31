// Client-side API helper. All calls are same-origin (relative /api),
// so admin session cookies flow automatically.

export class ApiError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T = any>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    credentials: "same-origin",
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok || data?.success === false) {
    throw new ApiError(data?.error || "Request failed", res.status, data?.code);
  }
  return data as T;
}

export const apiGet = <T = any>(path: string) => request<T>(path, { method: "GET" });
export const apiPost = <T = any>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
export const apiPatch = <T = any>(path: string, body?: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
