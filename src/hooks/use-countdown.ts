import { useEffect, useState } from "react";

// ============================================================================
// useCountdown — live countdown to a target timestamp (ms)
// Placeholder hook for the upcoming Motion Sprint; animation to be layered on
// top later. For now it just re-renders once per second.
// ============================================================================

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** True once the target timestamp has been reached. */
  expired: boolean;
}

const TICK_MS = 1000;

function diffParts(target: number): CountdownParts {
  const diff = Math.max(0, target - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: diff <= 0,
  };
}

export function useCountdown(target: number | undefined | null): CountdownParts | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (target === undefined || target === null) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [target]);

  if (target === undefined || target === null) return null;
  return diffParts(target);
}
