import { algorithms, type AlgorithmId } from '../algorithms';
import { ALGORITHM_STYLE } from './algorithmStyle';
import { BothWaysIcon } from './icons';

/** An algorithm's badge text, with two-way arrows for a search from both ends. */
export function AlgorithmBadge({
  algorithm,
  className,
}: {
  algorithm: AlgorithmId;
  className?: string;
}) {
  const twoWay = algorithms[algorithm].bidirectional;
  return (
    <span className={className} aria-hidden="true" data-two-way={twoWay || undefined}>
      {twoWay && <BothWaysIcon size={11} strokeWidth={2.8} />}
      {ALGORITHM_STYLE[algorithm].badge}
    </span>
  );
}
