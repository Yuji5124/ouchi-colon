import type { ConversationResult } from '../conversation/conversation-engine.ts';
export interface ReplyMotion { left: -1 | 0 | 1; right: -1 | 0 | 1; label: string }
/** Authored metadata only; never turn arbitrary spoken motor commands into movement. */
export function motionForReply(result: ConversationResult, emotion: string): ReplyMotion | null {
  if (result.topic === 'safety' || result.quality?.category === 'safety' || result.quality?.fallback
    || ['unknown', 'farewell', 'refusal'].includes(result.quality?.intent ?? '') || result.topic === 'bedtime') return null;
  if (emotion === 'JOY') return { left: 1, right: 0, label: 'うれしい・小さく向きを変える' };
  if (emotion === 'SURPRISE') return { left: 0, right: 1, label: 'びっくり・小さく向きを変える' };
  return null;
}
export class ReplyMotionGate {
  mode: 'off' | 'reply' | 'rc' = 'off';
  private turn = 0;
  private started = false;
  private plan: ReplyMotion | null = null;
  prepare(turn: number, result: ConversationResult, emotion: string): void {
    this.turn = turn; this.started = false; this.plan = motionForReply(result, emotion);
  }
  start(turn: number): ReplyMotion | null {
    if (turn !== this.turn || this.started || this.mode !== 'reply') return null;
    this.started = true;
    return this.plan;
  }
  cancel(): void { this.turn++; this.started = true; this.plan = null; }
}
