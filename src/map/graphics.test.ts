import { drawsInSoftware } from './graphics';

const DEBUG_INFO = { UNMASKED_RENDERER_WEBGL: 0x9246 };

/**
 * A canvas whose WebGL is accelerated, missing, or drawn in software: refused when asked to fail
 * on a major performance caveat (`caveat`), or given anyway under a software renderer's name.
 */
function fakeCanvas(kind: 'accelerated' | 'caveat' | 'named' | 'none') {
  const lost: unknown[] = [];
  const renderer =
    kind === 'named'
      ? 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'
      : 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU, OpenGL 4.6)';
  const context = {
    RENDERER: 0x1f01,
    getExtension: (name: string) =>
      name === 'WEBGL_lose_context'
        ? { loseContext: () => lost.push(context) }
        : name === 'WEBGL_debug_renderer_info'
          ? DEBUG_INFO
          : null,
    getParameter: (parameter: number) =>
      parameter === DEBUG_INFO.UNMASKED_RENDERER_WEBGL ? renderer : 'WebKit WebGL',
  };
  const canvas = {
    getContext: (_type: string, options?: WebGLContextAttributes) => {
      if (kind === 'none') return null;
      if (kind === 'caveat' && options?.failIfMajorPerformanceCaveat) return null;
      return context;
    },
  };
  return { create: () => canvas as unknown as HTMLCanvasElement, lost };
}

describe('drawsInSoftware', () => {
  it('is true when WebGL works, but only with a major performance caveat', () => {
    const { create, lost } = fakeCanvas('caveat');
    expect(drawsInSoftware(create)).toBe(true);
    expect(lost).toHaveLength(1);
  });

  it('is true when the renderer is a software one, such as SwiftShader or llvmpipe', () => {
    const { create, lost } = fakeCanvas('named');
    expect(drawsInSoftware(create)).toBe(true);
    expect(lost).toHaveLength(1);
  });

  it('is false when WebGL is accelerated, and lets the test context go at once', () => {
    const { create, lost } = fakeCanvas('accelerated');
    expect(drawsInSoftware(create)).toBe(false);
    expect(lost).toHaveLength(1);
  });

  it('is false without WebGL at all: there is no drawing to be slow', () => {
    expect(drawsInSoftware(fakeCanvas('none').create)).toBe(false);
  });
});
