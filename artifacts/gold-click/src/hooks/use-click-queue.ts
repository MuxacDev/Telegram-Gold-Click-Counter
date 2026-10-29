import { useCallback, useEffect, useRef, useState } from "react";
import { useAddClicks, type Player } from "@workspace/api-client-react";

const FLUSH_MS = 400;
const MAX_BATCH = 50;
const MAX_AUTO_RETRIES = 3;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type Inflight = { count: number; requestId: string };

export function useClickQueue(initData: string | null, onPlayer: (p: Player) => void) {
  const addClicks = useAddClicks();
  const mutateRef = useRef(addClicks.mutateAsync);
  mutateRef.current = addClicks.mutateAsync;
  const onPlayerRef = useRef(onPlayer);
  onPlayerRef.current = onPlayer;

  const pendingRef = useRef(0);
  const inflightRef = useRef<Inflight | null>(null);
  const busyRef = useRef(false);
  const retriesRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const [pending, setPending] = useState(0);
  const [inflight, setInflight] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sync = () => {
    setPending(pendingRef.current);
    setInflight(inflightRef.current?.count ?? 0);
  };

  const pump = useCallback(async () => {
    if (!initData || busyRef.current) return;
    busyRef.current = true;
    try {
      while (true) {
        if (!inflightRef.current) {
          if (pendingRef.current <= 0) break;
          const count = Math.min(MAX_BATCH, pendingRef.current);
          pendingRef.current -= count;
          inflightRef.current = { count, requestId: uuid() };
          sync();
        }
        const batch = inflightRef.current;
        try {
          const player = await mutateRef.current({
            data: { initData, count: batch.count, requestId: batch.requestId },
          });
          inflightRef.current = null;
          retriesRef.current = 0;
          setError(null);
          onPlayerRef.current(player);
          sync();
        } catch (e) {
          retriesRef.current += 1;
          const msg = e instanceof Error ? e.message : "Network error";
          if (retriesRef.current > MAX_AUTO_RETRIES) {
            setError(`${batch.count + pendingRef.current} taps not saved yet: ${msg}`);
            break;
          }
          await new Promise((r) => setTimeout(r, 600 * retriesRef.current));
        }
      }
    } finally {
      busyRef.current = false;
    }
  }, [initData]);

  const schedule = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void pump();
    }, FLUSH_MS);
  }, [pump]);

  const tap = useCallback(() => {
    pendingRef.current += 1;
    sync();
    if (!error) schedule();
  }, [schedule, error]);

  const retry = useCallback(() => {
    retriesRef.current = 0;
    setError(null);
    void pump();
  }, [pump]);

  const discard = useCallback(() => {
    if (busyRef.current) return;
    pendingRef.current = 0;
    inflightRef.current = null;
    retriesRef.current = 0;
    setError(null);
    sync();
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pendingRef.current || inflightRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { tap, retry, discard, unsaved: pending + inflight, error };
}
