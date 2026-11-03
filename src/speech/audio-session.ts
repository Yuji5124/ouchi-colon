export interface AudioSessionNavigator {
  audioSession?: { type: string };
}

/** Prefer the media channel for replies; release that preference before microphone input. */
export function setAudioSessionType(
  type: 'auto' | 'playback',
  browser: AudioSessionNavigator = typeof navigator === 'undefined' ? {} : navigator as AudioSessionNavigator,
): boolean {
  try {
    if (!browser.audioSession) return false;
    browser.audioSession.type = type;
    return browser.audioSession.type === type;
  } catch {
    // Older Safari and a denied audio-session preference remain recoverable.
    return false;
  }
}
