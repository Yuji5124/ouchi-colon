export type ReplyVoiceMode = 'ios' | 'tohoku' | 'haruka';

export const INITIAL_REPLY_VOICE_MODE: ReplyVoiceMode = 'tohoku';

/** Legacy talk=1 links return to TOHOKU; Haruka is available only by explicit opt-in. */
export function conversationLaunchSettings(search: string): {
  simpleConversationMode: boolean;
  debug: boolean;
  voiceMode: ReplyVoiceMode;
} {
  const params = new URLSearchParams(search);
  const simpleConversationMode = params.get('talk') === 'haruka';
  return {
    simpleConversationMode,
    debug: simpleConversationMode || params.has('debug') || params.get('talk') === '1',
    voiceMode: simpleConversationMode ? 'haruka' : INITIAL_REPLY_VOICE_MODE,
  };
}

export function canStartConversation(mode: ReplyVoiceMode, modelReady: boolean, audioActivated: boolean): boolean {
  return mode === 'ios' || mode === 'haruka' || (modelReady && audioActivated);
}

export function fallbackReplyVoice(): ReplyVoiceMode {
  return 'ios';
}
