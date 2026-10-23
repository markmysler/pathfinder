import styles from './Pseudocode.module.css';

const KEYWORDS = /\b(function|while|for each|if|return|in|is not|not in)\b/g;

/** A line of pseudocode with its keywords marked. */
function Code({ text, note }: { text: string; note?: string }) {
  const pieces: (string | { keyword: string })[] = [];
  let last = 0;
  for (const match of text.matchAll(KEYWORDS)) {
    pieces.push(text.slice(last, match.index), { keyword: match[0] });
    last = match.index + match[0].length;
  }
  pieces.push(text.slice(last));
  return (
    <span className={styles.code}>
      {pieces.map((piece, i) =>
        typeof piece === 'string' ? (
          piece
        ) : (
          <span key={i} className={styles.keyword}>
            {piece.keyword}
          </span>
        ),
      )}
      {note && <span className={styles.note}> {note}</span>}
    </span>
  );
}

interface Props {
  lines: readonly string[];
  /** Lines that run, tinted (numbered from 1). */
  run?: readonly number[];
  /** The line to point at. */
  focus?: number;
  /** A short remark after the focused line, like "6:26 < 7:02 ✓". */
  note?: string;
  /** Larger type for articles. */
  size?: 'small' | 'large';
}

/** Numbered pseudocode, tinted in the colour of the enclosing `--algo`. */
export function PseudocodeListing({ lines, run = [], focus, note, size = 'small' }: Props) {
  return (
    <div
      className={`${styles.listing} ${size === 'large' ? styles.large : ''}`}
      role="figure"
      aria-label={focus ? `Pseudocode, line ${focus} highlighted` : 'Pseudocode'}
    >
      {lines.map((text, i) => {
        const n = i + 1;
        const focused = n === focus;
        return (
          <div
            key={n}
            className={styles.line}
            data-run={run.includes(n) || focused || undefined}
            data-focus={focused || undefined}
            aria-current={focused ? 'step' : undefined}
          >
            <span className={styles.number} aria-hidden="true">
              {n}
            </span>
            <Code text={text} note={focused ? note : undefined} />
          </div>
        );
      })}
    </div>
  );
}
