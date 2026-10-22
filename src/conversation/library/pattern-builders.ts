import type { ConversationTopic, ReplyType } from '../conversation-engine.ts';
import type { ConversationCategory, ConversationLibraryEntry, EntityLexicon, LibraryIntent } from './types.ts';

export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const entityPattern = (aliases: readonly string[]): string => `(?:${aliases.map(escapeRegex).sort((a, b) => b.length - a.length).join('|')})`;

const SHARED_CANDIDATES: Readonly<Record<ReplyType, readonly string[]>> = {
  REACT: ['えー！{subject}なんだ！', 'わあ！{subject}、すてき！'],
  ACKNOWLEDGE: ['{subject}なんだね！', 'そっか、{subject}だったんだ！'],
  SHARE: ['コロンは、{subject}のお話を聞けてうれしいな！', 'コロンも{subject}のお話、もっと知りたいな！'],
  IMAGINE: ['{subject}が空まで行ったら、おもしろそう！', '{subject}で遊んだら、どんな音がするかな？'],
  QUESTION: ['それで、いちばん好きだったのはどれ？', 'どんなところが楽しかった？'],
  PLAY: ['{subject}ごっこ、いっしょにしよう！', 'コロンもまぜて！{subject}で遊ぼう！'],
};

export const PHRASES: Readonly<Record<LibraryIntent, string>> = {
  greeting: '(?:こんにちは|おはよう|こんばんは|やっほー?|おかえり|ただいま|はじめまして)',
  farewell: '(?:ばいばい|バイバイ|またね|さようなら|おやすみ)',
  report: '(?:(?:を|は|が|も|で|と)?(?:食べた|飲んだ|見た|みつけた|見つけた|いた|いる|遊んだ|作った|つくった|行った|した|だった|ある|あった|できた|かった|楽しかった|こわかった|うれしかった))?',
  preference: '(?:は|が|も)?(?:だいすき|大好き|すき|好き)',
  'preference-negative': '(?:は|が|も)?(?:だいきらい|大嫌い|きらい|嫌い|いや|やだ)',
  wish: '(?:(?:を|が|も)?(?:食べたい|たべたい|飲みたい|のみたい|遊びたい|あそびたい|見たい|みたい|行きたい|いきたい|やりたい|ほしい|欲しい))',
  question: '(?:(?:を|は|が)?(?:食べた|食べる|好き|すき|ある|いる|見た|行く|どう|なに|何|どこ|だれ|誰)[のかな]*)[?？]?',
  proposal: '(?:(?:を|と|で)?(?:作ろう|つくろう|食べよう|遊ぼう|あそぼう|しよう|やろう|しない|しよ))',
  request: '(?:して|してよ|してね|してほしい|歌って|お話して|遊んで)',
  correction: '(?:ちがう|違う|じゃなくて|やっぱり)',
  refusal: '(?:いや|ううん|やだ|いやだ|したくない|やめて)',
  'short-answer': '(?:うん|そう|はい|いいよ|いいね)',
  emotion: '(?:うれし|嬉し|かなしい|悲し|こわ|怖|たのし|楽しい|いやだった)',
  repeat: '(?:もう一回|もういっかい|もう一度|わかんない|わからない)',
  unknown: '(?:.*)',
};

export function entityRules(entities: readonly EntityLexicon[]): ConversationLibraryEntry[] {
  const intents: LibraryIntent[] = ['report', 'preference', 'wish', 'question', 'proposal'];
  return entities.flatMap((entity) => intents.map((intent) => {
    const subject = entityPattern(entity.aliases);
    const expression = intent === 'report'
      ? `^.*${subject}.*${PHRASES[intent]}.*$`
      : intent === 'preference'
        ? `^.*${subject}(?:${PHRASES.preference}|${PHRASES['preference-negative']}).*$`
        : `^.*${subject}${PHRASES[intent]}.*$`;
    return {
      id: `${entity.category}.${entity.canonical}.${intent}`,
      category: entity.category,
      intent,
      utterancePatterns: [new RegExp(expression)],
      responseCandidates: SHARED_CANDIDATES,
      contextRequirements: [],
      priority: intent === 'question' ? 70 : 50,
    };
  }));
}

export function phraseRule(
  id: string,
  category: ConversationCategory,
  intent: LibraryIntent,
  phrases: readonly string[],
  responseCandidates: Partial<Record<ReplyType, readonly string[]>>,
  priority = 80,
  contextRequirements: ConversationLibraryEntry['contextRequirements'] = [],
): ConversationLibraryEntry {
  return {
    id, category, intent, utterancePatterns: phrases.map((phrase) => new RegExp(phrase, 'i')),
    responseCandidates, contextRequirements, priority,
  };
}

export function entity(
  canonical: string, aliases: readonly string[], topic: ConversationTopic, category: ConversationCategory,
): EntityLexicon {
  return { canonical, aliases: [...new Set([canonical, ...aliases])], topic, category };
}
