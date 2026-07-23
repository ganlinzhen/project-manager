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
      className={`flex w-full items-start gap-3 rounded-lg border bg-card p-3 shadow-lg ${toast.kind === 'error' ? 'border-red-200 text-red-700' : 'border-emerald-200 text-emerald-700'}`}
      role={toast.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={pause}
      onMouseLeave={() => setPaused(false)}
    >
      {toast.kind === 'error' ? <CircleAlert size={18} /> : <CircleCheck size={18} />}
      <div className="min-w-0 flex-1"><strong className="block text-sm">{toast.message}</strong>{toast.suggestion && <code className="mt-1 block whitespace-pre-wrap text-xs text-muted-foreground">{toast.suggestion}</code>}</div>
      <button className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-muted" aria-label={`关闭${toast.message}`} onClick={() => onDismiss(toast.id)}><X size={16} /></button>
    </div>
  );
}

export function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return <div className="fixed top-12 left-1/2 z-30 flex w-[min(480px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2" aria-label="操作通知">{toasts.slice(0, MAX_VISIBLE_TOASTS).map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />)}</div>;
}
