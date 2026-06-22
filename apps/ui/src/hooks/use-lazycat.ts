import { useEffect, useState } from "react";

/**
 * Thin, lazy, capability-gated wrappers around the LazyCat client SDK
 * (`@lazycatcloud/sdk`). Everything degrades to "unavailable" when MediaGo is
 * not running inside the LazyCat client (plain browser / Electron / SSR), so
 * callers can fall back to the built-in player and hide client-only actions.
 *
 * The SDK is dynamically imported so it stays out of the initial bundle and a
 * non-client environment never pays for it beyond one failed capability probe.
 */

type Caps = { inClient: boolean; names: Set<string> };

let capsPromise: Promise<Caps> | null = null;

async function loadAppCommon() {
  const mod = await import("@lazycatcloud/sdk/dist/extentions");
  return mod.AppCommon;
}

function detectCaps(): Promise<Caps> {
  if (!capsPromise) {
    capsPromise = (async () => {
      try {
        const AppCommon = await loadAppCommon();
        const list = await AppCommon.GetCapabilitys();
        return {
          inClient: true,
          names: new Set((list ?? []).map((c) => c.name)),
        };
      } catch {
        // Not inside the LazyCat client (or capability query unsupported).
        return { inClient: false, names: new Set<string>() };
      }
    })();
  }
  return capsPromise;
}

export interface LazycatApi {
  /** Running inside the LazyCat client (vs a plain browser / Electron). */
  inClient: boolean;
  /** The client exposes a native video player capability. */
  hasNativePlayer: boolean;
  /** Open a streamable video URL in the device's native video player. */
  openNativePlayer: (
    url: string,
    name: string,
    id: string | number,
  ) => Promise<void>;
  /** Share a local file out to other apps (path is the client-visible path). */
  shareFile: (path: string) => Promise<void>;
}

export function useLazycat(): LazycatApi {
  const [caps, setCaps] = useState<Caps>({
    inClient: false,
    names: new Set<string>(),
  });

  useEffect(() => {
    let alive = true;
    detectCaps().then((c) => {
      if (alive) setCaps(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  return {
    inClient: caps.inClient,
    hasNativePlayer: caps.names.has("player"),
    openNativePlayer: async (url, name, id) => {
      const AppCommon = await loadAppCommon();
      await AppCommon.OpenNativeVideoPlayer({
        playlist: { items: [{ file: url, id: String(id), name }] },
      });
    },
    shareFile: async (path) => {
      const AppCommon = await loadAppCommon();
      await AppCommon.ShareWithFiles(path);
    },
  };
}
