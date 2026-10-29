type TgWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  HapticFeedback?: { impactOccurred: (s: "light" | "medium" | "heavy") => void };
};

export function getWebApp(): TgWebApp | null {
  const w = window as unknown as { Telegram?: { WebApp?: TgWebApp } };
  return w.Telegram?.WebApp ?? null;
}

export function bootTelegram(): string | null {
  const app = getWebApp();
  if (!app) return null;
  try {
    app.ready();
    app.expand();
  } catch {
    /* ignore */
  }
  return app.initData ? app.initData : null;
}

export function haptic() {
  try {
    getWebApp()?.HapticFeedback?.impactOccurred("light");
  } catch {
    /* ignore */
  }
}
