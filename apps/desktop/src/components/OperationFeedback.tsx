import { CircleAlert, CircleCheck, X } from 'lucide-react';
import type { Feedback } from '../types.js';

export function OperationFeedback({ feedback, onDismiss }: { feedback: Feedback | null; onDismiss?: () => void }) {
  if (!feedback) return null;
  return (
    <div className={`feedback feedback--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
      {feedback.kind === 'error' ? <CircleAlert size={18} /> : <CircleCheck size={18} />}
      <div><strong>{feedback.message}</strong>{feedback.suggestion && <code>{feedback.suggestion}</code>}</div>
      {onDismiss && <button className="icon-button" aria-label="关闭反馈" onClick={onDismiss}><X size={16} /></button>}
    </div>
  );
}
