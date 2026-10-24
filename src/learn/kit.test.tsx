import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WideTable } from './kit';

describe('WideTable', () => {
  it('can be reached from the keyboard, as a region named after its table, to scroll it', async () => {
    render(
      <WideTable label="How much ALT saves">
        <table>
          <tbody>
            <tr>
              <td>1 km</td>
            </tr>
          </tbody>
        </table>
      </WideTable>,
    );
    await userEvent.tab();
    const region = screen.getByRole('region', { name: 'How much ALT saves' });
    expect(region).toHaveFocus();
    expect(region).toContainElement(screen.getByRole('table'));
  });
});
