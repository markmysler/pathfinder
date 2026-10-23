import type { ReactNode } from 'react';
import styles from './Segmented.module.css';

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface Props<T extends string> {
  legend: string;
  options: readonly Option<T>[];
  value: T;
  onChange(value: T): void;
}

/** A row of mutually exclusive toggle buttons. */
export function Segmented<T extends string>({ legend, options, value, onChange }: Props<T>) {
  return (
    <fieldset className={styles.group}>
      <legend className="visually-hidden">{legend}</legend>
      <div
        className={styles.track}
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.option}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
