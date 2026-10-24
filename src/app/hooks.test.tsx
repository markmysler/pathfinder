import { act, renderHook } from '@testing-library/react';
import { useAnimationClock, useElementHeight, useHashRoute, useOnline } from './hooks';

describe('useHashRoute', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('reads the page from the URL hash and follows changes', () => {
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toBe('explore');
    act(() => {
      window.location.hash = '#/learn';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toBe('learn');
  });
});

describe('useAnimationClock', () => {
  it('reports the time between animation frames while running', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const onFrame = vi.fn();
    const { rerender } = renderHook(({ running }) => useAnimationClock(running, onFrame), {
      initialProps: { running: true },
    });
    act(() => frames.shift()!(1_000));
    act(() => frames.shift()!(1_016));
    expect(onFrame).toHaveBeenCalledWith(16);
    rerender({ running: false });
    const callsWhenStopped = onFrame.mock.calls.length;
    frames.splice(0).forEach((frame) => act(() => frame(2_000)));
    expect(onFrame.mock.calls.length).toBe(callsWhenStopped);
  });
});

describe('useElementHeight', () => {
  it('reports an element height as it changes', () => {
    let notify: ResizeObserverCallback = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const element = document.createElement('div');
    const { result } = renderHook(() => useElementHeight({ current: element }));
    expect(result.current).toBe(0);
    act(() =>
      notify([{ contentRect: { height: 420 } } as ResizeObserverEntry], {} as ResizeObserver),
    );
    expect(result.current).toBe(420);
    vi.unstubAllGlobals();
  });
});

describe('useOnline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says whether the browser has a connection, and follows it', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
    act(() => {
      onLine.mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
    act(() => {
      onLine.mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
  });
});
