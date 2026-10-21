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

  summary(name: string): { count: number; median: number | null; p95: number | null } {
    const sorted = [...(this.values.get(name) ?? [])].sort((a, b) => a - b);
    if (!sorted.length) return { count: 0, median: null, p95: null };
    const median = sorted.length % 2
      ? sorted[Math.floor(sorted.length / 2)]!
      : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
    const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!;
    return { count: sorted.length, median, p95 };
  }

  clear(): void { this.values.clear(); }
}
