/**
 * Shared API client helper to target external backend origin.
 *
 * Usage:
 *   import { apiFetch, getApiBaseURL, buildApiUrl, getJson, postJson } from "./api/http";
 *
 *   const res = await apiFetch("/api/notes", { method: "GET" });
 *   const data = await getJson<{ notes: any[] }>("/api/shared-notes");
 *
 * Configuration (any of the following, first found wins):
 *   - import.meta.env.DIARYX_API_BASE_URL
 *   - import.meta.env.VITE_DIARYX_API_BASE_URL
 *   - import.meta.env.VITE_API_BASE_URL
 *   - process.env.DIARYX_API_BASE_URL
 *   - process.env.VITE_DIARYX_API_BASE_URL
 *   - process.env.VITE_API_BASE_URL
 *   - process.env.API_BASE_URL
 *
 * Fallbacks:
 *   - If running in the browser and no env var is configured: window.location.origin
 *   - Otherwise: http://localhost:3000 (development default for the Elysia backend)
 */

const DEFAULT_DEV_API_ORIGIN = "http://localhost:3000";

const isNonEmpty = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const readImportMetaEnv = (key: string): string | undefined => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any)?.env;
    const value = env?.[key];
    return isNonEmpty(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const readProcessEnv = (key: string): string | undefined => {
  // Guard against process being undefined in some runtimes
  // eslint-disable-next-line no-undef
  const value = typeof process !== "undefined" ? process?.env?.[key] : undefined;
  return isNonEmpty(value) ? value : undefined;
};

/**
 * Resolve the backend base URL using multiple strategies.
 */
export const getApiBaseURL = (): string => {
  // Prefer build-time injected variables first (Vite/Qwik)
  // Strongly prefer explicit VITE_ variables injected by Vite
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ime = (typeof import.meta !== "undefined" ? (import.meta as any).env : undefined) as Record<string, string | undefined> | undefined;
  const viteFromImport =
    (ime?.VITE_DIARYX_API_BASE_URL && ime.VITE_DIARYX_API_BASE_URL.trim()) ||
    (ime?.VITE_API_BASE_URL && ime.VITE_API_BASE_URL.trim()) ||
    undefined;

  if (isNonEmpty(viteFromImport)) {
    if (typeof window !== "undefined") {
      console.debug("[api/http] Using API base from import.meta.env VITE_*:", viteFromImport);
    }
    return sanitizeBase(viteFromImport);
  }

  // Fallback to process.env (SSR / Node)
  const pe = typeof process !== "undefined" ? process.env : undefined;
  const fromProcess =
    (pe?.VITE_DIARYX_API_BASE_URL && pe.VITE_DIARYX_API_BASE_URL.trim()) ||
    (pe?.VITE_API_BASE_URL && pe.VITE_API_BASE_URL.trim()) ||
    (pe?.DIARYX_API_BASE_URL && pe.DIARYX_API_BASE_URL.trim()) ||
    (pe?.API_BASE_URL && pe.API_BASE_URL.trim()) ||
    undefined;

  if (isNonEmpty(fromProcess)) {
    if (typeof window !== "undefined") {
      console.debug("[api/http] Using API base from process.env:", fromProcess);
    }
    return sanitizeBase(fromProcess);
  }

  // In the browser, default to current origin (works if you proxy or share domain)
  if (typeof window !== "undefined" && window.location) {
    const origin = window.location.origin;
    console.debug("[api/http] Using API base from window.location.origin:", origin);
    return sanitizeBase(origin);
  }

  // Last resort: dev default for the standalone backend
  console.debug("[api/http] Using default dev API base URL:", DEFAULT_DEV_API_ORIGIN);
  return sanitizeBase(DEFAULT_DEV_API_ORIGIN);
};

/**
 * Joins the API base URL with a path, ensuring a single slash boundary.
 * If the input is already an absolute URL, it's returned as-is.
 */
export const buildApiUrl = (pathOrUrl: string): string => {
  if (isAbsoluteUrl(pathOrUrl)) {
    return pathOrUrl;
  }
  const base = getApiBaseURL();
  return joinUrl(base, pathOrUrl);
};

type ApiFetchInit = RequestInit & {
  // If true and body is an object, JSON-encode and set headers automatically
  json?: boolean;
};

/**
 * Fetch wrapper that targets the external backend origin by default.
 * - Automatically sets credentials: 'include' (so cookies work cross-origin with proper CORS)
 * - If init.json is true and body is an object, auto-encodes JSON and sets Content-Type
 */
export const apiFetch = async (
  pathOrUrl: string,
  init: ApiFetchInit = {}
): Promise<Response> => {
  const url = buildApiUrl(pathOrUrl);

  const headers = new Headers(init.headers || {});
  let body = init.body;

  if (init.json) {
    if (
      body != null &&
      typeof body === "object" &&
      !(body instanceof FormData) &&
      !(body instanceof URLSearchParams) &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer)
    ) {
      body = JSON.stringify(body);
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
    }
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }
  }

  const mergedInit: RequestInit = {
    // Ensure cookies are included for auth session
    credentials: init.credentials ?? "include",
    ...init,
    headers,
    body,
  };

  return fetch(url, mergedInit);
};

/**
 * Convenience helper to GET and parse JSON with reasonable error messages.
 */
export const getJson = async <T = unknown>(
  pathOrUrl: string,
  init: Omit<ApiFetchInit, "method" | "body" | "json"> = {}
): Promise<T> => {
  const res = await apiFetch(pathOrUrl, {
    ...init,
    method: "GET",
    json: true,
  });
  return parseJsonResponse<T>(res);
};

/**
 * Convenience helper to POST JSON and parse JSON response.
 */
export const postJson = async <T = unknown>(
  pathOrUrl: string,
  data: unknown,
  init: Omit<ApiFetchInit, "method" | "body"> = {}
): Promise<T> => {
  const res = await apiFetch(pathOrUrl, {
    ...init,
    method: "POST",
    json: true,
    body: data as BodyInit,
  });
  return parseJsonResponse<T>(res);
};

/**
 * Parse a JSON response while preserving useful error details.
 */
export const parseJsonResponse = async <T = unknown>(
  response: Response
): Promise<T> => {
  const contentType = response.headers.get("content-type") || "";
  let data: unknown;

  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      // fall through to text parse
    }
  }

  if (data == null) {
    try {
      const text = await response.text();
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      } else {
        data = text;
      }
    } catch {
      // no body
    }
  }

  if (!response.ok) {
    const message =
      (data as any)?.error?.message ||
      (data as any)?.message ||
      (typeof data === "string" ? data : undefined) ||
      response.statusText ||
      `Request failed with status ${response.status}`;
    const error = new Error(message);
    // Attach status for caller logic
    (error as any).status = response.status;
    (error as any).data = data;
    throw error;
  }

  return data as T;
};

/**
 * Utilities
 */
const isAbsoluteUrl = (value: string): boolean =>
  /^https?:\/\//i.test(value);

const sanitizeBase = (value: string): string =>
  value.replace(/\s+/g, "").replace(/\/+$/, "");

const joinUrl = (base: string, path: string): string => {
  const left = base.replace(/\/+$/, "");
  const right = path.replace(/^\/+/, "");
  return `${left}/${right}`;
};

export default apiFetch;
