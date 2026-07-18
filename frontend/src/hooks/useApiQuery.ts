import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { isAbortError, toApiError, type ApiError } from '../api';

export type ApiQueryStatus = 'idle' | 'loading' | 'success' | 'error';
export type ApiQueryKey = string | number | boolean | readonly unknown[] | null;
export type ApiQueryLoader<T> = (signal: AbortSignal) => Promise<T>;

export interface UseApiQueryOptions<T> {
  enabled?: boolean;
  initialData?: T;
  keepPreviousData?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: ApiError) => void;
}

export interface UseApiQueryResult<T> {
  data: T | undefined;
  error: ApiError | null;
  status: ApiQueryStatus;
  isLoading: boolean;
  isRefreshing: boolean;
  updatedAt: number | null;
  reload: () => void;
  refetch: () => void;
  retry: () => void;
  setData: Dispatch<SetStateAction<T | undefined>>;
}

function keyToken(key: ApiQueryKey): string | null {
  if (key === null) return null;
  return typeof key === 'string' ? key : JSON.stringify(key);
}

export function useApiQuery<T>(
  key: ApiQueryKey,
  loader: ApiQueryLoader<T>,
  options: UseApiQueryOptions<T> = {},
): UseApiQueryResult<T> {
  const enabled = options.enabled ?? true;
  const keepPreviousData = options.keepPreviousData ?? true;
  const token = useMemo(() => keyToken(key), [key]);
  const loaderRef = useRef(loader);
  const onSuccessRef = useRef(options.onSuccess);
  const onErrorRef = useRef(options.onError);
  loaderRef.current = loader;
  onSuccessRef.current = options.onSuccess;
  onErrorRef.current = options.onError;

  const [data, setData] = useState<T | undefined>(options.initialData);
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState<ApiQueryStatus>(
    options.initialData === undefined ? 'idle' : 'success',
  );
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const previousTokenRef = useRef<string | null>(token);

  const reload = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled || token === null) {
      setStatus((current) => current === 'loading' ? 'idle' : current);
      return undefined;
    }

    const keyChanged = previousTokenRef.current !== token;
    previousTokenRef.current = token;
    if (keyChanged && !keepPreviousData) setData(undefined);

    const controller = new AbortController();
    let active = true;
    setError(null);
    setStatus('loading');

    void Promise.resolve()
      .then(() => loaderRef.current(controller.signal))
      .then((result) => {
        if (!active) return;
        setData(result);
        setStatus('success');
        setUpdatedAt(Date.now());
        onSuccessRef.current?.(result);
      })
      .catch((caught: unknown) => {
        if (!active || isAbortError(caught)) return;
        const apiError = toApiError(caught);
        setError(apiError);
        setStatus('error');
        onErrorRef.current?.(apiError);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, keepPreviousData, revision, token]);

  return {
    data,
    error,
    status,
    isLoading: status === 'loading' && data === undefined,
    isRefreshing: status === 'loading' && data !== undefined,
    updatedAt,
    reload,
    refetch: reload,
    retry: reload,
    setData,
  };
}
