import type { Expression } from '../character/face-renderer.ts';

export type ReactionEvent =
  | 'FACE_FOUND'
  | 'FACE_LOST'
  | 'VOICE_INPUT_STARTED'
  | 'UTTERANCE_DETECTED'
  | 'UTTERANCE_ENDED'
  | 'RESPONSE_STARTED'
  | 'RESPONSE_ENDED'
  | 'IDLE_TIMEOUT'
  | 'WAKE';

export type ReactionExpression = Expression | 'LISTENING';
export type ReactionEffect = 'FACE_GREETING' | 'VOICE_SURPRISE' | 'SLEEP_WAKE' | null;

export interface ReactionOutput {
  expression: ReactionExpression;
  gaze: 'TRACK_FACE' | 'CENTER';
  blink: boolean;
  mouthOpen: number;
  effect: ReactionEffect;
}

const FACE_REACTION_COOLDOWN_MS = 5000;

/** Event-driven, in-memory reaction state machine. It never stores conversation or identity data. */
export class ReactionEngine {
  private expression: ReactionExpression = 'IDLE';
  private facePresent = false;
  private interactionActive = false;
  private lastFaceReactionAt = Number.NEGATIVE_INFINITY;

  handle(event: ReactionEvent, now: number): ReactionOutput {
    let blink = false;
    let mouthOpen = 0;
    let effect: ReactionEffect = null;

    switch (event) {
      case 'FACE_FOUND': {
        const newlyFound = !this.facePresent;
        this.facePresent = true;
        if (newlyFound && !this.interactionActive) {
          if (this.expression === 'SLEEP' || now - this.lastFaceReactionAt >= FACE_REACTION_COOLDOWN_MS) {
            this.expression = 'HAPPY';
            this.lastFaceReactionAt = now;
            effect = 'FACE_GREETING';
            blink = true;
          } else if (this.expression === 'SEARCH') {
            this.expression = 'IDLE';
          }
        }
        break;
      }
      case 'FACE_LOST':
        this.facePresent = false;
        if (!this.interactionActive) this.expression = 'SEARCH';
        break;
      case 'VOICE_INPUT_STARTED':
        this.interactionActive = true;
        this.expression = 'LISTENING';
        break;
      case 'UTTERANCE_DETECTED':
        this.interactionActive = true;
        this.expression = 'SURPRISE';
        effect = 'VOICE_SURPRISE';
        blink = true;
        break;
      case 'UTTERANCE_ENDED':
        this.interactionActive = true;
        this.expression = 'THINK';
        break;
      case 'RESPONSE_STARTED':
        this.interactionActive = true;
        this.expression = 'TALK';
        mouthOpen = 0.3;
        break;
      case 'RESPONSE_ENDED':
        this.interactionActive = false;
        this.expression = this.facePresent ? 'IDLE' : 'SEARCH';
        break;
      case 'IDLE_TIMEOUT':
        if (!this.interactionActive) this.expression = 'SLEEP';
        break;
      case 'WAKE':
        if (this.expression === 'SLEEP') {
          this.expression = 'HAPPY';
          effect = 'SLEEP_WAKE';
          blink = true;
        }
        break;
    }

    return {
      expression: this.expression,
      gaze: this.facePresent ? 'TRACK_FACE' : 'CENTER',
      blink,
      mouthOpen,
      effect,
    };
  }

  get isInteractionActive(): boolean { return this.interactionActive; }
}
