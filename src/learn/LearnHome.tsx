import { useState } from 'react';
import { algorithms } from '../algorithms';
import { learnHref } from '../app/routes';
import { algoColor, ALGORITHM_STYLE } from '../ui/algorithmStyle';
import { ChevronRightIcon, SearchIcon } from '../ui/icons';
import styles from './LearnHome.module.css';
import { COMING_LATER, TOPICS } from './topics';
import { WhichTable } from './WhichTable';

const foundations = TOPICS.filter((t) => t.group === 'foundations');
const algorithmTopics = TOPICS.filter((t) => t.group === 'algorithms');

const yes = (value: boolean) => (value ? 'Yes' : 'No');

export function LearnHome() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const found = q
    ? TOPICS.filter((t) => `${t.title} ${t.summary}`.toLowerCase().includes(q))
    : null;

  return (
    <main className={styles.home}>
      <header className={styles.header}>
        <h1 className={styles.title}>Learn</h1>
        <p className={styles.lede}>
          How route-finding algorithms think, one idea at a time. Every article has a diagram you
          can step through, the pseudocode, and a button that runs the algorithm on real streets.
        </p>
      </header>

      {/* Phones have no sidebar, so the search lives here. */}
      <label className={styles.search}>
        <SearchIcon size={16} />
        <span className={styles.visuallyHidden}>Search topics</span>
        <input
          type="search"
          placeholder="Search topics"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {found ? (
        <section aria-label="Search results" className={styles.section}>
          {found.length ? (
            <ul className={styles.list}>
              {found.map((t) => (
                <li key={t.slug}>
                  <a href={learnHref(t.slug)} className={styles.row}>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{t.title}</span>
                      <span className={styles.rowSummary}>{t.summary}</span>
                    </span>
                    <ChevronRightIcon />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>No topics match &ldquo;{query}&rdquo;.</p>
          )}
        </section>
      ) : (
        <>
          <section aria-labelledby="start-here" className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 id="start-here" className={styles.h2}>
                Start here
              </h2>
              <p className={styles.note}>New to graphs? Read these four in order.</p>
            </div>
            <div className={styles.startGrid}>
              {foundations.map((t) => (
                <a key={t.slug} href={learnHref(t.slug)} className={styles.card}>
                  <span className={styles.cardTitle}>
                    <span className={styles.number} aria-hidden="true">
                      {t.index}
                    </span>
                    {t.title}
                  </span>
                  <span className={styles.cardText}>{t.summary}</span>
                </a>
              ))}
            </div>
          </section>

          <section aria-labelledby="algos" className={styles.section}>
            <h2 id="algos" className={styles.h2}>
              Algorithms
            </h2>
            <div className={styles.algoGrid}>
              {algorithmTopics.map((t) => {
                const info = algorithms[t.algorithm!];
                const style = ALGORITHM_STYLE[t.algorithm!];
                return (
                  <a
                    key={t.slug}
                    href={learnHref(t.slug)}
                    className={`${styles.card} ${styles.algoCard}`}
                    style={algoColor(t.algorithm!)}
                  >
                    <span className={styles.cardTitle}>
                      <span className={styles.badge} aria-hidden="true">
                        {style.badge}
                      </span>
                      {t.title}
                    </span>
                    <span className={styles.cardText}>{style.blurb}</span>
                    <span className={styles.phoneSummary}>{t.summary}</span>
                    <dl className={styles.facts}>
                      <div>
                        <dt>Cheapest route</dt>
                        <dd data-yes={info.optimal}>{yes(info.optimal)}</dd>
                      </div>
                      <div>
                        <dt>Uses an estimate</dt>
                        <dd data-yes={info.informed}>{yes(info.informed)}</dd>
                      </div>
                    </dl>
                    <ChevronRightIcon className={styles.chevron} />
                  </a>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="which-home" className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 id="which-home" className={styles.h2}>
                Which algorithm when?
              </h2>
              <a href={learnHref('which')} className={styles.more}>
                Read the full guide
              </a>
            </div>
            <WhichTable />
          </section>

          <section aria-labelledby="later" className={styles.section}>
            <h2 id="later" className={styles.h2}>
              Coming later
            </h2>
            <div className={styles.soonRow}>
              {COMING_LATER.map((title) => (
                <span key={title} className={styles.soon}>
                  {title}
                  <span className={styles.soonTag}>Soon</span>
                </span>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
