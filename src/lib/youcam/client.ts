// Server-side YouCam API client (V2). Holds the API key; never import from client code.
//
// Flow per the YouCam docs: register the file (POST /s2s/v2.0/file/{feature}) to get
// a file_id and a signed upload URL, PUT the bytes there, create the task
// (POST /s2s/v2.0/task/{feature}) and poll GET /s2s/v2.0/task/{feature}/{task_id}
// until task_status is "success" or "error". Units are charged only on success.

import type { Feature } from "./features";

export const YOUCAM_BASE = process.env.YOUCAM_API_BASE?.replace(/\/$/, "") || "https://yce-api-01.makeupar.com";

export class YouCamError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus = 500,
  ) {
    super(message);
    this.name = "YouCamError";
  }
}

function apiKey(): string {
  const key = process.env.YOUCAM_API_KEY?.trim();
  if (!key) throw new YouCamError("missing_api_key", "YOUCAM_API_KEY is not configured", 500);
  return key;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
    ...(init.headers ?? {}),
  };
  let res: Response;
  try {
    res = await fetch(`${YOUCAM_BASE}${path}`, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new YouCamError("network_error", `Could not reach YouCam: ${(err as Error).message}`, 502);
  }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const code =
      (body.error_code as string) ||
      (body.error as string) ||
      (res.status === 429 ? "rate_limited" : res.status === 401 ? "InvalidApiKey" : `http_${res.status}`);
    const message = (body.message as string) || (body.error_message as string) || text.slice(0, 300);
    throw new YouCamError(code, `HTTP ${res.status} ${init.method ?? "GET"} ${path.split("?")[0]}: ${message}`, res.status);
  }
  return body as T;
}

interface FileResponse {
  data: {
    files: Array<{
      file_id: string;
      requests: Array<{ method: string; url: string; headers?: Record<string, string> }>;
    }>;
  };
}

export async function uploadFile(feature: Feature, bytes: Uint8Array, contentType: string, fileName: string) {
  const reg = await call<FileResponse>(`/s2s/v2.0/file/${feature}`, {
    method: "POST",
    body: JSON.stringify({
      files: [{ content_type: contentType, file_name: fileName, file_size: bytes.byteLength }],
    }),
  });
  const file = reg.data?.files?.[0];
  const upload = file?.requests?.[0];
  if (!file?.file_id || !upload?.url) throw new YouCamError("upload_failed", "YouCam did not return an upload URL");

  // Content-Length is computed by fetch from the body; send the other signed headers as given.
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(upload.headers ?? {})) {
    if (k.toLowerCase() !== "content-length") headers[k] = v;
  }
  headers["Content-Type"] ??= contentType;
  const put = await fetch(upload.url, {
    method: upload.method || "PUT",
    headers,
    body: new Blob([bytes as BlobPart], { type: contentType }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!put.ok) throw new YouCamError("upload_failed", `Upload to signed URL failed (${put.status})`, 502);
  return file.file_id;
}

export async function createTask(feature: Feature, body: Record<string, unknown>): Promise<string> {
  const res = await call<{ data?: { task_id?: string } }>(`/s2s/v2.0/task/${feature}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const id = res.data?.task_id;
  if (!id) throw new YouCamError("task_failed", "YouCam did not return a task id");
  return id;
}

export type TaskState =
  | { status: "running" }
  | { status: "success"; results: Record<string, unknown> }
  | { status: "error"; code: string; message: string };

export async function getTask(feature: Feature, taskId: string): Promise<TaskState> {
  const res = await call<{
    data?: { task_status?: string; error?: string | null; error_message?: string | null; results?: unknown };
  }>(`/s2s/v2.0/task/${feature}/${encodeURIComponent(taskId)}`, { method: "GET" });
  const data = res.data ?? {};
  if (data.task_status === "success") {
    // `results` is an object for V2 tasks; older payloads wrapped it in an array.
    const raw = Array.isArray(data.results) ? data.results[0] : data.results;
    return { status: "success", results: (raw ?? {}) as Record<string, unknown> };
  }
  if (data.task_status === "error") {
    return { status: "error", code: data.error || "unknown_internal_error", message: data.error_message || "" };
  }
  return { status: "running" };
}

/** Free endpoint: units each feature costs. */
export async function getFeatureCost() {
  return call<Record<string, unknown>>(`/s2s/v2.0/credit/feature-cost?page_size=50`, { method: "GET" });
}

/** Result image hosts we are willing to proxy. */
export function isYouCamResultUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      !u.username && !u.password && !u.port &&
      (u.hostname.endsWith(".amazonaws.com") ||
        u.hostname.endsWith(".makeupar.com") ||
        u.hostname.endsWith(".perfectcorp.com") ||
        u.hostname.endsWith(".cloudfront.net"))
    );
  } catch {
    return false;
  }
}

/** Finds the first result image URL in a task result (shape differs per feature). */
export function resultImageUrl(results: Record<string, unknown>): string | null {
  if (typeof results.url === "string") return results.url;
  for (const v of Object.values(results)) {
    if (typeof v === "string" && /^https:\/\//.test(v)) return v;
    if (v && typeof v === "object") {
      const nested = resultImageUrl(v as Record<string, unknown>);
      if (nested) return nested;
    }
  }
  return null;
}

/** Nested field names of a result object, e.g. "color{skin_color,hair_color},face_quality{lighting}". */
export function describeShape(value: unknown, depth = 0): string {
  if (Array.isArray(value)) return `[${value.length ? describeShape(value[0], depth + 1) : ""}]`;
  if (!value || typeof value !== "object" || depth > 3) return "";
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => {
      const inner = v && typeof v === "object" ? describeShape(v, depth + 1) : "";
      return inner ? `${k}{${inner}}` : k;
    })
    .join(",");
}
