import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Segmented } from './Segmented';

const options = [
  { value: 'car', label: 'Car' },
  { value: 'walk', label: 'Walk' },
] as const;

describe('Segmented', () => {
  it('marks the selected option as pressed inside a named group', () => {
    render(<Segmented legend="Travel mode" options={options} value="walk" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Travel mode' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Walk' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Car' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the option the user picks', async () => {
    const onChange = vi.fn();
    render(<Segmented legend="Travel mode" options={options} value="walk" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Car' }));
    expect(onChange).toHaveBeenCalledWith('car');
  });
});
