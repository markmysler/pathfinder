import { algorithms, type AlgorithmId } from '../algorithms';
import { ALGORITHM_STYLE } from './algorithmStyle';
import { BothWaysIcon } from './icons';

/**
 * An algorithm's badge text, with two-way arrows for a search from both ends. Contraction
 * hierarchies runs from both ends too, but its badge only splits its colour in two.
 */
export function AlgorithmBadge({
  algorithm,
  className,
}: {
  algorithm: AlgorithmId;
  className?: string;
}) {
  const { bidirectional, advanced } = algorithms[algorithm];
  return (
    <span className={className} aria-hidden="true" data-two-way={bidirectional || undefined}>
      {bidirectional && !advanced && <BothWaysIcon size={11} strokeWidth={2.8} />}
      {ALGORITHM_STYLE[algorithm].badge}
    </span>
  );
}
