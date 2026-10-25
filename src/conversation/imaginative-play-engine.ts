import type { ConversationContext, ConversationEngine, ConversationResult } from './conversation-engine.ts';

interface Concept { word: string; aliases: readonly string[] }

const SUBJECTS: readonly Concept[] = [
  { word: 'バス', aliases: ['ばす'] },
  { word: '電車', aliases: ['でんしゃ', '汽車', '新幹線'] },
  { word: '車', aliases: ['くるま', '自動車'] },
  { word: '飛行機', aliases: ['ひこうき'] },
  { word: '船', aliases: ['ふね', 'ボート'] },
  { word: 'ロケット', aliases: ['ろけっと'] },
  { word: 'おうち', aliases: ['お家', '家', 'いえ'] },
  { word: 'お店', aliases: ['おみせ'] },
  { word: '動物園', aliases: ['どうぶつえん'] },
  { word: 'お城', aliases: ['おしろ', '城'] },
];
const SETTINGS: readonly Concept[] = [
  { word: '宇宙', aliases: ['うちゅう', 'そら'] },
  { word: '海', aliases: ['うみ'] },
  { word: '森', aliases: ['もり'] },
  { word: '月', aliases: ['つき', 'お月さま'] },
  { word: '山', aliases: ['やま'] },
  { word: '町', aliases: ['まち'] },
];
const GUESTS: readonly Concept[] = [
  { word: '恐竜', aliases: ['きょうりゅう', 'きょーりゅー'] },
  { word: '魚', aliases: ['さかな', 'お魚'] },
  { word: 'うさぎ', aliases: ['ウサギ', 'うさちゃん'] },
  { word: 'ねこ', aliases: ['猫', 'ネコ', 'にゃんこ'] },
  { word: 'くま', aliases: ['熊', 'クマ'] },
];
const FEATURES: readonly Concept[] = [
  { word: '屋根', aliases: ['やね'] },
  { word: '窓', aliases: ['まど'] },
  { word: 'タイヤ', aliases: ['車輪', 'しゃりん'] },
  { word: '羽', aliases: ['はね'] },
  { word: 'ドア', aliases: ['扉', 'とびら'] },
];
const END = /^(?:おしまい|おわり|終わり|もういい|やめる|やめて|遊びはおしまい|ばいばい|バイバイ|またあとで)[。！!？?\s　]*$/;
const OFF_TOPIC = /^(?:ところで|それより|あとね|そういえば|今日|きょう|幼稚園|保育園|ママに|パパに|おなかが|お腹が|かなしい|悲しい|こわい|怖い)/;
const PUNCTUATION = /^[「」『』\s　]*(.*?)[。！!？?〜～\s　]*$/;

function findConcept(text: string, concepts: readonly Concept[]): Concept | null {
  return concepts.find(({ word, aliases }) => [word, ...aliases].some((alias) => text.includes(alias))) ?? null;
}

function exactSubject(input: string): Concept | null {
  const normalized = input.replace(/^コロン[、，,\s　]*/, '').replace(PUNCTUATION, '$1').trim();
  return SUBJECTS.find(({ word, aliases }) => [word, ...aliases].some((alias) => normalized === alias)) ?? null;
}

function changedSubject(input: string, current: string): Concept | null {
  const mentions = SUBJECTS.flatMap((concept) => [concept.word, ...concept.aliases]
    .map((alias) => ({ concept, alias, index: input.indexOf(alias) })))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index || b.alias.length - a.alias.length);
  const nonOverlapping: typeof mentions = [];
  for (const mention of mentions) {
    if (nonOverlapping.some((existing) => mention.index < existing.index + existing.alias.length
      && mention.index + mention.alias.length > existing.index)) continue;
    nonOverlapping.push(mention);
  }
  const distinct = [...new Map(nonOverlapping.map(({ concept }) => [concept.word, concept])).values()];
  const explicitChange = /(?:じゃなくて|ではなく|やっぱり|ちがう|違う|より|にしよう|にする|がいい)/.test(input);
  const candidate = explicitChange ? distinct.at(-1) : distinct.length === 1 ? distinct[0] : undefined;
  return candidate && candidate.word !== current ? candidate : null;
}

function resultWithPlay(result: ConversationResult, text: string, context: ConversationContext, ruleId: string): ConversationResult {
  const quality = result.quality
    ? { ...result.quality, category: 'pretend-imagination', replyType: 'IMAGINE' as const, ruleId, fallback: false }
    : { intent: 'unknown' as const, replyType: 'IMAGINE' as const, questionRate: 0, duplicateReplyCount: 0, contextUsed: false, fallback: false, category: 'pretend-imagination', ruleId };
  return { ...result, text, topic: 'play', quality, context: { ...context, topic: 'play', category: 'pretend-imagination' } };
}

function cleared(context: ConversationContext): ConversationContext {
  return { ...context, imaginativePlay: undefined };
}

/** A small child-led imagination loop that keeps only recognized concepts in short-lived context. */
export class ImaginativePlayConversationEngine implements ConversationEngine {
  private readonly conversation: ConversationEngine;

  constructor(conversation: ConversationEngine) {
    this.conversation = conversation;
  }

  reply(input: string, context: ConversationContext): ConversationResult {
    const result = this.conversation.reply(input, context);
    if (result.topic === 'safety' || result.quality?.category === 'safety' || result.quality?.category === 'word-learning') {
      return { ...result, context: cleared(result.context) };
    }

    if (result.context.story && !context.imaginativePlay) return result;
    if (result.context.story && context.imaginativePlay) return { ...result, context: cleared(result.context) };

    const trimmed = input.trim();
    const state = context.imaginativePlay;
    if (state && END.test(trimmed)) {
      return resultWithPlay(result, 'うん、ここでおしまい！いっしょに考えて楽しかったよ。また遊びたくなったら教えてね。', cleared(result.context), 'imaginative-play.end');
    }

    const subject = exactSubject(trimmed);
    const directionChange = state ? subject && subject.word !== state.subject ? subject : changedSubject(trimmed, state.subject) : null;
    if (state && directionChange) {
      const next: ConversationContext = { ...cleared(result.context), playInvitation: undefined, imaginativePlay: { subject: directionChange.word, setting: null, guest: null, feature: null, turns: 0 } };
      return resultWithPlay(result, `${directionChange.word}だね！どこへ行く${directionChange.word}にしよう？`, next, 'imaginative-play.restart');
    }

    if (!state) {
      if (!subject) return result;
      const next: ConversationContext = { ...result.context, playInvitation: undefined, imaginativePlay: { subject: subject.word, setting: null, guest: null, feature: null, turns: 0 } };
      return resultWithPlay(result, `${subject.word}だ！どこに行く${subject.word}にする？`, next, 'imaginative-play.start');
    }

    if (OFF_TOPIC.test(trimmed) || result.quality?.ruleId && result.quality.category !== 'pretend-imagination' && result.quality.category !== 'play-toys' && result.quality.category !== 'animals-insects' && result.quality.category !== 'unknown') {
      return { ...result, context: cleared(result.context) };
    }

    const setting = findConcept(trimmed, SETTINGS);
    if (setting && setting.word !== state.setting) {
      const nextState = { ...state, setting: setting.word, turns: state.turns + 1 };
      const text = setting.word === '宇宙'
        ? `宇宙${state.subject}だ！お月さまに停まろう！`
        : `${setting.word}へ行く${state.subject}だね！どんなものに会えるかな？`;
      return resultWithPlay(result, text, { ...result.context, imaginativePlay: nextState }, 'imaginative-play.setting');
    }

    const guest = findConcept(trimmed, GUESTS);
    if (guest && guest.word !== state.guest) {
      const nextState = { ...state, guest: guest.word, turns: state.turns + 1 };
      const text = state.subject === 'バス' && guest.word === '恐竜'
        ? 'えーっ！恐竜の頭が屋根から出ちゃう！'
        : `${guest.word}も乗るんだね！みんなでどこへ行こう？`;
      return resultWithPlay(result, text, { ...result.context, imaginativePlay: nextState }, 'imaginative-play.add-guest');
    }

    const feature = findConcept(trimmed, FEATURES);
    if (feature) {
      const nextState = { ...state, feature: feature.word, turns: state.turns + 1 };
      const text = state.guest === '恐竜' && feature.word === '屋根'
        ? `すごい！${state.guest}専用の${state.subject}だ！`
        : `${feature.word}を工夫するんだね！${state.subject}がもっとすてきになったよ！`;
      return resultWithPlay(result, text, { ...result.context, imaginativePlay: nextState }, 'imaginative-play.modify');
    }

    if (/^(?:うん|うんうん|そう|そうだよ|はい|えっ|えー|わあ|わー)[。！!？?\s　]*$/.test(trimmed)) {
      return resultWithPlay(result, 'うんうん！', { ...result.context, imaginativePlay: state }, 'imaginative-play.listen');
    }

    if (result.quality?.ruleId && !['pretend-imagination', 'play-toys', 'animals-insects', 'unknown'].includes(result.quality.category ?? 'unknown')) {
      return { ...result, context: cleared(result.context) };
    }

    return resultWithPlay(result, 'そうなんだ！それで、次はどうする？', { ...result.context, imaginativePlay: { ...state, turns: state.turns + 1 } }, 'imaginative-play.follow-up');
  }
}
