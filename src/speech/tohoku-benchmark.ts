export const TOHOKU_BENCHMARK_TEXTS = [
  'こんにちは、きょうもいっしょにあそぼう。',
  'わあ、すてきなおもちゃだね。',
  'きょうはなにをしてあそんだの？',
  'いっしょにおえかきをしよう。',
  'そのおはなしをもっときかせて。',
  'おそとにはどんなものがあった？',
  'ねこさんはどこへいったのかな。',
  'おやつはなにをたべたの？',
  'あめがやんだらおそとへいこう。',
  'それはびっくりしたね。',
  'だいじょうぶ、ゆっくりでいいよ。',
  'もういっかいおしえてくれる？',
  'あかいくるまがはしっているね。',
  'つぎはどんなあそびにする？',
  'きょうのいちばんたのしかったことはなあに？',
  'おほしさまがきらきらしているね。',
  'いっしょにうたをうたおう。',
  'そのアイデア、とってもおもしろいね。',
  'おはなししてくれてありがとう。',
  'またいっしょにあそぼうね。',
] as const;

export type TohokuBenchmarkProgress = { completed: number; total: number; generationMs: number };
export type TohokuBenchmarkResult = { samples: number[]; cancelled: boolean };

export class TohokuBenchmarkError extends Error {
  readonly iteration: number;

  constructor(iteration: number, cause: unknown) {
    super(`連続生成 ${iteration}/${TOHOKU_BENCHMARK_TEXTS.length} 回目で失敗しました。`);
    this.name = 'TohokuBenchmarkError';
    this.iteration = iteration;
    if (cause instanceof Error) this.cause = cause;
  }
}

export async function runTohokuBenchmark(
  generate: (text: string) => Promise<number>,
  onProgress: (progress: TohokuBenchmarkProgress) => void,
  shouldCancel: () => boolean = () => false,
): Promise<TohokuBenchmarkResult> {
  const samples: number[] = [];
  for (const [index, text] of TOHOKU_BENCHMARK_TEXTS.entries()) {
    if (shouldCancel()) return { samples, cancelled: true };
    let generationMs: number;
    try {
      generationMs = await generate(text);
    } catch (error) {
      throw new TohokuBenchmarkError(index + 1, error);
    }
    if (!Number.isFinite(generationMs) || generationMs < 0) {
      throw new TohokuBenchmarkError(index + 1, new Error('生成時間が不正です。'));
    }
    samples.push(generationMs);
    onProgress({ completed: samples.length, total: TOHOKU_BENCHMARK_TEXTS.length, generationMs });
  }
  return { samples, cancelled: false };
}

export function summarizeTohokuSamples(samples: readonly number[]): { count: number; median: number | null; p95: number | null; max: number | null } {
  if (!samples.length) return { count: 0, median: null, p95: null, max: null };
  const ordered = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : ordered[middle] ?? null;
  const p95 = ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? null;
  return { count: ordered.length, median, p95, max: ordered.at(-1) ?? null };
}
