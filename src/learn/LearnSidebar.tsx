import { useState } from 'react';
import { learnHref } from '../app/routes';
import { algoColor } from '../ui/algorithmStyle';
import { SearchIcon } from '../ui/icons';
import styles from './LearnSidebar.module.css';
import { COMING_LATER, GROUP_TITLE, TOPICS, type TopicGroup } from './topics';

const GROUPS: TopicGroup[] = ['foundations', 'algorithms', 'guides'];

export function LearnSidebar({ current }: { current: string | null }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);

  return (
    <nav aria-label="Learn topics" className={styles.sidebar}>
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
      {!q && (
        <a href={learnHref()} className={styles.link} aria-current={current ? undefined : 'page'}>
          Learn home
        </a>
      )}
      {GROUPS.map((group) => {
        const topics = TOPICS.filter(
          (t) => t.group === group && (matches(t.title) || matches(t.summary)),
        );
        if (!topics.length) return null;
        return (
          <div key={group} className={styles.group}>
            <h2 className={styles.heading}>{GROUP_TITLE[group]}</h2>
            {topics.map((t) => (
              <a
                key={t.slug}
                href={learnHref(t.slug)}
                className={styles.link}
                aria-current={t.slug === current ? 'page' : undefined}
                style={t.algorithm ? algoColor(t.algorithm) : undefined}
              >
                {t.algorithm && <span className={styles.dot} aria-hidden="true" />}
                {t.title}
              </a>
            ))}
          </div>
        );
      })}
      {!q && (
        <div className={styles.group}>
          <h2 className={styles.heading}>Advanced</h2>
          {COMING_LATER.map((title) => (
            <span key={title} className={styles.soon}>
              {title}
              <span className={styles.soonTag}>Soon</span>
            </span>
          ))}
        </div>
      )}
    </nav>
  );
}
