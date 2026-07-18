import { useCallback, useEffect, useRef, useState } from 'react';

import { isAbortError, toApiError, type ApiError } from '../api';

export type AsyncActionStatus = 'idle' | 'pending' | 'success' | 'error';
export type AsyncAction<TArgs extends unknown[], TResult> = (
  ...args: [...TArgs, AbortSignal]
) => Promise<TResult>;

export interface UseAsyncActionOptions<TArgs extends unknown[], TResult> {
  onSuccess?: (data: TResult, args: TArgs) => void;
  onError?: (error: ApiError, args: TArgs) => void;
}

export interface AsyncActionResetOptions {
  preserveData?: boolean;
  preserveArguments?: boolean;
}

export interface UseAsyncActionResult<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult>;
  retry: () => Promise<TResult> | undefined;
  cancel: () => void;
  reset: (options?: AsyncActionResetOptions) => void;
  data: TResult | undefined;
  error: ApiError | null;
  status: AsyncActionStatus;
  isPending: boolean;
  lastArgs: TArgs | null;
}

export function useAsyncAction<TResult>(
  action: (signal: AbortSignal) => Promise<TResult>,
  options?: UseAsyncActionOptions<[], TResult>,
): UseAsyncActionResult<[], TResult>;
export function useAsyncAction<T1, TResult>(
  action: (arg1: T1, signal: AbortSignal) => Promise<TResult>,
  options?: UseAsyncActionOptions<[T1], TResult>,
): UseAsyncActionResult<[T1], TResult>;
export function useAsyncAction<T1, T2, TResult>(
  action: (arg1: T1, arg2: T2, signal: AbortSignal) => Promise<TResult>,
  options?: UseAsyncActionOptions<[T1, T2], TResult>,
): UseAsyncActionResult<[T1, T2], TResult>;
export function useAsyncAction<T1, T2, T3, TResult>(
  action: (
    arg1: T1,
    arg2: T2,
    arg3: T3,
    signal: AbortSignal,
  ) => Promise<TResult>,
  options?: UseAsyncActionOptions<[T1, T2, T3], TResult>,
): UseAsyncActionResult<[T1, T2, T3], TResult>;
export function useAsyncAction<T1, T2, T3, T4, TResult>(
  action: (
    arg1: T1,
    arg2: T2,
    arg3: T3,
    arg4: T4,
    signal: AbortSignal,
  ) => Promise<TResult>,
  options?: UseAsyncActionOptions<[T1, T2, T3, T4], TResult>,
): UseAsyncActionResult<[T1, T2, T3, T4], TResult>;
export function useAsyncAction(
  action: any,
  options: any = {},
): any {
  return useAsyncActionInternal(action, options);
}

function useAsyncActionInternal<TArgs extends unknown[], TResult>(
  action: AsyncAction<TArgs, TResult>,
  options: UseAsyncActionOptions<TArgs, TResult> = {},
): UseAsyncActionResult<TArgs, TResult> {
  const actionRef = useRef(action);
  const onSuccessRef = useRef(options.onSuccess);
  const onErrorRef = useRef(options.onError);
  actionRef.current = action;
  onSuccessRef.current = options.onSuccess;
  onErrorRef.current = options.onError;

  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<Promise<TResult> | null>(null);
  const dataRef = useRef<TResult | undefined>(undefined);
  const argsRef = useRef<TArgs | null>(null);
  const [data, setData] = useState<TResult>();
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState<AsyncActionStatus>('idle');
  const [lastArgs, setLastArgs] = useState<TArgs | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const run = useCallback((...args: TArgs): Promise<TResult> => {
    if (pendingRef.current) return pendingRef.current;

    const controller = new AbortController();
    controllerRef.current = controller;
    argsRef.current = args;
    setLastArgs(args);
    setError(null);
    setStatus('pending');

    const request = Promise.resolve()
      .then(() => actionRef.current(...args, controller.signal))
      .then((result) => {
        if (mountedRef.current && !controller.signal.aborted) {
          dataRef.current = result;
          setData(result);
          setStatus('success');
          onSuccessRef.current?.(result, args);
        }
        return result;
      })
      .catch((caught: unknown) => {
        if (isAbortError(caught) || controller.signal.aborted) {
          if (mountedRef.current && controllerRef.current === controller) {
            setStatus(dataRef.current === undefined ? 'idle' : 'success');
          }
          throw caught;
        }
        const apiError = toApiError(caught);
        if (mountedRef.current) {
          setError(apiError);
          setStatus('error');
          onErrorRef.current?.(apiError, args);
        }
        throw apiError;
      })
      .finally(() => {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          pendingRef.current = null;
        }
      });

    pendingRef.current = request;
    return request;
  }, []);

  const retry = useCallback((): Promise<TResult> | undefined => {
    if (argsRef.current === null) return undefined;
    return run(...argsRef.current);
  }, [run]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback((resetOptions: AsyncActionResetOptions = {}) => {
    const activeController = controllerRef.current;
    activeController?.abort();
    if (controllerRef.current === activeController) {
      controllerRef.current = null;
      pendingRef.current = null;
    }
    setError(null);
    if (!resetOptions.preserveData) {
      dataRef.current = undefined;
      setData(undefined);
    }
    if (!resetOptions.preserveArguments) {
      argsRef.current = null;
      setLastArgs(null);
    }
    setStatus(resetOptions.preserveData && dataRef.current !== undefined ? 'success' : 'idle');
  }, []);

  return {
    run,
    retry,
    cancel,
    reset,
    data,
    error,
    status,
    isPending: status === 'pending',
    lastArgs,
  };
}
