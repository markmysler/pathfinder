import type { AlgorithmId } from '../algorithms';
import { sideColors } from '../ui/algorithmStyle';
import { hexToRgb, type Rgb } from './hexToRgb';

/** The colours to draw an algorithm's search in: one per side, the same twice if one-way. */
export const explorationColors = (algorithm: AlgorithmId) =>
  sideColors(algorithm).map(hexToRgb) as [Rgb, Rgb];
