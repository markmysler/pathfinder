import { TopBar } from '../app/TopBar';
import styles from './LearnPage.module.css';

/** Placeholder until the Learn articles arrive (phase 6). */
export function LearnPage() {
  return (
    <div className={styles.page}>
      <TopBar route="learn" />
      <main className={styles.main}>
        <h1>Learn</h1>
        <p>
          In-depth articles on every algorithm are on the way: how each one picks its next step,
          diagrams you can step through, pseudocode, and how much work it does.
        </p>
        <p>
          Until then, try <a href="#/">Explore</a>: pick two places, choose an algorithm, and use
          the inspector to follow it step by step.
        </p>
      </main>
    </div>
  );
}
