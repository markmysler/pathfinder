/** Renderers that draw WebGL on the CPU. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software/i;

/** Releases a context made only to ask a question. */
function letGo(context: WebGLRenderingContext | null) {
  context?.getExtension('WEBGL_lose_context')?.loseContext();
}

/** The renderer's own name, where the browser tells it. */
function rendererOf(context: WebGLRenderingContext): string {
  const info = context.getExtension('WEBGL_debug_renderer_info');
  return String(context.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : context.RENDERER));
}

/**
 * Whether WebGL here is drawn in software (SwiftShader, llvmpipe): big searches then freeze the
 * page while they are drawn. Browsers say so by refusing a context that would have a "major
 * performance caveat", but not always (headless Chrome's SwiftShader, for one), so the
 * renderer's name counts too.
 */
export function drawsInSoftware(
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): boolean {
  const fast = createCanvas().getContext('webgl2', { failIfMajorPerformanceCaveat: true });
  if (fast) {
    const software = SOFTWARE_RENDERER.test(rendererOf(fast));
    letGo(fast);
    return software;
  }
  const any = createCanvas().getContext('webgl2');
  letGo(any);
  return any !== null;
}

let known: boolean | undefined;
/** `drawsInSoftware`, asked once per page. */
export const drawingInSoftware = () => (known ??= drawsInSoftware());
