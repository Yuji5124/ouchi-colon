import type { ConversationTopic } from './conversation-engine.ts';

/** Uses only a child-started greeting and the device-local clock; it never schedules speech. */
export function greetingForLocalTime(input: string, now: Date): string {
  const text = input.trim();
  if (/おはよ/.test(text)) return 'おはよう！きょうも会えてうれしいな。';
  if (/こんばんは|こんばんわ/.test(text)) return 'こんばんは！今日もお話しできてうれしいな。';

  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return 'おはよう！きょうも会えてうれしいな。';
  if (hour >= 11 && hour < 17) return 'こんにちは！会えてうれしいな。';
  if (hour >= 17 && hour < 21) return 'こんばんは！今日もお話しできてうれしいな。';
  return 'こんばんは！夜の時間だね。ゆっくりお話ししよう。';
}

export function replyToReportedMood(input: string, topic: ConversationTopic): string | null {
  const text = input.trim();
  if (topic === 'bedtime' && /つかれ|疲れ|ねむ|眠/.test(text)) {
    return 'つかれたんだね。少し休もうね。ねむい時は、近くの大人にも伝えてね。';
  }
  if (topic === 'sad' || topic === 'scared') {
    return 'そうだったんだね。話してくれてありがとう。近くの大人にもお話ししてね。';
  }
  return null;
}

export function replyToMoodConfirmation(topic: ConversationTopic | null): string | null {
  if (topic === 'sad' || topic === 'scared') return '教えてくれてありがとう。近くの大人といっしょにいようね。';
  if (topic === 'bedtime') return 'そっか。ゆっくり休もうね。';
  if (topic === 'happy') return 'うん！楽しい気持ち、コロンにも伝わったよ！';
  return null;
}

export function replyToMorningRoutine(input: string): string | null {
  if (/^(?:きょう|今日)?(?:おきた|起きた)(?:よ|！|!|。)?$/.test(input.trim())) {
    return '起きたんだね！ゆっくり今日を始めようね。';
  }
  return null;
}

export function isBedtimeEnding(input: string): boolean {
  return /^(?:おやすみ|ねるね|もうねる|もう寝る|そろそろねる|そろそろ寝る)[。！!？?\s　]*$/.test(input.trim());
}