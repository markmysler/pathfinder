import { createCameraSync, type Camera } from './cameraSync';

const camera = (zoom: number): Camera => ({ center: [-58.37, -34.6], zoom, bearing: 0, pitch: 0 });

function member() {
  const seen: Camera[] = [];
  return { seen, setCamera: (c: Camera) => seen.push(c) };
}

describe('createCameraSync', () => {
  it('moves every other map when one is moved by hand', () => {
    const sync = createCameraSync();
    const [a, b, c] = [member(), member(), member()];
    [a, b, c].forEach((m) => sync.join(m));
    sync.moved(a, camera(14));
    expect(a.seen).toEqual([]);
    expect(b.seen).toEqual([camera(14)]);
    expect(c.seen).toEqual([camera(14)]);
  });

  it('leaves the others alone while unlinked, and lines them up when linked again', () => {
    const sync = createCameraSync();
    const [a, b] = [member(), member()];
    [a, b].forEach((m) => sync.join(m));
    sync.setLinked(false);
    sync.moved(a, camera(12));
    expect(b.seen).toEqual([]);
    sync.moved(b, camera(15));
    sync.setLinked(true);
    expect(a.seen).toEqual([camera(15)]);
    expect(b.seen).toEqual([]);
  });

  it('gives a map that joins later the shared view, and says so', () => {
    const sync = createCameraSync();
    const a = member();
    sync.join(a);
    expect(sync.join(member())).toBe(false);
    sync.moved(a, camera(13));
    const late = member();
    expect(sync.join(late)).toBe(true);
    expect(late.seen).toEqual([camera(13)]);
  });

  it('stops moving a map once it has left', () => {
    const sync = createCameraSync();
    const [a, b] = [member(), member()];
    [a, b].forEach((m) => sync.join(m));
    sync.leave(b);
    sync.moved(a, camera(10));
    expect(b.seen).toEqual([]);
  });
});
