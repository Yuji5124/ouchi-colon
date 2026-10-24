import type {
  ConversationContext,
  ConversationEngine,
  ConversationQuality,
  ConversationResult,
} from './conversation-engine.ts';

export interface StorySeed {
  id: string;
  character: string;
  place: string;
  event: string;
  opening: string;
}

/** Short authored starts. Later state values come only from these safe local lists. */
export const STORY_SEEDS: readonly StorySeed[] = [
  {
    id: 'mysterious-door', character: 'ちいさなロボット', place: '森のはずれ',
    event: 'ふしぎなドアを見つけた',
    opening: 'ある日、ちいさなロボットが、森のはずれでふしぎなドアを見つけたんだ。ドアから、ぷるるんって音がするよ。',
  },
  {
    id: 'flying-house', character: 'ちいさな家', place: '丘の上の空',
    event: '窓に羽が生えて、空を飛びはじめた',
    opening: '丘の上のちいさな家に、朝おきたら羽が生えていたの！ ふわりと空へ飛びはじめたよ。',
  },
  {
    id: 'lost-star', character: 'コロンとうさぎ', place: '夜のお花畑',
    event: 'なくした星を探している',
    opening: '夜のお花畑で、コロンとうさぎが、なくした星を探しているよ。草むらが、きらり！',
  },
];

interface StoryEntity {
  word: string;
  aliases: readonly string[];
}

const ENTITIES: readonly StoryEntity[] = [
  { word: 'おさかな', aliases: ['魚', 'さかな', 'お魚'] },
  { word: '恐竜', aliases: ['きょうりゅう', 'きょーりゅー'] },
  { word: 'ロボット', aliases: ['ろぼっと', 'ロボ'] },
  { word: 'うさぎ', aliases: ['ウサギ', 'うさちゃん'] },
  { word: 'ねこ', aliases: ['猫', 'ネコ', 'にゃんこ'] },
  { word: 'くま', aliases: ['熊', 'クマ'] },
  { word: 'ちょうちょ', aliases: ['蝶', 'ちょうちょう'] },
  { word: 'おばけ', aliases: ['オバケ', 'お化け'] },
  { word: 'ドラゴン', aliases: ['竜', 'りゅう'] },
  { word: '宇宙人', aliases: ['うちゅうじん'] },
  { word: 'お姫さま', aliases: ['おひめさま', 'プリンセス'] },
  { word: 'おさる', aliases: ['さる', '猿'] },
  { word: '小鳥', aliases: ['ことり', '鳥', 'とり'] },
  { word: '電車', aliases: ['でんしゃ', '汽車', '新幹線'] },
  { word: 'お城', aliases: ['城', 'しろ'] },
  { word: 'おうち', aliases: ['お家', '家', 'いえ'] },
  { word: '星', aliases: ['ほし', 'お星さま'] },
  { word: '月', aliases: ['つき', 'お月さま'] },
  { word: '雲', aliases: ['くも'] },
  { word: 'クッキー', aliases: ['くっきー'] },
  { word: 'りんご', aliases: ['リンゴ', '林檎'] },
  { word: 'ドーナツ', aliases: ['どーなつ'] },
  { word: 'おにぎり', aliases: ['おむすび'] },
  { word: 'しゃぼん玉', aliases: ['シャボン玉', 'しゃぼんだま'] },
  { word: 'かさ', aliases: ['傘'] },
  { word: '赤い石', aliases: ['石'] },
];

const PLACES = ['森', '空', '雲の上', '海', '月', 'お城', '宇宙', 'お花畑', '広場', '山', 'おうち'] as const;
const FOOD_WORDS = new Set(['クッキー', 'りんご', 'ドーナツ', 'おにぎり']);
const STORY_START = /^(?:おはなししよう|お話ししよう|おはなしつくろう|お話をつくろう|お話を作ろう|おはなし作ろう|ぼうけんしよう|冒険しよう)(?:よ)?[。！!？?\s　]*$/;
const STORY_END = /(?:おしまい|お話はおしまい|おはなしはおしまい|もういい|やめる|やめて|終わりにする)/;
const TOPIC_CHANGE = /^(?:ところで|それより|あとね|そういえば|きょうね|今日ね|今日|きょう|幼稚園|保育園|ママに|パパに|おなかが|お腹が)/;
const STORY_CATEGORIES = new Set(['animals-insects', 'play-toys', 'pretend-imagination', 'why-questions', 'unknown']);
const FEAR = /こわい|怖い|こわかった|怖かった/;

interface FoundEntity {
  word: string;
  start: number;
  end: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findEntities(input: string): FoundEntity[] {
  const aliases = ENTITIES.flatMap((entity) => [entity.word, ...entity.aliases]
    .map((alias) => ({ alias, word: entity.word })))
    .sort((a, b) => b.alias.length - a.alias.length);
  const found: FoundEntity[] = [];
  for (const { alias, word } of aliases) {
    const pattern = new RegExp(escapeRegex(alias), 'g');
    for (const match of input.matchAll(pattern)) {
      const start = match.index;
      const end = start + alias.length;
      if (found.some((item) => start < item.end && end > item.start)) continue;
      found.push({ word, start, end });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

function safePlace(input: string): string | null {
  return [...PLACES].sort((a, b) => b.length - a.length).find((place) => input.includes(place)) ?? null;
}

function addCharacter(existing: readonly string[], incoming: string): string[] {
  const characters = [...existing];
  if (!characters.includes(incoming) && characters.length < 3) characters.push(incoming);
  return characters;
}

function actorFor(state: NonNullable<ConversationContext['story']>): string {
  return state.character;
}

function explicitActor(input: string, state: NonNullable<ConversationContext['story']>, entities: readonly FoundEntity[]): string {
  return entities.find((entity) => /^(?:が|は)/.test(input.slice(entity.end)))?.word ?? actorFor(state);
}

function withStory(
  result: ConversationResult,
  text: string,
  story: ConversationContext['story'],
  ruleId: string,
): ConversationResult {
  const quality: ConversationQuality = result.quality
    ? { ...result.quality, category: 'pretend-imagination', replyType: 'IMAGINE', ruleId, fallback: false }
    : { intent: 'unknown', replyType: 'IMAGINE', questionRate: 0, duplicateReplyCount: 0, contextUsed: false, fallback: false, category: 'pretend-imagination', ruleId };
  return {
    ...result,
    text,
    topic: 'play',
    quality,
    context: { ...result.context, topic: 'play', category: 'pretend-imagination', story },
  };
}

function withoutStory(result: ConversationResult, customText?: string): ConversationResult {
  return {
    ...result,
    text: customText ?? result.text,
    context: { ...result.context, story: undefined },
  };
}

function isSafetyOrLearning(result: ConversationResult): boolean {
  return result.topic === 'safety' || result.quality?.category === 'safety' || result.quality?.category === 'word-learning';
}

function shouldStart(input: string, result: ConversationResult): boolean {
  const normalized = input.trim().replace(/^コロン[、，,\s　]*/, '');
  return STORY_START.test(normalized) && (result.quality?.intent === 'proposal' || result.quality?.intent === 'request');
}

function startStory(result: ConversationResult, seed: StorySeed): ConversationResult {
  const started = withStory(result, seed.opening, {
    seedId: seed.id,
    character: seed.character,
    characters: [seed.character],
    place: seed.place,
    event: seed.event,
    childAction: null,
    turns: 0,
  }, `story.start.${seed.id}`);
  return { ...started, context: { ...started.context, playInvitation: undefined } };
}

function storyAction(input: string, state: NonNullable<ConversationContext['story']>): { text: string; state: NonNullable<ConversationContext['story']>; rule: string } | null {
  const entities = findEntities(input);
  const actor = explicitActor(input, state, entities);
  const first = entities[0]?.word ?? null;
  const second = entities.find((entity) => entity.word !== first)?.word ?? null;
  const transform = /(?:なる|なっちゃう|なった|変身|変わる|変わっちゃう)/.test(input);

  if (/うれし|嬉し|たのし|楽しい/.test(input)) {
    return {
      text: `コロンもうれしい！ ${state.character}も、にこにこしてるよ。`,
      state: { ...state, event: `${state.character}とコロンがわくわくしている`, childAction: '楽しい気持ちを伝えた', turns: state.turns + 1 },
      rule: 'happy',
    };
  }

  if (transform && first && second) {
    const updated = `${second}になった${first}`;
    return {
      text: `ええっ！ ${first}に${second}のしっぽが生えて、${second}になっちゃった！`,
      state: { ...state, character: updated, characters: addCharacter(state.characters, updated), event: `${first}が${second}に変身した`, childAction: '変身させた', turns: state.turns + 1 },
      rule: 'transform',
    };
  }

  if (/開け|あけ/.test(input)) {
    const reveal = state.seedId === 'mysterious-door'
      ? 'ぎぎぎ……ドアの向こうには、空を泳ぐおさかながいたよ！'
      : 'ぱかっ！ ふたの向こうから、ぷるぷる光る星が出てきた！';
    return {
      text: `わあ、${actor}が開けたよ！ ${reveal}`,
      state: { ...state, characters: addCharacter(state.characters, state.seedId === 'mysterious-door' ? 'おさかな' : '星'), event: 'ふしぎなものを見つけた', childAction: '開けた', turns: state.turns + 1 },
      rule: 'open',
    };
  }

  if (/乗る|のる|乗せる|のせる/.test(input)) {
    const ride = first && first !== '赤い石' ? first : 'おさかな';
    return {
      text: `やった！ ${actor}は${ride}に乗ったよ。${ride}が、雲の上まで泳いでいく！`,
      state: { ...state, characters: addCharacter(state.characters, ride), place: '雲の上', event: `${actor}が${ride}に乗って空を進んでいる`, childAction: '乗った', turns: state.turns + 1 },
      rule: 'ride',
    };
  }

  if (transform && first && !second) {
    return {
      text: `へんしんするんだね！ ${first}がどんなふうに変わるのかな？ コロン、わくわくしてきた！`,
      state: { ...state, event: `${first}が変身しそう`, childAction: '変身させようとした', turns: state.turns + 1 },
      rule: 'transform-open',
    };
  }

  if (/食べ|たべ/.test(input)) {
    const food = entities.find((entity) => FOOD_WORDS.has(entity.word))?.word;
    if (!food) return null;
    return {
      text: `むしゃむしゃ！ ${actor}が${food}を食べたら、おなかがぴかっと光った！`,
      state: { ...state, event: `${actor}が${food}を食べて、おなかが光った`, childAction: '食べた', turns: state.turns + 1 },
      rule: 'eat',
    };
  }

  if (/話しかけ|はなしかけ|話す|はなす|呼びかけ|よびかけ/.test(input)) {
    const listener = entities.find((entity) => new RegExp(`${escapeRegex(entity.word)}(?:に|へ)`).test(input))?.word
      ?? second ?? (first && first !== actor ? first : 'おさかな');
    return {
      text: `こんにちはって話しかけたら、${listener}が「ぷくぷく！」って返事した！`,
      state: { ...state, characters: addCharacter(state.characters, listener), event: `${actor}が${listener}に話しかけた`, childAction: '話しかけた', turns: state.turns + 1 },
      rule: 'talk',
    };
  }

  if (/助け|たすけ|手伝|てつだ/.test(input)) {
    const helped = first ?? state.characters[0] ?? 'おともだち';
    return {
      text: `いっしょに助けるんだね！ ${helped}は、にこにこ元気になったよ。`,
      state: { ...state, characters: addCharacter(state.characters, helped), event: `${helped}を助けた`, childAction: '助けた', turns: state.turns + 1 },
      rule: 'help',
    };
  }

  if (/見つけ|みつけ|見つか|みつか|あった|いたよ|出てき|あらわれ|現れ/.test(input)) {
    if (!first) {
      return {
        text: 'あっ、何か見つけた！ コロンも見たいな。どんなものだった？',
        state: { ...state, event: '何かを見つけた', childAction: '見つけた', turns: state.turns + 1 },
        rule: 'find-unknown',
      };
    }
    const place = PLACES.includes(first as typeof PLACES[number]) ? first : state.place;
    return {
      text: `あっ、${first}がいた！ ${actor}もびっくりして、ぴょん！`,
      state: { ...state, characters: addCharacter(state.characters, first), place, event: `${first}を見つけた`, childAction: '見つけた', turns: state.turns + 1 },
      rule: 'find',
    };
  }

  const destination = safePlace(input);
  const direction = /(?:右|みぎ)(?:へ|に)/.test(input) ? '右' : /(?:左|ひだり)(?:へ|に)/.test(input) ? '左'
    : /(?:上|うえ)(?:へ|に)/.test(input) ? '上' : /(?:下|した)(?:へ|に)/.test(input) ? '下' : null;
  if (/行く|いく|向かう|むかう|進む|すすむ|歩く|あるく|飛ぶ|とぶ/.test(input) || direction) {
    const nextPlace = destination ?? state.place;
    const toward = direction ? `${direction}へ` : `${nextPlace}へ`;
    return {
      text: `よし、${actor}は${toward}進んだよ。道に、ぷるぷる光るものが落ちてる！`,
      state: { ...state, place: destination ?? state.place, event: `${actor}が${toward}進んだ`, childAction: '進んだ', turns: state.turns + 1 },
      rule: 'move',
    };
  }

  if (first && /も|出てくる|あらわれ|現れ/.test(input)) {
    return {
      text: `わあ、${first}も出てきた！ みんなで一緒に行こう！`,
      state: { ...state, characters: addCharacter(state.characters, first), event: `${first}も仲間になった`, childAction: '仲間を出した', turns: state.turns + 1 },
      rule: 'new-character',
    };
  }

  return null;
}

/** Co-creates short, locally authored story turns without retaining child transcripts. */
export class StoryPlayConversationEngine implements ConversationEngine {
  private readonly conversation: ConversationEngine;

  constructor(conversation: ConversationEngine) {
    this.conversation = conversation;
  }

  reply(input: string, context: ConversationContext): ConversationResult {
    const result = this.conversation.reply(input, context);
    if (isSafetyOrLearning(result)) return withoutStory(result);

    if (context.story) {
      if (STORY_END.test(input.trim())) {
        return withoutStory(result, 'うん、おはなしはここまで！いっしょに作れて楽しかったよ。またお話したくなったら呼んでね。');
      }
      if (FEAR.test(input)) {
        return withoutStory(result, 'こわくなっちゃったね。おはなしは明るいところでおしまいにしよう。コロンはここにいるよ。');
      }

      const action = storyAction(input, context.story);
      if (action) return withStory(result, action.text, action.state, `story.${action.rule}`);

      if (TOPIC_CHANGE.test(input.trim()) || result.quality?.ruleId && !STORY_CATEGORIES.has(result.quality.category ?? 'unknown')) {
        return withoutStory(result);
      }

      const clarification = context.story.turns % 2 === 0
        ? 'おもしろい考えだね。コロン、まだお話のところがわからないから、もう少し聞かせて？'
        : 'へえー！ その先も聞きたいな。どんなことが起きるの？';
      return withStory(result, clarification, { ...context.story, turns: context.story.turns + 1 }, 'story.clarify');
    }

    if (!shouldStart(input, result)) return result;
    const seed = STORY_SEEDS[context.turn % STORY_SEEDS.length]!;
    return startStory(result, seed);
  }
}
