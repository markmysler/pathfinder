import fc from 'fast-check';
import { MinHeap } from './minHeap';

describe('MinHeap', () => {
  it('starts empty', () => {
    const heap = new MinHeap<string>();
    expect(heap.size).toBe(0);
    expect(heap.pop()).toBeUndefined();
  });

  it('pops entries in ascending priority', () => {
    const heap = new MinHeap<string>();
    heap.push('c', 3);
    heap.push('a', 1);
    heap.push('b', 2);
    expect(heap.size).toBe(3);
    expect(heap.pop()).toEqual({ value: 'a', priority: 1 });
    expect(heap.pop()).toEqual({ value: 'b', priority: 2 });
    expect(heap.pop()).toEqual({ value: 'c', priority: 3 });
    expect(heap.size).toBe(0);
  });

  it('pops equal priorities in insertion order', () => {
    const heap = new MinHeap<string>();
    for (const value of ['first', 'second', 'third']) heap.push(value, 7);
    expect([heap.pop()?.value, heap.pop()?.value, heap.pop()?.value]).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('matches a stable sort for any sequence of pushes', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -50, max: 50 })), (priorities) => {
        const heap = new MinHeap<number>();
        priorities.forEach((priority, index) => heap.push(index, priority));
        const popped = priorities.map(() => heap.pop()!.value);
        const expected = priorities
          .map((priority, index) => ({ priority, index }))
          .sort((a, b) => a.priority - b.priority || a.index - b.index)
          .map(({ index }) => index);
        expect(popped).toEqual(expected);
      }),
    );
  });

  it('stays ordered when pushes and pops interleave', () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.integer({ min: 0, max: 20 }), fc.constant(null))), (ops) => {
        const heap = new MinHeap<number>();
        const reference: number[] = [];
        for (const op of ops) {
          if (op === null) {
            reference.sort((a, b) => a - b);
            expect(heap.pop()?.priority).toBe(reference.shift());
          } else {
            heap.push(op, op);
            reference.push(op);
          }
          expect(heap.size).toBe(reference.length);
        }
      }),
    );
  });
});
