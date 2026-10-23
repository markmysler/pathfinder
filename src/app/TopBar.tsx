import type { ReactNode } from 'react';
import { BookIcon, LogoIcon, MapIcon } from '../ui/icons';
import type { Route } from './hooks';
import styles from './TopBar.module.css';

interface Props {
  route: Route;
  /** Page-specific content after the navigation, e.g. the route being watched. */
  children?: ReactNode;
  /** Hides the phone tab bar for full-screen views like watching a search. */
  immersive?: boolean;
}

const current = (route: Route, page: Route) => (route === page ? 'page' : undefined);

/** The desktop header and, on phones, the bottom tab bar. */
export function TopBar({ route, children, immersive = false }: Props) {
  return (
    <>
      <header className={styles.header}>
        <a href="#/" className={styles.logo}>
          <LogoIcon />
          Pathfinder
        </a>
        <nav aria-label="Main" className={styles.nav}>
          <a href="#/" className={styles.link} aria-current={current(route, 'explore')}>
            Explore
          </a>
          <a href="#/learn" className={styles.link} aria-current={current(route, 'learn')}>
            Learn
          </a>
        </nav>
        {children && <div className={styles.extra}>{children}</div>}
      </header>
      <nav aria-label="Main" className={styles.tabs} data-hidden={immersive}>
        <a href="#/" className={styles.tab} aria-current={current(route, 'explore')}>
          <MapIcon size={22} />
          Explore
        </a>
        <a href="#/learn" className={styles.tab} aria-current={current(route, 'learn')}>
          <BookIcon size={22} />
          Learn
        </a>
      </nav>
    </>
  );
}
