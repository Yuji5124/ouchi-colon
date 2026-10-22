export type ResumeBlockReason =
  | 'stale-reply'
  | 'page-hidden'
  | 'guardian-stopped'
  | 'session-changed'
  | 'reply-not-finished'
  | 'recognition-already-active'
  | 'speech-output-busy'
  | null;

export interface RecognitionResumeState {
  isCurrentReply: boolean;
  pageVisible: boolean;
  sessionEnabled: boolean;
  sameSession: boolean;
  voiceReplyFinished: boolean;
  recognitionActive: boolean;
  speechOutputBusy: boolean;
}

export const RESUME_BUSY_RETRY_DELAYS_MS = [150, 300, 600] as const;
export const MAX_EMPTY_RESULT_RESTARTS = 3;

export type RecognitionErrorAction = 'recover-quietly' | 'retry-network-once' | 'stop';

export function recognitionErrorAction(code: string, networkRetries: number): RecognitionErrorAction {
  if (code === 'no-speech') return 'recover-quietly';
  if (code === 'network' && networkRetries < 1) return 'retry-network-once';
  return 'stop';
}

export function recognitionResumeBlockReason(state: RecognitionResumeState): ResumeBlockReason {
  if (!state.isCurrentReply) return 'stale-reply';
  if (!state.pageVisible) return 'page-hidden';
  if (!state.sessionEnabled) return 'guardian-stopped';
  if (!state.sameSession) return 'session-changed';
  if (!state.voiceReplyFinished) return 'reply-not-finished';
  if (state.recognitionActive) return 'recognition-already-active';
  if (state.speechOutputBusy) return 'speech-output-busy';
  return null;
}

export function canRecoverFromEmptyRecognitionResult(consecutiveEmptyResults: number, maximumRestarts: number): boolean {
  return consecutiveEmptyResults > 0 && consecutiveEmptyResults <= maximumRestarts;
}

export function shouldResumeAfterReply(reason: 'finished' | 'stopped' | 'error' | 'text-only', sessionEnabled: boolean, voiceTurn: boolean): boolean {
  return (reason === 'finished' || reason === 'text-only') && sessionEnabled && voiceTurn;
}
