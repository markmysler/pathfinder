import '@testing-library/jest-dom/vitest';

// jsdom draws nothing and says so on every getContext call; answer as it would, quietly. Tests
// that run in plain Node have no canvas at all.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
}
