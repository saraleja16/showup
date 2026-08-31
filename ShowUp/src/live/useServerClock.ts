import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Local display clock that tracks an optional server offset.
 * Ticks every 1s for UI only — never hits the network by itself.
 */
export function useServerClock(options?: {
  /** When true, tick every second. Default true. */
  tick?: boolean;
}) {
  const tick = options?.tick !== false;
  const offsetRef = useRef(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const syncFromServerNow = useCallback((serverNowIso: string | null | undefined) => {
    if (!serverNowIso) return;
    const serverMs = new Date(serverNowIso).getTime();
    if (!Number.isFinite(serverMs)) return;
    offsetRef.current = serverMs - Date.now();
    setNowMs(serverMs);
  }, []);

  const readNow = useCallback(() => Date.now() + offsetRef.current, []);

  useEffect(() => {
    if (!tick) return;
    const id = setInterval(() => setNowMs(readNow()), 1000);
    return () => clearInterval(id);
  }, [readNow, tick]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') setNowMs(readNow());
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [readNow]);

  return { nowMs, syncFromServerNow, readNow };
}
