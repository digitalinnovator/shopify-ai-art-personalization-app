import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ToastData } from '../lib/toast';
import { Icon } from './Icon';

interface ToastContextValue {
  show: (toast: ToastData) => void;
  dismiss: (id: string) => void;
  toasts: ToastData[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_HIDE_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (toast: ToastData) => {
      setToasts((current) => (current.some((t) => t.id === toast.id) ? current : [...current, toast]));
      timers.current.set(
        toast.id,
        setTimeout(() => dismiss(toast.id), AUTO_HIDE_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active.values()) clearTimeout(timer);
    };
  }, []);

  const value = useMemo(() => ({ show, dismiss, toasts }), [show, dismiss, toasts]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

/** Shows a toast once per action result (keyed by its id). Pass `actionData?.toast`. */
export function useActionToast(toast: ToastData | null | undefined): void {
  const { show } = useToast();
  const lastId = useRef<string | null>(null);
  useEffect(() => {
    if (!toast || toast.id === lastId.current) return;
    lastId.current = toast.id;
    show(toast);
  }, [toast, show]);
}

export function ToastHost() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="toast-host" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <output key={t.id} className={`toast toast--${t.tone}`}>
          <span className="toast__icon">
            <Icon
              name={t.tone === 'critical' ? 'alert-circle' : t.tone === 'success' ? 'check-circle' : 'info'}
              size={18}
            />
          </span>
          <span className="toast__text">{t.message}</span>
          <button
            type="button"
            className="toast__close"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
          >
            <Icon name="x" size={16} />
          </button>
        </output>
      ))}
    </div>
  );
}
