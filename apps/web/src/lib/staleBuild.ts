import { errorMessage } from "./types";

const FLAG = "blind-bluff:stale-build-reload";
/** A second failure inside this window means a reload did not help: stop instead of looping. */
const RETRY_AFTER_MS = 30_000;

const STALE_PATTERNS = [
  /dynamically imported module/i,
  /Failed to load module script/i,
  /Importing a module script failed/i,
];

export type RecoveryDeps = {
  now: () => number;
  getFlag: () => string | null;
  setFlag: (value: string) => void;
  unregisterWorkers: () => Promise<void>;
  clearCaches: () => Promise<void>;
  reload: () => void;
};

/** True when an error means the browser asked for a hashed file that a newer deploy has removed. */
export function isStaleBuildError(error: unknown): boolean {
  if (error === undefined || error === null) return false;
  const message = errorMessage(error);
  return STALE_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * After a deploy, a browser still running the old app shell asks for old hashed chunks that no longer exist; the host
 * answers with index.html, which fails as a module. Dropping the old service worker and caches and reloading fetches
 * the new build. Reloads at most once per window so a real outage cannot loop.
 */
export async function recoverFromStaleBuild(deps: RecoveryDeps): Promise<boolean> {
  const last = Number(deps.getFlag() ?? 0);
  if (deps.now() - last < RETRY_AFTER_MS) return false;
  deps.setFlag(String(deps.now()));
  for (const step of [deps.unregisterWorkers, deps.clearCaches]) {
    try {
      await step();
    } catch (error) {
      console.error("recoverFromStaleBuild: cleanup step failed", errorMessage(error));
    }
  }
  deps.reload();
  return true;
}

const browserDeps = (): RecoveryDeps => ({
  now: () => Date.now(),
  getFlag: () => {
    try {
      return window.sessionStorage.getItem(FLAG);
    } catch (error) {
      console.error("staleBuild: reading the reload flag failed", errorMessage(error));
      return null;
    }
  },
  setFlag: (value) => {
    try {
      window.sessionStorage.setItem(FLAG, value);
    } catch (error) {
      console.error("staleBuild: saving the reload flag failed", errorMessage(error));
    }
  },
  unregisterWorkers: async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  },
  clearCaches: async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  },
  reload: () => window.location.reload(),
});

/** Listens for chunk-load failures and recovers automatically. Call once at startup. */
export function installStaleBuildRecovery(): void {
  const recover = (): void => void recoverFromStaleBuild(browserDeps());
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    recover();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleBuildError(event.reason)) recover();
  });
}
