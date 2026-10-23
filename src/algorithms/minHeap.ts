interface Entry<T> {
  value: T;
  priority: number;
  seq: number;
}

/**
 * Binary min-heap. Entries with equal priority pop in insertion order, so searches that use it
 * are fully deterministic.
 */
export class MinHeap<T> {
  private readonly entries: Entry<T>[] = [];
  private nextSeq = 0;

  get size(): number {
    return this.entries.length;
  }

  push(value: T, priority: number): void {
    this.entries.push({ value, priority, seq: this.nextSeq++ });
    this.siftUp(this.entries.length - 1);
  }

  pop(): { value: T; priority: number } | undefined {
    const top = this.entries[0];
    const last = this.entries.pop();
    if (top === undefined || last === undefined) return undefined;
    if (this.entries.length > 0) {
      this.entries[0] = last;
      this.siftDown(0);
    }
    return { value: top.value, priority: top.priority };
  }

  private less(i: number, j: number): boolean {
    const a = this.entries[i]!;
    const b = this.entries[j]!;
    return a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq);
  }

  private swap(i: number, j: number): void {
    [this.entries[i], this.entries[j]] = [this.entries[j]!, this.entries[i]!];
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) return;
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const n = this.entries.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.less(left, smallest)) smallest = left;
      if (right < n && this.less(right, smallest)) smallest = right;
      if (smallest === i) return;
      this.swap(i, smallest);
      i = smallest;
    }
  }
}
