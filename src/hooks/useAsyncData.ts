import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncData<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * One place where every screen's data fetching gets its loading/error
 * behaviour, so no page invents its own.
 *
 * Two details that matter:
 *   * A result from a superseded request is discarded (`requestId`), so a
 *     slow first fetch can't overwrite a fast second one after the user
 *     switches class or tab.
 *   * State is never written after unmount.
 *
 * `deps` follows the usual dependency-array contract. Pass a stable
 * `loader` (useCallback) or keep deps accurate.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: unknown[],
  options: { enabled?: boolean; errorMessage?: string } = {}
): AsyncData<T> {
  const { enabled = true, errorMessage } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    loaderRef
      .current()
      .then((result) => {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        console.error("Data load failed", err);
        setError(
          errorMessage ??
            (err instanceof Error && err.message
              ? err.message
              : "We couldn't retrieve the latest school data. Please try again.")
        );
        setLoading(false);
      });
    // `deps` is the caller's dependency array by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload };
}
