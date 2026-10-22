import type { ConversationIntent, ReplyType } from './conversation-engine.ts';

export interface ConversationPolicyInput {
  intent: ConversationIntent;
  hasKnownSubject: boolean;
  hasCorrection: boolean;
  lastQuestion: boolean;
  recentTypes: readonly ReplyType[];
  recentQuestionCount: number;
}

/** Deterministic, bounded question policy. Explicit questions and repairs take priority. */
export function chooseReplyType(input: ConversationPolicyInput): ReplyType {
  if (input.intent === 'question') return 'SHARE';
  if (input.intent === 'correction') return input.hasKnownSubject ? 'ACKNOWLEDGE' : 'QUESTION';
  if (input.intent === 'request') return 'ACKNOWLEDGE';
  if (input.intent === 'refusal') return 'ACKNOWLEDGE';
  if (input.intent === 'greeting') return 'REACT';
  if (input.intent === 'unknown') return input.lastQuestion ? 'ACKNOWLEDGE' : 'QUESTION';

  const lastTwo = input.recentTypes.slice(-2);
  const questionLimitReached = lastTwo.length === 2 && lastTwo.every((type) => type === 'QUESTION');
  const questionRate = input.recentTypes.length ? input.recentQuestionCount / input.recentTypes.length : 0;
  const shouldAsk = !input.lastQuestion && !questionLimitReached && questionRate < 0.3
    && input.hasKnownSubject && (input.recentTypes.length + 1) % 4 === 0;
  if (shouldAsk) return 'QUESTION';

  const sequence: readonly ReplyType[] = input.hasCorrection
    ? ['ACKNOWLEDGE', 'IMAGINE', 'PLAY']
    : ['REACT', 'ACKNOWLEDGE', 'SHARE', 'IMAGINE', 'PLAY'];
  const preferred = sequence[input.recentTypes.length % sequence.length]!;
  if (input.recentTypes.at(-1) !== preferred) return preferred;
  return sequence[(sequence.indexOf(preferred) + 1) % sequence.length]!;
}

export function repeatedReplyCount(replyIds: readonly string[]): number {
  const seen = new Set<string>();
  let repeats = 0;
  for (const id of replyIds) {
    if (seen.has(id)) repeats += 1;
    else seen.add(id);
  }
  return repeats;
}
