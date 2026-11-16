import { beforeEach, describe, expect, it, vi } from "vitest";

import { isStaleBuildError, recoverFromStaleBuild, type RecoveryDeps } from "./staleBuild";

const makeDeps = (stored: string | null = null): RecoveryDeps & { saved: string[] } => {
  const saved: string[] = [];
  return {
    saved,
    now: () => 1_000_000,
    getFlag: () => stored,
    setFlag: (value) => void saved.push(value),
    unregisterWorkers: vi.fn(async () => undefined),
    clearCaches: vi.fn(async () => undefined),
    reload: vi.fn(),
  };
};

describe("recoverFromStaleBuild", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("should drop the old service worker and caches and reload when the build is stale", async () => {
    expect(await recoverFromStaleBuild(deps)).toBe(true);
    expect(deps.unregisterWorkers).toHaveBeenCalledOnce();
    expect(deps.clearCaches).toHaveBeenCalledOnce();
    expect(deps.reload).toHaveBeenCalledOnce();
    expect(deps.saved).toEqual(["1000000"]);
  });

  it("should not reload again when it already tried a moment ago", async () => {
    deps = makeDeps("990000");
    expect(await recoverFromStaleBuild(deps)).toBe(false);
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it("should try again when the last attempt was long ago", async () => {
    deps = makeDeps("1");
    expect(await recoverFromStaleBuild(deps)).toBe(true);
    expect(deps.reload).toHaveBeenCalledOnce();
  });

  it("should still reload when clearing the old worker fails", async () => {
    deps.unregisterWorkers = vi.fn(async () => {
      throw new Error("blocked");
    });
    expect(await recoverFromStaleBuild(deps)).toBe(true);
    expect(deps.reload).toHaveBeenCalledOnce();
  });
});

describe("isStaleBuildError", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://x/assets/a.js",
    "error loading dynamically imported module",
    "Failed to load module script: Expected a JavaScript-or-Wasm module script",
    "Importing a module script failed.",
  ])("should treat %s as a stale build", (message) => {
    expect(isStaleBuildError(new Error(message))).toBe(true);
  });

  it("should ignore unrelated errors", () => {
    expect(isStaleBuildError(new Error("User rejected the request"))).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
  });
});
