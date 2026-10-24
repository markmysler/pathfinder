import { RouteTooLongError } from '../osm/area';
import { NotSavedError } from '../osm/load';
import { OverpassError } from '../osm/overpass';
import { NoRoadNearbyError } from '../osm/prepare';
import { describeError } from './protocol';

describe('describeError', () => {
  it('turns known failures into kinds the UI can explain', () => {
    expect(describeError(new RouteTooLongError(20_000))).toMatchObject({
      kind: 'route-too-long',
      meters: 20_000,
    });
    expect(describeError(new NoRoadNearbyError('car'))).toMatchObject({ kind: 'no-road' });
    expect(describeError(new OverpassError([{ endpoint: 'x', reason: 'HTTP 504' }]))).toMatchObject(
      {
        kind: 'download',
      },
    );
    expect(describeError(new NotSavedError())).toMatchObject({ kind: 'not-saved' });
    expect(describeError(new DOMException('Aborted', 'AbortError'))).toMatchObject({
      kind: 'cancelled',
    });
  });

  it('keeps the message of anything unexpected', () => {
    expect(describeError(new Error('boom'))).toEqual({ kind: 'unknown', message: 'boom' });
    expect(describeError('weird')).toEqual({ kind: 'unknown', message: 'weird' });
  });
});
