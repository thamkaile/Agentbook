import type { ErrorResponse } from './types';

const DEFAULT_CACHE_TTL_MS = 3_000;

export interface ApiCallOptions {
  signal?: AbortSignal;
}

export interface GetOptions extends ApiCallOptions {
  cacheTtlMs?: number;
  dedupe?: boolean;
  forceRefresh?: boolean;
}

export interface MutationOptions extends ApiCallOptions {
  headers?: HeadersInit;
}

export interface UploadOptions extends ApiCallOptions {
  fieldName?: string;
  fields?: Record<string, string | number | boolean | null | undefined>;
}

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

interface InFlightEntry {
  controller: AbortController;
  promise: Promise<unknown>;
  subscribers: number;
  settled: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { status: number; code: string; details?: unknown },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === 'AbortError'
  ) || (
    error instanceof Error && error.name === 'AbortError'
  );
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof Error) {
    return new ApiError(error.message || 'Request failed.', {
      status: 0,
      code: 'network_error',
    });
  }
  return new ApiError('Request failed.', {
    status: 0,
    code: 'network_error',
    details: error,
  });
}

export function getErrorMessage(error: unknown): string {
  return toApiError(error).message;
}

function normalizeBaseUrl(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/$/, '');
}

export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
);

function requestUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

function abortError(): DOMException {
  return new DOMException('The request was aborted.', 'AbortError');
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const structured = payload as Partial<ErrorResponse> | undefined;
    const body = structured?.error;
    throw new ApiError(
      body?.message || response.statusText || 'Request failed.',
      {
        status: response.status,
        code: body?.code || `http_${response.status}`,
        details: body?.details,
      },
    );
  }

  return payload as T;
}

async function execute<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  try {
    return await parseResponse<T>(await fetch(url, init));
  } catch (error) {
    if (isAbortError(error) || error instanceof ApiError) {
      throw error;
    }
    throw toApiError(error);
  }
}

function subscribe<T>(
  entry: InFlightEntry,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    return Promise.reject(abortError());
  }

  entry.subscribers += 1;
  return new Promise<T>((resolve, reject) => {
    let completed = false;

    const release = () => {
      if (completed) return;
      completed = true;
      signal?.removeEventListener('abort', onAbort);
      entry.subscribers -= 1;
      if (entry.subscribers === 0 && !entry.settled) {
        entry.controller.abort();
      }
    };

    const onAbort = () => {
      release();
      reject(abortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    entry.promise.then(
      (data) => {
        if (completed) return;
        release();
        resolve(data as T);
      },
      (error: unknown) => {
        if (completed) return;
        release();
        reject(error);
      },
    );
  });
}

class ApiClient {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, InFlightEntry>();

  async get<T>(path: string, options: GetOptions = {}): Promise<T> {
    const url = requestUrl(path);
    const ttl = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const cached = this.cache.get(url);
    if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
      if (options.signal?.aborted) throw abortError();
      return cached.data as T;
    }
    if (cached) this.cache.delete(url);

    const shouldDedupe = options.dedupe !== false;
    const candidate = shouldDedupe ? this.inFlight.get(url) : undefined;
    const existing = candidate && !candidate.controller.signal.aborted
      ? candidate
      : undefined;
    if (candidate && !existing) this.inFlight.delete(url);
    if (existing) {
      return subscribe<T>(existing, options.signal);
    }

    const controller = new AbortController();
    const entry: InFlightEntry = {
      controller,
      subscribers: 0,
      settled: false,
      promise: Promise.resolve(undefined),
    };
    entry.promise = execute<T>(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    }).then((data) => {
      if (ttl > 0) {
        this.cache.set(url, { data, expiresAt: Date.now() + ttl });
      }
      return data;
    }).finally(() => {
      entry.settled = true;
      if (this.inFlight.get(url) === entry) {
        this.inFlight.delete(url);
      }
    });
    if (shouldDedupe) this.inFlight.set(url, entry);
    return subscribe<T>(entry, options.signal);
  }

  post<T, TBody = unknown>(
    path: string,
    body?: TBody,
    options: MutationOptions = {},
  ): Promise<T> {
    return this.json<T, TBody>('POST', path, body, options);
  }

  patch<T, TBody = unknown>(
    path: string,
    body: TBody,
    options: MutationOptions = {},
  ): Promise<T> {
    return this.json<T, TBody>('PATCH', path, body, options);
  }

  put<T, TBody = unknown>(
    path: string,
    body?: TBody,
    options: MutationOptions = {},
  ): Promise<T> {
    return this.json<T, TBody>('PUT', path, body, options);
  }

  delete<T>(
    path: string,
    options: MutationOptions = {},
  ): Promise<T> {
    return execute<T>(requestUrl(path), {
      method: 'DELETE',
      headers: { Accept: 'application/json', ...options.headers },
      signal: options.signal,
    });
  }

  upload<T>(
    path: string,
    file: File,
    options: UploadOptions = {},
  ): Promise<T> {
    const form = new FormData();
    form.append(options.fieldName ?? 'file', file, file.name);
    for (const [key, value] of Object.entries(options.fields ?? {})) {
      if (value !== null && value !== undefined) {
        form.append(key, String(value));
      }
    }
    return execute<T>(requestUrl(path), {
      method: 'POST',
      body: form,
      headers: { Accept: 'application/json' },
      signal: options.signal,
    });
  }

  invalidate(): void;
  invalidate(path: string): void;
  invalidate(target: { prefix: string }): void;
  invalidate(target?: string | { prefix: string }): void {
    if (target === undefined) {
      this.cache.clear();
      return;
    }
    if (typeof target === 'string') {
      this.cache.delete(requestUrl(target));
      return;
    }
    const prefix = requestUrl(target.prefix);
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  private json<T, TBody>(
    method: 'POST' | 'PATCH' | 'PUT',
    path: string,
    body: TBody | undefined,
    options: MutationOptions,
  ): Promise<T> {
    return execute<T>(requestUrl(path), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    });
  }
}

export const apiClient = new ApiClient();

export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export function withQuery(
  path: string,
  params: Record<string, QueryValue>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}
