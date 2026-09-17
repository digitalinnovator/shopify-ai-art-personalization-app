export type ToastTone = 'success' | 'critical' | 'info';

export interface ToastData {
  id: string;
  tone: ToastTone;
  message: string;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Build toast data in an action; the `id` lets the UI show each action result exactly once. */
export function toastData(tone: ToastTone, message: string): ToastData {
  return { id: newId(), tone, message };
}

/** Toasts that survive a redirect, passed as `?toast=<key>`. */
const TOAST_BY_KEY: Record<string, { tone: ToastTone; message: string }> = {
  created: { tone: 'success', message: 'Design created as a draft.' },
  'test-started': { tone: 'success', message: 'Test run started. Results appear below as they finish.' },
  published: { tone: 'success', message: 'Design published.' },
};

export function toastFromSearch(url: string | URL): ToastData | null {
  const key = new URL(url).searchParams.get('toast');
  const found = key ? TOAST_BY_KEY[key] : undefined;
  return found ? { id: `key-${key}-${Date.now()}`, ...found } : null;
}
