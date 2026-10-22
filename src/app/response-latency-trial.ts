export type ResponseTrialMode = 'A' | 'B';
export type ResponseTrialCounter = 'turns' | 'noResponse' | 'recognitionErrors' | 'resumeSuccess' | 'resumeFailure' | 'cutOff' | 'misrecognized' | 'doubleReply';

export type ResponseTrialSummary = Record<ResponseTrialCounter, number>;

const empty = (): ResponseTrialSummary => ({ turns: 0, noResponse: 0, recognitionErrors: 0, resumeSuccess: 0, resumeFailure: 0, cutOff: 0, misrecognized: 0, doubleReply: 0 });

/** Session-only A/B counters; manual observations are intentionally guardian-entered. */
export class ResponseLatencyTrial {
  private readonly values: Record<ResponseTrialMode, ResponseTrialSummary> = { A: empty(), B: empty() };

  record(mode: ResponseTrialMode, counter: ResponseTrialCounter): void {
    this.values[mode][counter] += 1;
  }

  summary(mode: ResponseTrialMode): ResponseTrialSummary { return { ...this.values[mode] }; }

  clear(): void {
    this.values.A = empty();
    this.values.B = empty();
  }
}
