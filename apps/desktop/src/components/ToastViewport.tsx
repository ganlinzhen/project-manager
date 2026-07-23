import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Feedback } from '../types.js';

const TOAST_DURATION_MS = 5_000;
const MAX_VISIBLE_TOASTS = 3;

export type Toast = Feedback & { id: number };

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const remainingRef = useRef(TOAST_DURATION_MS);
  const [paused, setPaused] = useState(false);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  useEffect(() => {
    if (paused) return;
    startedAtRef.current = Date.now();
    timeoutRef.current = setTimeout(() => onDismiss(toast.id), remainingRef.current);
    return clearTimer;
  }, [clearTimer, onDismiss, paused, toast.id]);

  function pause() {
    if (paused || startedAtRef.current === null) return;
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
    clearTimer();
    setPaused(true);
  }

  return (
    <div
      className={`toast toast--${toast.kind}`}
      role={toast.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={pause}
      onMouseLeave={() => setPaused(false)}
    >
      {toast.kind === 'error' ? <CircleAlert size={18} /> : <CircleCheck size={18} />}
      <div><strong>{toast.message}</strong>{toast.suggestion && <code>{toast.suggestion}</code>}</div>
      <button className="icon-button" aria-label={`关闭${toast.message}`} onClick={() => onDismiss(toast.id)}><X size={16} /></button>
    </div>
  );
}

export function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return <div className="toast-viewport" aria-label="操作通知">{toasts.slice(0, MAX_VISIBLE_TOASTS).map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />)}</div>;
}
