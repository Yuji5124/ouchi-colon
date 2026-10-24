import type {
  ConversationContext,
  ConversationEngine,
  ConversationQuality,
  ConversationResult,
} from './conversation-engine.ts';

export interface LearningWord {
  id: string;
  word: string;
  aliases: readonly string[];
  meaning: string;
  example: string;
  /** Words that can be gently explained while responding to a related story. */
  naturalDiscovery?: boolean;
}

/** Small, authored vocabulary for familiar things, actions, feelings, and sound words. */
export const LEARNING_WORDS: readonly LearningWord[] = [
  { id: 'puddle', word: '水たまり', aliases: ['みずたまり'], meaning: '雨のあとに、地面にできる水だよ', example: '長ぐつで入ると、ぴちゃっとするね' },
  { id: 'shadow', word: 'かげ', aliases: ['影'], meaning: '光がさえぎられてできる、暗い形だよ', example: 'おひさまの下で、足もとにできるね' },
  { id: 'reflection', word: '水面', aliases: ['みなも'], meaning: '池や水たまりの、水のひろがったところだよ', example: 'お空がうつることもあるね' },
  { id: 'nest', word: '巣', aliases: [], meaning: '鳥や虫が、子どもとくらすおうちだよ', example: '木の上に鳥の巣があることもあるね' },
  { id: 'bud', word: 'つぼみ', aliases: ['蕾'], meaning: 'お花がひらく前の、小さなかたまりだよ', example: 'ひらくと、きれいなお花になるね' },
  { id: 'shell', word: '貝がら', aliases: ['貝殻', 'かいがら'], meaning: '貝のおうちの、かたいからだよ', example: '海のそばの砂に落ちていることがあるね' },
  { id: 'antenna', word: '触角', aliases: ['しょっかく'], meaning: '虫の頭にある、細い二本のつのみたいなものだよ', example: '虫はそれで、まわりをさぐるんだ' },
  { id: 'paw', word: '肉球', aliases: ['にくきゅう'], meaning: 'ねこや犬の足のうらにある、ぷにぷにしたところだよ', example: '歩くとき、足を守ってくれるよ' },
  { id: 'float', word: '浮く', aliases: ['うく'], meaning: '水の上に、ぷかっといることだよ', example: '葉っぱが水に浮くことがあるね' },
  { id: 'sink', word: '沈む', aliases: ['しずむ'], meaning: '水の中へ、下におりていくことだよ', example: '石は水に沈むね' },
  { id: 'stretch', word: '伸びる', aliases: ['のびる'], meaning: '長さや大きさが、前より大きくなることだよ', example: '植物の芽がぐんぐん伸びるね' },
  { id: 'sway', word: '揺れる', aliases: ['ゆれる'], meaning: 'あっち、こっちにゆらゆら動くことだよ', example: '風で木の枝が揺れるね' },
  { id: 'crawl', word: 'はう', aliases: ['這う'], meaning: 'おなかを地面につけて進むことだよ', example: '赤ちゃんやいもむしが、はって進むね' },
  { id: 'hop', word: '跳ねる', aliases: ['はねる', 'とびはねる'], meaning: '足で地面をけって、ぴょんと上がることだよ', example: 'うさぎがぴょんと跳ねるね', naturalDiscovery: true },
  { id: 'tiptoe', word: 'つま先立ち', aliases: ['つまさきだち'], meaning: 'かかとを上げて、つま先で立つことだよ', example: '高いところに手をのばすときにするね' },
  { id: 'yawn', word: 'あくび', aliases: ['欠伸'], meaning: 'ねむいときに、お口が大きく開くことだよ', example: 'ふわぁって、お口が開くね' },
  { id: 'flutter', word: 'ひらひら', aliases: [], meaning: '軽いものが、ゆっくりゆれるように動くようすだよ', example: 'ちょうちょがひらひら飛ぶね', naturalDiscovery: true },
  { id: 'bounce', word: 'ぴょんぴょん', aliases: [], meaning: '何度も軽く跳ねるようすだよ', example: 'うさぎがぴょんぴょん進むね', naturalDiscovery: true },
  { id: 'splash', word: 'ぴちゃぴちゃ', aliases: ['ぴちゃ'], meaning: '水がはねるときの音やようすだよ', example: '水たまりを歩くと、ぴちゃぴちゃするね', naturalDiscovery: true },
  { id: 'crunch', word: 'ぽりぽり', aliases: [], meaning: 'かたいものをかむときの音だよ', example: 'きゅうりをかむと、ぽりぽりするね', naturalDiscovery: true },
  { id: 'munch', word: 'もぐもぐ', aliases: [], meaning: '口を動かして、食べているようすだよ', example: 'ごはんをもぐもぐ食べるね', naturalDiscovery: true },
  { id: 'fluffy', word: 'ふわふわ', aliases: [], meaning: 'やわらかくて、軽そうなようすだよ', example: 'わたあめはふわふわだね', naturalDiscovery: true },
  { id: 'sparkly', word: 'きらきら', aliases: ['キラキラ'], meaning: '光が小さくたくさん光るようすだよ', example: '星がきらきらしているね', naturalDiscovery: true },
  { id: 'fluttery', word: 'どきどき', aliases: ['ドキドキ'], meaning: '心が速く動いて、わくわくしたり緊張したりする感じだよ', example: '発表の前にどきどきすることがあるね', naturalDiscovery: true },
  { id: 'restless', word: 'そわそわ', aliases: [], meaning: '気になって、じっとしていられない感じだよ', example: '遠足の前の日にそわそわすることがあるね', naturalDiscovery: true },
  { id: 'relieved', word: 'ほっとする', aliases: ['ほっと'], meaning: '心配がなくなって、安心することだよ', example: 'なくしたおもちゃが見つかると、ほっとするね' },
  { id: 'disappointed', word: 'がっかり', aliases: [], meaning: '楽しみにしていたことができなくて、しょんぼりする感じだよ', example: '雨で外に行けないと、がっかりすることがあるね' },
  { id: 'proud', word: '誇らしい', aliases: ['ほこらしい'], meaning: 'できたことを、うれしく思う気持ちだよ', example: '自分でくつをはけると、誇らしいね' },
  { id: 'curious', word: 'ふしぎ', aliases: ['不思議'], meaning: 'どうしてかなって、知りたくなる感じだよ', example: '雲の形が変わるのは、ふしぎだね' },
  { id: 'snuggle', word: 'ぎゅっと', aliases: ['ぎゅっ'], meaning: '力を入れて、しっかりするようすだよ', example: 'ぬいぐるみをぎゅっと抱っこするね', naturalDiscovery: true },
];

const EXPLICIT_QUESTION = /(?:って|とは|の意味は|っていうのは|っていうの)\s*(?:なに|何|どういうこと|どういう意味)|(?:なに|何)\s*(?:のこと|なの|ってこと)/;
const TOPIC_SWITCH = /^(?:ところで|それより|あとね|ねえ|じゃあ|ばいばい|おやすみ|もういい|やめて)/;
const SAFE_WORD = (word: string): RegExp => new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const EXPLICIT_TERM = /([^、。！？?]{1,12}?)(?:って|とは|の意味は|っていうのは|っていうの)\s*(?:なに|何|どういうこと|どういう意味)/;

function findWord(text: string): LearningWord | null {
  return [...LEARNING_WORDS]
    .sort((a, b) => Math.max(b.word.length, ...b.aliases.map((alias) => alias.length)) - Math.max(a.word.length, ...a.aliases.map((alias) => alias.length)))
    .find((entry) => [entry.word, ...entry.aliases].some((candidate) => SAFE_WORD(candidate).test(text))) ?? null;
}

function isSafeToAugment(result: ConversationResult): boolean {
  return result.topic !== 'safety' && result.quality?.category !== 'safety';
}

function withLearningQuality(result: ConversationResult, word: LearningWord): ConversationResult {
  const quality: ConversationQuality = result.quality
    ? { ...result.quality, category: 'word-learning', ruleId: `word-learning.${word.id}` }
    : { intent: 'unknown', replyType: 'SHARE', questionRate: 0, duplicateReplyCount: 0, contextUsed: false, fallback: false, category: 'word-learning', ruleId: `word-learning.${word.id}` };
  return { ...result, quality };
}

/** Adds brief, locally authored word discoveries around the existing conversation engine. */
export class LanguageLearningConversationEngine implements ConversationEngine {
  private readonly introducedWordIds = new Set<string>();
  private readonly conversation: ConversationEngine;

  constructor(conversation: ConversationEngine) {
    this.conversation = conversation;
  }

  reply(input: string, context: ConversationContext): ConversationResult {
    const result = this.conversation.reply(input, context);
    if (!isSafeToAugment(result)) return result;

    const word = findWord(input);
    if (!word) {
      if (!EXPLICIT_QUESTION.test(input)) return result;
      const unknownTerm = EXPLICIT_TERM.exec(input)?.[1]?.replace(/[「」『』\s　]/g, '').trim();
      if (!unknownTerm) return result;
      return {
        ...result,
        text: `「${unknownTerm}」っていうの、コロンはまだよく知らないみたい。どこで聞いたの？`,
        quality: result.quality ? { ...result.quality, category: 'word-learning', ruleId: 'word-learning.unknown' } : undefined,
      };
    }

    if (EXPLICIT_QUESTION.test(input)) {
      const firstIntroduction = !this.introducedWordIds.has(word.id);
      this.introducedWordIds.add(word.id);
      const askSomething = firstIntroduction && this.introducedWordIds.size % 3 === 0;
      const text = `「${word.word}」はね、${word.meaning}。${askSomething ? `${word.example}。知ってた？` : word.example + '。'}`;
      return withLearningQuality({ ...result, text }, word);
    }

    // A few expressive words invite a small discovery inside the ongoing story.
    // Common nouns and ordinary verbs are only explained when the child asks.
    if (!word.naturalDiscovery || this.introducedWordIds.has(word.id) || TOPIC_SWITCH.test(input.trim())) return result;
    if (!/[！!。]|だよ|した|だった|いる|ある|みたい|みた/.test(input)) return result;

    this.introducedWordIds.add(word.id);
    return withLearningQuality({
      ...result,
      text: `${result.text}「${word.word}」は、${word.meaning}。`,
    }, word);
  }
}
