import { learnHref } from '../app/routes';
import { topicFor } from './topics';
import { WHICH } from './which';
import { algoColor } from '../ui/algorithmStyle';
import styles from './Article.module.css';
import { WideTable } from './kit';

export function WhichTable() {
  return (
    <WideTable label="Which algorithm does what">
      <table>
        <thead>
          <tr>
            <th scope="col">Algorithm</th>
            <th scope="col">Takes next from the frontier</th>
            <th scope="col">Route it finds</th>
            <th scope="col">Good for</th>
          </tr>
        </thead>
        <tbody>
          {WHICH.map((row) => (
            <tr key={row.id} style={algoColor(row.id)}>
              <th scope="row">
                <a href={learnHref(topicFor(row.id)!.slug)} className={styles.algoName}>
                  <span className={styles.dot} aria-hidden="true" />
                  {row.name}
                </a>
              </th>
              <td>{row.takes}</td>
              <td>{row.finds}</td>
              <td>{row.goodFor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </WideTable>
  );
}
