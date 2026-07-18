import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useApiQuery } from './useApiQuery';
import { useAsyncAction } from './useAsyncAction';

describe('API hooks', () => {
  it('keeps prior query data while reloading a new key', async () => {
    const loader = vi.fn(async (_signal: AbortSignal) => 'first');
    const { result, rerender } = renderHook(
      ({ queryKey }) => useApiQuery(queryKey, loader),
      { initialProps: { queryKey: 'one' } },
    );

    await waitFor(() => expect(result.current.data).toBe('first'));
    loader.mockImplementation(async () => new Promise<string>(() => undefined));
    rerender({ queryKey: 'two' });

    expect(result.current.data).toBe('first');
    expect(result.current.isRefreshing).toBe(true);
  });

  it('aborts a query when its component unmounts', async () => {
    let wasAborted = false;
    const loader = (signal: AbortSignal) => new Promise<string>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        wasAborted = true;
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
    const { unmount } = renderHook(() => useApiQuery('abort-me', loader));

    await act(async () => Promise.resolve());
    unmount();

    expect(wasAborted).toBe(true);
  });

  it('returns the active promise instead of starting duplicate actions', async () => {
    let resolveRequest: ((value: number) => void) | undefined;
    const action = vi.fn((_value: string, _signal: AbortSignal) =>
      new Promise<number>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const { result } = renderHook(() => useAsyncAction(action));

    let first!: Promise<number>;
    let duplicate!: Promise<number>;
    act(() => {
      first = result.current.run('same');
      duplicate = result.current.run('same');
    });
    expect(duplicate).toBe(first);
    expect(action).toHaveBeenCalledTimes(0);

    await act(async () => {
      await Promise.resolve();
      expect(action).toHaveBeenCalledTimes(1);
      resolveRequest?.(9);
      await expect(first).resolves.toBe(9);
    });
    expect(result.current.data).toBe(9);
    expect(result.current.status).toBe('success');
  });
});
