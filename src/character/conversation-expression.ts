import type { ConversationContext, ConversationResult } from '../conversation/conversation-engine.ts';
import type { Expression } from './face-renderer.ts';

export const conversationEmotions = ['NORMAL', 'JOY', 'SURPRISE', 'THINKING', 'SAD', 'SLEEPY'] as const;
export type ConversationEmotion = (typeof conversationEmotions)[number];
export type ConversationDisplayState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';

export interface ConversationExpressionSnapshot {
  state: ConversationDisplayState;
  emotion: ConversationEmotion;
  faceExpression: Expression;
  speaking: boolean;
  generation: number;
}

const FACE_EXPRESSION: Record<ConversationEmotion, Expression> = {
  NORMAL: 'IDLE',
  JOY: 'HAPPY',
  SURPRISE: 'SURPRISE',
  THINKING: 'THINK',
  SAD: 'SAD',
  SLEEPY: 'SLEEP',
};

export function faceExpressionForEmotion(emotion: ConversationEmotion | string | null | undefined): Expression {
  return emotion && Object.hasOwn(FACE_EXPRESSION, emotion)
    ? FACE_EXPRESSION[emotion as ConversationEmotion]
    : FACE_EXPRESSION.NORMAL;
}

/** Uses engine intent and in-memory play/story transitions; text scanning is only a fallback. */
export function chooseConversationEmotion(
  input: string,
  result: ConversationResult,
  previous: ConversationContext,
): ConversationEmotion {
  if (result.topic === 'safety' || result.quality?.category === 'safety') return 'NORMAL';
  const explicit = result.quality?.emotion;
  if (explicit && conversationEmotions.includes(explicit)) return explicit;

  const rule = result.quality?.ruleId ?? '';
  if (rule.includes('transform')) return 'SURPRISE';
  if (rule.startsWith('story.start.')) return 'JOY';
  if (result.context.playInvitation?.phase === 'playing'
    && (previous.playInvitation?.phase !== 'playing' || previous.playInvitation?.gameId !== result.context.playInvitation.gameId)) return 'JOY';
  if (result.topic === 'sad' || result.quality?.category === 'feelings' && result.quality.intent === 'emotion') return 'SAD';
  if (result.quality?.intent === 'greeting' || result.quality?.intent === 'proposal' && result.topic === 'play') return 'JOY';
  if (result.quality?.intent === 'repeat'
    || result.quality?.intent === 'unknown' && (result.quality.replyType === 'QUESTION' || /[？?]/.test(result.text))) return 'THINKING';
  if (previous.story && result.context.story && previous.story.event !== result.context.story.event) {
    return /見つけた|現れた|変身/.test(result.context.story.event) ? 'SURPRISE' : 'NORMAL';
  }
  if (/^(?:ねむ|眠|おやすみ)/.test(input.trim()) && result.topic === 'bedtime') return 'SLEEPY';
  return 'NORMAL';
}

/** Separates interaction timing from the emotional face shown during a reply. */
export class ConversationExpressionController {
  private state: ConversationDisplayState = 'IDLE';
  private emotion: ConversationEmotion = 'NORMAL';
  private generation = 0;

  beginListening(): number {
    this.generation += 1;
    this.state = 'LISTENING';
    this.emotion = 'NORMAL';
    return this.generation;
  }

  beginThinking(): number {
    this.generation += 1;
    this.state = 'THINKING';
    this.emotion = 'THINKING';
    return this.generation;
  }

  setEmotion(generation: number, emotion: ConversationEmotion | string | null | undefined): boolean {
    if (generation !== this.generation) return false;
    this.emotion = conversationEmotions.includes(emotion as ConversationEmotion)
      ? emotion as ConversationEmotion
      : 'NORMAL';
    return true;
  }

  startSpeaking(generation: number): boolean {
    if (generation !== this.generation) return false;
    this.state = 'SPEAKING';
    return true;
  }

  finish(generation: number): boolean {
    if (generation !== this.generation) return false;
    this.state = 'IDLE';
    this.emotion = 'NORMAL';
    return true;
  }

  setIdleEmotion(emotion: ConversationEmotion): void {
    this.generation += 1;
    this.state = 'IDLE';
    this.emotion = emotion;
  }

  reset(): void {
    this.generation += 1;
    this.state = 'IDLE';
    this.emotion = 'NORMAL';
  }

  snapshot(): ConversationExpressionSnapshot {
    return {
      state: this.state,
      emotion: this.emotion,
      faceExpression: this.state === 'LISTENING' ? 'THINK' : FACE_EXPRESSION[this.emotion],
      speaking: this.state === 'SPEAKING',
      generation: this.generation,
    };
  }
}
