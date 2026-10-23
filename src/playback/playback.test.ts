import {
  STEPS_PER_SECOND_AT_1X,
  formatSpeed,
  initialPlayback,
  jumpToEnd,
  pause,
  play,
  restart,
  seek,
  setSpeed,
  sliderToSpeed,
  speedToSlider,
  stepBack,
  stepForward,
  suggestedSpeed,
  tick,
} from './playback';

const total = 1_000;

describe('playback', () => {
  it('starts paused at the beginning at 10× speed', () => {
    expect(initialPlayback()).toEqual({ position: 0, playing: false, speed: 10 });
  });

  it('advances by speed × steps per second while playing', () => {
    const playing = play(initialPlayback(), total);
    const later = tick(setSpeed(playing, 1), 500, total);
    expect(later.position).toBeCloseTo(STEPS_PER_SECOND_AT_1X / 2);
    expect(tick(setSpeed(playing, 2), 500, total).position).toBeCloseTo(STEPS_PER_SECOND_AT_1X);
  });

  it('does not move while paused', () => {
    expect(tick(initialPlayback(), 1_000, total).position).toBe(0);
  });

  it('stops at the end', () => {
    const end = tick(play(initialPlayback(), total), 60_000, total);
    expect(end).toMatchObject({ position: total, playing: false });
  });

  it('starts over when played from the end', () => {
    expect(play(jumpToEnd(initialPlayback(), total), total)).toMatchObject({
      position: 0,
      playing: true,
    });
  });

  it('steps one expansion at a time and pauses', () => {
    const midway = { position: 41.6, playing: true, speed: 10 };
    expect(stepForward(midway, total)).toEqual({ position: 42, playing: false, speed: 10 });
    expect(stepBack(midway)).toEqual({ position: 41, playing: false, speed: 10 });
    expect(stepBack({ ...midway, position: 41 })).toMatchObject({ position: 40 });
    expect(stepBack({ ...midway, position: 0 })).toMatchObject({ position: 0 });
    expect(stepForward({ ...midway, position: total }, total)).toMatchObject({ position: total });
  });

  it('seeks within bounds without changing whether it plays', () => {
    const playing = play(initialPlayback(), total);
    expect(seek(playing, 300, total)).toMatchObject({ position: 300, playing: true });
    expect(seek(playing, -5, total).position).toBe(0);
    expect(seek(playing, 5_000, total).position).toBe(total);
  });

  it('restarts from zero and plays; pauses on demand; jumps to the end paused', () => {
    expect(restart({ position: 500, playing: false, speed: 1 })).toEqual({
      position: 0,
      playing: true,
      speed: 1,
    });
    expect(pause(play(initialPlayback(), total)).playing).toBe(false);
    expect(jumpToEnd(play(initialPlayback(), total), total)).toMatchObject({
      position: total,
      playing: false,
    });
  });

  it('keeps speed between 0.1× and 100×', () => {
    expect(setSpeed(initialPlayback(), 0.01).speed).toBe(0.1);
    expect(setSpeed(initialPlayback(), 1_000).speed).toBe(100);
  });
});

describe('speed slider', () => {
  it('maps 0..3 onto 0.1×..100× logarithmically', () => {
    expect(sliderToSpeed(0)).toBeCloseTo(0.1);
    expect(sliderToSpeed(1)).toBeCloseTo(1);
    expect(sliderToSpeed(2)).toBeCloseTo(10);
    expect(sliderToSpeed(3)).toBeCloseTo(100);
    expect(speedToSlider(10)).toBeCloseTo(2);
  });

  it('formats speeds compactly', () => {
    expect(formatSpeed(0.1)).toBe('0.1×');
    expect(formatSpeed(1)).toBe('1×');
    expect(formatSpeed(2.512)).toBe('2.5×');
    expect(formatSpeed(31.6)).toBe('32×');
    expect(formatSpeed(100)).toBe('100×');
  });
});

describe('suggestedSpeed', () => {
  it('picks the preset speed that plays the whole search in about 15 seconds', () => {
    expect(suggestedSpeed(3_000)).toBe(1);
    expect(suggestedSpeed(30_000)).toBe(10);
    expect(suggestedSpeed(9_000)).toBe(3);
  });

  it('stays within 0.1× and 100×', () => {
    expect(suggestedSpeed(5)).toBe(0.1);
    expect(suggestedSpeed(5_000_000)).toBe(100);
  });
});
