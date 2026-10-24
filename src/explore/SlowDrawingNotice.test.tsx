import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlowDrawingNotice } from './SlowDrawingNotice';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  } as unknown as Storage;
}

describe('SlowDrawingNotice', () => {
  it('says big searches can freeze when the browser draws without acceleration', () => {
    render(<SlowDrawingNotice software storage={memoryStorage()} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'This browser is drawing the map without graphics acceleration.',
    );
  });

  it('says nothing when drawing is accelerated', () => {
    const { container } = render(<SlowDrawingNotice software={false} storage={memoryStorage()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('goes once read, and stays gone in this browser', async () => {
    const storage = memoryStorage();
    const { unmount } = render(<SlowDrawingNotice software storage={storage} />);
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    unmount();
    render(<SlowDrawingNotice software storage={storage} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
