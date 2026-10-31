export type ReplyVoiceMode = 'ios' | 'tohoku' | 'haruka';

export const INITIAL_REPLY_VOICE_MODE: ReplyVoiceMode = 'tohoku';

export function canStartConversation(mode: ReplyVoiceMode, modelReady: boolean, audioActivated: boolean): boolean {
  return mode === 'ios' || mode === 'haruka' || (modelReady && audioActivated);
}

export function fallbackReplyVoice(): ReplyVoiceMode {
  return 'ios';
}
