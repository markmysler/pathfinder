import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { liveTraffic } from '../test/traffic';
import { TrafficCoverage, TrafficKey, TrafficNotice, TrafficStoryCard } from './TrafficViews';
import { trafficSummary } from './trafficText';

describe('TrafficStoryCard', () => {
  it('tells how traffic moved the route, with the clear and jammed costs', () => {
    render(<TrafficStoryCard outcome={liveTraffic()} objective="fastest" />);
    expect(screen.getByRole('heading', { name: 'Traffic changed the route' })).toBeInTheDocument();
    const text = screen.getByText(/On clear roads/);
    expect(text).toHaveTextContent(
      'On clear roads the best route takes 9:40 (the dotted line). Right now Avenida de Mayo is moving at 18% of its usual speed, so that way would take 17:05. The best route now goes along Hipólito Yrigoyen: 2:40 slower than on clear roads, but the fastest way today.',
    );
  });

  it('says when a closed road blocks the clear route', () => {
    const outcome = liveTraffic();
    outcome.story = {
      ...outcome.story,
      clear: { ...outcome.story.clear, costNow: Infinity },
      jammed: { name: 'Avenida de Mayo', share: 0 },
    };
    render(<TrafficStoryCard outcome={outcome} objective="fastest" />);
    expect(screen.getByText(/On clear roads/)).toHaveTextContent(
      'Right now Avenida de Mayo is closed, so that way can’t be driven.',
    );
  });

  it('says when traffic slowed the route without moving it', () => {
    const outcome = liveTraffic();
    outcome.story = { ...outcome.story, changed: false, best: 700, via: undefined };
    render(<TrafficStoryCard outcome={outcome} objective="fastest" />);
    expect(screen.getByRole('heading', { name: 'Traffic slowed the route' })).toBeInTheDocument();
    expect(screen.getByText(/Same roads/)).toHaveTextContent(
      'Same roads as on a clear day, but 2:00 slower: 11:40 instead of 9:40. The slowest stretch is Avenida de Mayo, at 18% of its usual speed.',
    );
  });

  it('keeps to closures for the shortest route', () => {
    const outcome = liveTraffic();
    outcome.story = { ...outcome.story, clear: { ...outcome.story.clear, cost: 2400 }, best: 2700 };
    render(<TrafficStoryCard outcome={outcome} objective="shortest" />);
    expect(
      screen.getByRole('heading', { name: 'A closure changed the route' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Traffic doesn’t change/)).toHaveTextContent(
      'Traffic doesn’t change how long roads are, but closed roads can’t be used: the shortest route is now 2.7 km instead of 2.4 km.',
    );
  });
});

describe('trafficSummary', () => {
  it('gives the one-line version for the phone sheet', () => {
    expect(trafficSummary(liveTraffic(), 'fastest')).toBe(
      'Avenida de Mayo is jammed, so the best route takes Hipólito Yrigoyen: 2:40 slower than clear roads, fastest today.',
    );
  });
});

describe('TrafficCoverage', () => {
  it('says how much of the map had live speeds, and when they were fetched', () => {
    render(<TrafficCoverage outcome={liveTraffic()} />);
    expect(screen.getByText(/Live speeds on/)).toHaveTextContent(
      /^Live speeds on 1,840 of 2,310 car roads \(80%\): 212 slowed, 3 closed\. The rest keep their speed limits\. Fetched at 14:32 from TomTom\.$/,
    );
  });
});

describe('TrafficNotice', () => {
  it('explains a refused key and offers to check it', async () => {
    const onCheckKey = vi.fn();
    render(
      <TrafficNotice
        outcome={{ status: 'failed', provider: 'tomtom', reason: 'key' }}
        onCheckKey={onCheckKey}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'No live traffic: TomTom refused your key. These routes use speed limits instead.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Check key' }));
    expect(onCheckKey).toHaveBeenCalled();
  });

  it('explains a used-up quota without offering a key check', () => {
    render(
      <TrafficNotice
        outcome={{ status: 'failed', provider: 'here', reason: 'quota' }}
        onCheckKey={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/your HERE key has used up its requests/);
    expect(screen.queryByRole('button', { name: 'Check key' })).not.toBeInTheDocument();
  });

  it('counts traffic tiles that never arrived', () => {
    render(<TrafficNotice outcome={liveTraffic({ missingTiles: 4 })} onCheckKey={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      '4 traffic tiles didn’t arrive. Roads there keep their speed limits.',
    );
  });

  it('says nothing when all went well', () => {
    const { container } = render(<TrafficNotice outcome={liveTraffic()} onCheckKey={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TrafficKey', () => {
  it('shows what the traffic colours mean, with a switch for the layer', async () => {
    const onToggle = vi.fn();
    render(<TrafficKey on onToggle={onToggle} clearRoute />);
    expect(screen.getByText('Without traffic')).toBeInTheDocument();
    expect(screen.getByText('Jammed')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Traffic' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);
    expect(onToggle).toHaveBeenCalled();
  });
});
