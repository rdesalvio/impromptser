import { useEffect, useRef } from "react";

/**
 * Fire `fn` on the render where `condition` flips from false to true.
 * Useful for one-shot side effects tied to state transitions (e.g. play a
 * sound when it becomes my turn) without running on every state update.
 */
export function useTransitionEffect(condition: boolean, fn: () => void): void {
  const prevRef = useRef(false);
  useEffect(() => {
    if (condition && !prevRef.current) fn();
    prevRef.current = condition;
    // We intentionally don't depend on `fn` — callers can pass an inline lambda
    // without triggering re-fires from referential identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condition]);
}
