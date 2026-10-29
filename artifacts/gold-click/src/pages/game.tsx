import { useEffect, useRef, useState } from "react";
import {
  useGetGame,
  getGetGameQueryKey,
  useOpenSession,
  type Player,
} from "@workspace/api-client-react";
import { HelpCircle, RefreshCw, Send, WifiOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { bootTelegram, haptic } from "@/lib/telegram";
import { useClickQueue } from "@/hooks/use-click-queue";

const PRACTICE_KEY = "gold-click:practice";
const fmt = (n: number) => n.toLocaleString("en-US");

type Floater = { id: number; x: number; y: number };

export default function Game() {
  const [initData] = useState<string | null>(() => bootTelegram());
  const game = useGetGame({ query: { queryKey: getGetGameQueryKey(), refetchInterval: 5000 } });
  const openSession = useOpenSession();
  const openRef = useRef(openSession.mutate);
  openRef.current = openSession.mutate;
  const [player, setPlayer] = useState<Player | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const startSession = () => {
    if (!initData) return;
    setSessionError(null);
    openRef.current(
      { data: { initData } },
      {
        onSuccess: (p) => setPlayer(p),
        onError: (e) => setSessionError(e instanceof Error ? e.message : "Could not verify you with Telegram"),
      },
    );
  };
  useEffect(() => {
    startSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData]);

  const queue = useClickQueue(player ? initData : null, (p) =>
    setPlayer((old) => (old && old.clicks > p.clicks ? { ...p, clicks: old.clicks } : p)),
  );

  const [practice, setPractice] = useState<number>(() => {
    const v = Number(localStorage.getItem(PRACTICE_KEY));
    return Number.isFinite(v) ? v : 0;
  });
  useEffect(() => {
    localStorage.setItem(PRACTICE_KEY, String(practice));
  }, [practice]);

  const mode: "verified" | "connecting" | "practice" = !initData
    ? "practice"
    : player
      ? "verified"
      : "connecting";
  const count = mode === "verified" ? (player?.clicks ?? 0) + queue.unsaved : practice;

  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [pulse, setPulse] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);

  const hit = (x?: number, y?: number) => {
    if (mode === "connecting") return;
    haptic();
    if (mode === "verified") queue.tap();
    else setPractice((p) => p + 1);
    const rect = btnRef.current?.getBoundingClientRect();
    const fx = x !== undefined && rect ? x - rect.left : (rect?.width ?? 0) / 2;
    const fy = y !== undefined && rect ? y - rect.top : (rect?.height ?? 0) / 3;
    const id = Date.now() + Math.random();
    setFloaters((f) => [...f.slice(-12), { id, x: fx, y: fy }]);
    setPulse((p) => p + 1);
    window.setTimeout(() => setFloaters((f) => f.filter((v) => v.id !== id)), 760);
  };

  const board = game.data?.leaderboard ?? [];
  const bot = game.data?.botUsername;

  return (
    <div className="grain min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-xl px-5 pb-16 pt-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="coin block h-6 w-6 rounded-full" style={{ boxShadow: "inset 0 -3px 6px rgba(120,60,0,.4)" }} />
            <h1 className="text-xl font-extrabold tracking-tight">Gold Click</h1>
          </div>
          <Dialog>
            <DialogTrigger
              data-testid="button-help"
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-xs uppercase tracking-wider hover:bg-secondary focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))]"
            >
              <HelpCircle className="h-3.5 w-3.5" /> Rules
            </DialogTrigger>
            <DialogContent className="bg-card">
              <DialogHeader>
                <DialogTitle className="text-2xl font-extrabold">How to play</DialogTitle>
                <DialogDescription>One circle. One number. Everyone racing.</DialogDescription>
              </DialogHeader>
              <ol className="space-y-3 text-sm">
                {[
                  "Open Gold Click inside Telegram. Your Telegram nickname is your name on the board.",
                  "Tap the gold circle. Or focus it and hold Space or Enter.",
                  "Taps are saved in small batches. If the connection drops, they wait and retry instead of vanishing.",
                  "Outside Telegram you can warm up in practice mode. Practice taps stay on this device and never reach the board.",
                ].map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="font-mono text-accent">0{i + 1}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            </DialogContent>
          </Dialog>
        </header>

        <StatusBar
          mode={mode}
          nickname={player?.nickname}
          rank={player?.rank}
          sessionError={sessionError}
          onRetrySession={startSession}
        />

        <section className="relative mt-6 overflow-hidden rounded-[2rem] bg-primary px-6 pb-10 pt-8 text-primary-foreground">
          <svg className="spin-slow pointer-events-none absolute -right-24 -top-24 h-72 w-72 opacity-15" viewBox="0 0 100 100" aria-hidden>
            {Array.from({ length: 24 }).map((_, i) => (
              <rect key={i} x="49" y="2" width="2" height="14" fill="currentColor" transform={`rotate(${i * 15} 50 50)`} />
            ))}
          </svg>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] opacity-70" data-testid="text-mode-label">
            {mode === "practice" ? "Practice counter / not ranked" : mode === "connecting" ? "Verifying with Telegram" : "Your ranked taps"}
          </p>
          <p className="mt-1 font-extrabold leading-none tabular-nums" style={{ fontSize: "clamp(3.5rem, 16vw, 6rem)" }} data-testid="text-count">
            {fmt(count)}
          </p>
          {mode === "verified" && (
            <p className="mt-2 font-mono text-xs opacity-75" data-testid="text-sync">
              {queue.unsaved > 0 ? `${queue.unsaved} saving...` : "All taps saved"}
            </p>
          )}

          <div className="relative mx-auto mt-8 flex aspect-square w-[min(68vw,280px)] items-center justify-center">
            <span key={pulse} className={pulse ? "ring-pulse absolute inset-0 rounded-full border-4 border-[#ffd84a]" : "hidden"} />
            <button
              ref={btnRef}
              data-testid="button-gold"
              aria-label={mode === "practice" ? "Tap gold circle, practice" : "Tap gold circle"}
              disabled={mode === "connecting"}
              onPointerDown={(e) => {
                e.preventDefault();
                hit(e.clientX, e.clientY);
              }}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  hit();
                }
              }}
              className="coin relative h-full w-full touch-manipulation select-none rounded-full disabled:opacity-60"
            >
              <span className="pointer-events-none absolute inset-[9%] rounded-full border-2 border-[#fff3b0]/50" />
              <span className="pointer-events-none font-extrabold tracking-tight text-[#7a4604]/80" style={{ fontSize: "clamp(1.4rem,6vw,2rem)" }}>
                TAP
              </span>
              {floaters.map((f) => (
                <span key={f.id} className="floater pointer-events-none absolute font-mono text-xl font-bold text-primary-foreground" style={{ left: f.x, top: f.y }}>
                  +1
                </span>
              ))}
            </button>
          </div>

          {queue.error && (
            <div className="mt-8 rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground" role="alert" data-testid="status-click-error">
              <p className="font-semibold">{queue.error}</p>
              <div className="mt-2 flex gap-2">
                <button data-testid="button-retry-clicks" onClick={queue.retry} className="rounded-full bg-card px-3 py-1 font-mono text-xs text-foreground">
                  Retry now
                </button>
                <button data-testid="button-discard-clicks" onClick={queue.discard} className="rounded-full border border-current px-3 py-1 font-mono text-xs">
                  Discard unsaved
                </button>
              </div>
            </div>
          )}

          {mode === "practice" && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="opacity-80">Practice taps stay on this device.</span>
              <div className="flex gap-2">
                {practice > 0 && (
                  <button data-testid="button-reset-practice" onClick={() => setPractice(0)} className="rounded-full border border-current/40 px-3 py-1.5 font-mono text-xs">
                    Reset
                  </button>
                )}
                {bot ? (
                  <a data-testid="link-open-telegram" href={`https://t.me/${bot}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#ffd84a] px-4 py-1.5 font-semibold text-[#3a2400]">
                    <Send className="h-3.5 w-3.5" /> Open in Telegram
                  </a>
                ) : (
                  <span className="font-mono text-xs opacity-70">Telegram link not configured</span>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="flex items-end justify-between">
            <h2 className="text-3xl font-extrabold tracking-tight">Leaderboard</h2>
            {game.data && (
              <p className="text-right font-mono text-[11px] uppercase leading-relaxed tracking-wider text-muted-foreground" data-testid="text-totals">
                {fmt(game.data.totalPlayers)} players
                <br />
                {fmt(game.data.totalClicks)} taps
              </p>
            )}
          </div>

          {game.isError && (
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-destructive/40 bg-card px-4 py-3 text-sm" role="alert">
              <span className="flex items-center gap-2 text-destructive"><WifiOff className="h-4 w-4" /> Can't reach the leaderboard.</span>
              <button data-testid="button-retry-board" onClick={() => game.refetch()} className="flex items-center gap-1 font-mono text-xs">
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </button>
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-3xl border border-card-border bg-card">
            {game.isLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 bg-muted" />)}
              </div>
            ) : board.length === 0 && !game.isError ? (
              <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="status-empty-board">
                <span className="coin mb-5 block h-14 w-14 rounded-full opacity-90" />
                <p className="text-xl font-extrabold">The board is wide open.</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">No one has tapped yet. The first Telegram player to press the circle takes the top spot.</p>
              </div>
            ) : (
              <table className="w-full text-left" data-testid="table-leaderboard">
                <thead>
                  <tr className="border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="w-14 py-3 pl-5 font-normal">Rank</th>
                    <th className="py-3 font-normal">Nickname</th>
                    <th className="py-3 pr-5 text-right font-normal">Taps</th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((p) => {
                    const me = player?.id === p.id;
                    const clicks = me ? Math.max(p.clicks, count) : p.clicks;
                    return (
                      <tr key={p.id} data-testid={`row-player-${p.id}`} className={`border-b border-border/60 last:border-0 ${me ? "bg-[#ffd84a]/30" : ""}`}>
                        <td className="py-3 pl-5">
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-bold ${p.rank === 1 ? "coin text-[#5a3300]" : p.rank <= 3 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            {p.rank}
                          </span>
                        </td>
                        <td className="max-w-0 truncate py-3 font-semibold">
                          {p.nickname}
                          {me && <span className="ml-2 font-mono text-[10px] uppercase text-accent">you</span>}
                        </td>
                        <td className="py-3 pr-5 text-right font-mono tabular-nums">{fmt(clicks)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {game.data && !game.data.pollingReady && (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">Telegram bot is still connecting on the server.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusBar(props: {
  mode: "verified" | "connecting" | "practice";
  nickname?: string;
  rank?: number;
  sessionError: string | null;
  onRetrySession: () => void;
}) {
  const { mode, nickname, rank, sessionError, onRetrySession } = props;
  return (
    <div className="mt-5 flex items-center justify-between gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm" data-testid="status-connection">
      {mode === "verified" && (
        <>
          <span className="flex min-w-0 items-center gap-2"><Dot c="#1f9d73" /><span className="truncate font-semibold">{nickname}</span></span>
          <span className="font-mono text-xs text-muted-foreground">rank #{rank}</span>
        </>
      )}
      {mode === "practice" && (
        <span className="flex items-center gap-2"><Dot c="hsl(var(--muted-foreground))" /> Not in Telegram. Practice mode.</span>
      )}
      {mode === "connecting" &&
        (sessionError ? (
          <>
            <span className="flex min-w-0 items-center gap-2 text-destructive"><Dot c="hsl(var(--destructive))" /><span className="truncate">{sessionError}</span></span>
            <button data-testid="button-retry-session" onClick={onRetrySession} className="font-mono text-xs underline">Retry</button>
          </>
        ) : (
          <span className="flex items-center gap-2"><Dot c="#f2b70f" /> Verifying your Telegram account...</span>
        ))}
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />;
}
