import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastViewport, type Toast } from './ToastViewport.js';

const toasts: Toast[] = [
  { id: 1, kind: 'success', message: '第一条提示' },
  { id: 2, kind: 'error', message: '第二条提示' },
  { id: 3, kind: 'success', message: '第三条提示' },
  { id: 4, kind: 'success', message: '第四条提示' }
];
const firstToast = toasts[0]!;

afterEach(() => vi.useRealTimers());

describe('ToastViewport', () => {
  it('5 秒后自动关闭提示', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<ToastViewport toasts={[firstToast]} onDismiss={onDismiss} />);

    act(() => { vi.advanceTimersByTime(4_999); });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it('悬停时暂停倒计时，移开后从剩余时间继续', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<ToastViewport toasts={[firstToast]} onDismiss={onDismiss} />);

    act(() => { vi.advanceTimersByTime(2_000); });
    fireEvent.mouseEnter(screen.getByText('第一条提示'));
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseLeave(screen.getByText('第一条提示'));
    act(() => { vi.advanceTimersByTime(2_999); });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it('同时只显示前三条，关闭后由队列中的下一条补位', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<ToastViewport toasts={toasts} onDismiss={onDismiss} />);

    expect(screen.getByText('第一条提示')).toBeInTheDocument();
    expect(screen.getByText('第三条提示')).toBeInTheDocument();
    expect(screen.queryByText('第四条提示')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭第一条提示' }));
    expect(onDismiss).toHaveBeenCalledWith(1);

    rerender(<ToastViewport toasts={toasts.slice(1)} onDismiss={onDismiss} />);
    expect(screen.getByText('第四条提示')).toBeInTheDocument();
  });
});
