import type { ReactNode } from 'react';
import styles from './SkipLink.module.css';

/**
 * The first thing Tab reaches: a link past the navigation to what the page is about. It moves
 * focus itself, since a hash link would change the route.
 */
export function SkipLink({ target, children }: { target: string; children: ReactNode }) {
  return (
    <a
      href={`#${target}`}
      className={styles.skip}
      onClick={(event) => {
        event.preventDefault();
        document.getElementById(target)?.focus();
      }}
    >
      {children}
    </a>
  );
}
