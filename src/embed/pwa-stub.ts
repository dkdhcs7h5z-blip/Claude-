/**
 * Used only by the self-contained preview build (VITE_EMBED=1), which runs
 * inside a sandboxed frame: no service worker, and window.confirm() is
 * unavailable there, so confirmations are accepted (demo data only).
 */
if (typeof window !== 'undefined') window.confirm = () => true;
export function registerSW(_opts?: unknown) {
  return async (_reload?: boolean) => {};
}
