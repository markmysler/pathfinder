import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RushHourFigure } from './RushHour';

describe('RushHourFigure', () => {
  it('starts on clear roads, with the route along the top', () => {
    render(<RushHourFigure />);
    expect(screen.getByRole('button', { name: 'Clear roads' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/On clear roads/)).toHaveTextContent(
      'On clear roads the best way from S to T is S → A → B → T: 2 + 3 + 1 = 6.',
    );
    expect(screen.getByRole('img')).toHaveAccessibleName(/best route S, A, B, T, costing 6/);
  });

  it('jams one road at rush hour and shows Dijkstra taking the other way', async () => {
    render(<RushHourFigure />);
    await userEvent.click(screen.getByRole('button', { name: 'Rush hour' }));
    expect(screen.getByText(/At rush hour/)).toHaveTextContent(
      'At rush hour A–B moves at a quarter of its speed, so it costs 3 ÷ 0.25 = 12 and the way along the top now costs 15. The same Dijkstra, run on the new costs, takes S → C → D → T: 2 + 2 + 3 = 7.',
    );
    expect(screen.getByRole('img')).toHaveAccessibleName(
      /A to B is jammed and costs 12 instead of 3/,
    );
    expect(screen.getByText('Its route on clear roads · 6')).toBeInTheDocument();
  });
});
