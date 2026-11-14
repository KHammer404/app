import { useEffect, useLayoutEffect, useRef } from "react";
import { nativeRemote } from "./native";
/** USB commands reuse manual events without adding phone controls. */
export function useRemoteSwallow(sessionRunning: boolean, ready: boolean, onSwallow: () => Promise<boolean>) {
  const latest = useRef({ sessionRunning, ready, onSwallow });
  useLayoutEffect(() => { latest.current = { sessionRunning, ready, onSwallow }; }, [sessionRunning, ready, onSwallow]);
  const inFlight = useRef(false), seen = useRef(new Set<string>());
  useEffect(() => {
    if (!nativeRemote) return;
    let live = true;
    const listener = nativeRemote.addListener("onRemoteSwallow", ({ id }) => {
      const current = latest.current;
      if (seen.current.has(id)) return;
      if (!live || !current.sessionRunning || !current.ready || inFlight.current) {
        void nativeRemote!.completeAsync(id, false).catch(() => {}); return;
      }
      seen.current.add(id); inFlight.current = true;
      void (async () => {
        let accepted = false;
        try { accepted = await current.onSwallow(); }
        finally { await nativeRemote!.completeAsync(id, accepted).catch(() => {}); inFlight.current = false; }
      })().catch(() => {});
    });
    void nativeRemote.startAsync().then(() => {
      if (live) return nativeRemote!.setReadyAsync(latest.current.sessionRunning && latest.current.ready);
    }).catch(() => {});
    return () => { live = false; listener.remove(); void nativeRemote!.stopAsync().catch(() => {}); };
  }, []);
  useEffect(() => { void nativeRemote?.setReadyAsync(sessionRunning && ready).catch(() => {}); }, [sessionRunning, ready]);
}
