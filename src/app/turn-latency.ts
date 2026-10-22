export interface TurnLatencySummary {
  measurableTotalMs: number | null;
  complete: boolean;
  missing: string[];
  slowest: { name: string; milliseconds: number } | null;
}

/** Current-turn intervals only. Never adds percentiles from different turns. */
export class TurnLatencySegments {
  private readonly values = new Map<string, number>();
  private readonly unavailable = new Map<string, string>();

  clear(): void {
    this.values.clear();
    this.unavailable.clear();
  }

  record(name: string, startedAt: number | null, endedAt: number | null): boolean {
    if (startedAt === null || endedAt === null || !Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return false;
    this.values.set(name, endedAt - startedAt);
    this.unavailable.delete(name);
    return true;
  }

  markUnavailable(name: string, reason: string): void {
    if (!this.values.has(name)) this.unavailable.set(name, reason);
  }

  get(name: string): number | null { return this.values.get(name) ?? null; }

  summarize(names: string[]): TurnLatencySummary {
    const present = names.flatMap((name) => {
      const milliseconds = this.values.get(name);
      return milliseconds === undefined ? [] : [{ name, milliseconds }];
    });
    const missing = names.filter((name) => !this.values.has(name));
    const slowest = present.reduce<{ name: string; milliseconds: number } | null>(
      (largest, current) => !largest || current.milliseconds > largest.milliseconds ? current : largest,
      null,
    );
    return {
      measurableTotalMs: present.length ? present.reduce((sum, value) => sum + value.milliseconds, 0) : null,
      complete: names.length > 0 && missing.length === 0,
      missing: missing.map((name) => `${name}${this.unavailable.has(name) ? ` (${this.unavailable.get(name)})` : ''}`),
      slowest,
    };
  }
}
