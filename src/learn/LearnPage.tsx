import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PHONE, useHash, useMediaQuery } from '../app/hooks';
import { learnHref, parseHash } from '../app/routes';
import { TopBar } from '../app/TopBar';
import { algoColor } from '../ui/algorithmStyle';
import { ChevronLeftIcon } from '../ui/icons';
import { ARTICLES } from './articles';
import articleStyles from './Article.module.css';
import { LearnHome } from './LearnHome';
import styles from './LearnPage.module.css';
import { LearnSidebar } from './LearnSidebar';
import { GROUP_TITLE, topicBySlug } from './topics';

export function LearnPage() {
  const location = parseHash(useHash());
  const slug = location.page === 'learn' ? location.topic : null;
  const phone = useMediaQuery(PHONE);
  const topic = slug ? topicBySlug(slug) : undefined;

  // A new topic starts at the top of the page, like a new page would.
  useEffect(() => {
    // Braces matter: newer browsers return a promise from scrollTo, which React would call.
    window.scrollTo?.(0, 0);
  }, [slug]);

  const Article = topic ? ARTICLES[topic.slug] : undefined;
  const content = !slug ? (
    <LearnHome />
  ) : Article && topic ? (
    <main
      className={articleStyles.article}
      style={topic.algorithm ? algoColor(topic.algorithm) : ({} as CSSProperties)}
    >
      <article>
        <Article />
      </article>
    </main>
  ) : (
    <main className={articleStyles.article}>
      <h1 className={articleStyles.title}>No such topic</h1>
      <p className={articleStyles.lede}>There is no article called &ldquo;{slug}&rdquo;.</p>
      <p>
        <a href={learnHref()}>Back to Learn</a>
      </p>
    </main>
  );

  return (
    <div className={styles.page}>
      <TopBar route="learn" />
      {phone && topic && (
        <header className={styles.phoneHeader}>
          <a href={learnHref()} className={styles.back}>
            <ChevronLeftIcon size={20} />
            Learn
          </a>
          <span className={styles.where}>
            {GROUP_TITLE[topic.group]} · {topic.index} of {topic.of}
          </span>
        </header>
      )}
      <div className={styles.body}>
        {!phone && <LearnSidebar current={slug} />}
        {content}
        {!phone && topic && <OnThisPage key={topic.slug} />}
      </div>
    </div>
  );
}

/** Links to the article's sections, read from its headings once it has rendered. */
function OnThisPage() {
  const [sections, setSections] = useState<{ id: string; label: string }[]>([]);
  const self = useRef<HTMLElement>(null);
  useEffect(() => {
    const article = self.current?.parentElement?.querySelector('article');
    const headings = article ? [...article.querySelectorAll('h2[id]')] : [];
    setSections(headings.map((h) => ({ id: h.id, label: h.textContent ?? '' })));
  }, []);
  return (
    <aside ref={self} aria-label="On this page" className={styles.toc}>
      <h2 className={styles.tocTitle}>On this page</h2>
      <ul>
        {sections.map((s) => (
          <li key={s.id}>
            {/* Hash links would change the route, so these scroll instead. */}
            <a
              href={window.location.hash}
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
