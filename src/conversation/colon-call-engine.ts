import type { ConversationContext, ConversationEngine, ConversationResult } from './conversation-engine.ts';
import { repeatedReplyCount } from './conversation-policy.ts';

// Authored lines stay separate from matching so personality changes remain small.
export const COLON_CALL_REPLIES = [
  'はーい！',
  'うん、聞いてるよ。',
  'はーい、コロンだよ。',
  '呼んでくれて、うれしいな。',
  'うん、お話を聞くよ。',
] as const;

function isColonCall(input: string): boolean {
  const text = input.normalize('NFKC').replace(/[\s　、，,。．.!！?？…「」『』]/g, '');
  // Match an entire call, never a name embedded in a question, request or safety report.
  return /^(?:(?:ねえ|ねぇ|ねー|おーい|おおい))?(?:コロ[ー〜～]*ン|ころ[ー〜～]*ん)(?:[ー〜～]*)(?:ちゃん|くん|君)?(?:いる|いるの|聞いて|きいて)?$/.test(text);
}

/** Responds to a name call without advancing the current story or game. */
export class ColonCallConversationEngine implements ConversationEngine {
  private readonly conversation: ConversationEngine;

  constructor(conversation: ConversationEngine) { this.conversation = conversation; }

  reply(input: string, context: ConversationContext): ConversationResult {
    if (!isColonCall(input)) return this.conversation.reply(input, context);

    const recentIds = (context.recentReplyIds ?? []).slice(-9);
    const recentTypes = (context.recentReplyTypes ?? []).slice(-9);
    const index = COLON_CALL_REPLIES.findIndex((_, candidate) => !recentIds.slice(-4).includes(`colon.name-call.${candidate}`));
    const selected = index >= 0 ? index : context.turn % COLON_CALL_REPLIES.length;
    const nextIds = [...recentIds, `colon.name-call.${selected}`].slice(-10);
    const nextTypes = [...recentTypes, 'ACKNOWLEDGE' as const].slice(-10);
    return {
      text: COLON_CALL_REPLIES[selected]!,
      topic: context.topic ?? 'daily',
      context: {
        ...context,
        turn: context.turn + 1,
        intent: 'request',
        recentReplyIds: nextIds,
        recentReplyTypes: nextTypes,
        lastReplyWasQuestion: false,
      },
      quality: {
        intent: 'request', replyType: 'ACKNOWLEDGE',
        questionRate: nextTypes.filter(type => type === 'QUESTION').length / nextTypes.length,
        duplicateReplyCount: repeatedReplyCount(nextIds),
        contextUsed: Boolean(context.topic), fallback: false, category: 'about-colon',
        ruleId: 'colon.name-call', fallbackReason: null, emotion: 'JOY',
      },
    };
  }
}
