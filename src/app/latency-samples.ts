/** Bounded in-memory timing samples. No utterance text or device identifiers are accepted. */
export class LatencySamples {
  private readonly values = new Map<string, number[]>();
  private readonly limit: number;
  constructor(limit = 200) { this.limit = limit; }

  record(name: string, milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
    const samples = this.values.get(name) ?? [];
    samples.push(milliseconds);
    if (samples.length > this.limit) samples.shift();
    this.values.set(name, samples);
  }

  recordBetween(name: string, startedAt: number | null, endedAt: number | null): boolean {
    if (startedAt === null || endedAt === null || !Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return false;
    this.record(name, endedAt - startedAt);
    return true;
  }

  summary(name: string): { count: number; last: number | null; median: number | null; p95: number | null } {
    const values = this.values.get(name) ?? [];
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return { count: 0, last: null, median: null, p95: null };
    const median = sorted.length % 2
      ? sorted[Math.floor(sorted.length / 2)]!
      : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
    const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!;
    return { count: sorted.length, last: values.at(-1) ?? null, median, p95 };
  }

  clear(): void { this.values.clear(); }
}
