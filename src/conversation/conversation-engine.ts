export type ConversationTopic =
  | 'greeting' | 'daily' | 'play' | 'animals' | 'food' | 'weather'
  | 'happy' | 'sad' | 'scared' | 'surprised' | 'repeat' | 'bedtime' | 'things';

export interface ConversationContext {
  /** Short session-only memory; it is never persisted or sent to a server. */
  topic: ConversationTopic | null;
  category?: string;
  turn: number;
  subject?: string | null;
  action?: string | null;
  feature?: string | null;
  intent?: ConversationIntent;
  recentReplyTypes?: ReplyType[];
  recentReplyIds?: string[];
  lastReplyWasQuestion?: boolean;
  assistantQuestionFocus?: 'activity' | 'object' | 'color' | 'general' | null;
  /** Short play state for the current conversation; in memory only and reset with context. */
  playInvitation?: { phase: 'invited' | 'playing'; gameId: string; turns: number; round: number };
  /** Short turn-based pause after a child declines a game. */
  playInvitesSuppressedUntil?: number;
  /** Story state uses only authored or allow-listed values; child transcripts are never kept. */
  story?: { seedId: string; character: string; characters: string[]; place: string; event: string; childAction: string | null; turns: number };
}

export type ConversationIntent = 'greeting' | 'farewell' | 'report' | 'question' | 'request' | 'correction' | 'refusal' | 'short-answer' | 'emotion' | 'repeat' | 'preference' | 'preference-negative' | 'wish' | 'proposal' | 'unknown';
export type ReplyType = 'REACT' | 'ACKNOWLEDGE' | 'SHARE' | 'IMAGINE' | 'QUESTION' | 'PLAY';

export interface ConversationQuality {
  intent: ConversationIntent;
  replyType: ReplyType;
  questionRate: number;
  duplicateReplyCount: number;
  contextUsed: boolean;
  fallback: boolean;
  category?: string;
  ruleId?: string;
  fallbackReason?: string | null;
  /** Optional authored face hint; never inferred from generated speech in the renderer. */
  emotion?: 'NORMAL' | 'JOY' | 'SURPRISE' | 'THINKING' | 'SAD' | 'SLEEPY';
}

export interface ConversationResult {
  text: string;
  topic: ConversationTopic | 'safety';
  context: ConversationContext;
  quality?: ConversationQuality;
}

export interface ConversationEngine {
  reply(input: string, context: ConversationContext): ConversationResult;
}

export function replyWithFallback(engine: ConversationEngine, input: string, context: ConversationContext): { result: ConversationResult; failed: boolean } {
  try {
    return { result: engine.reply(input, context), failed: false };
  } catch {
    return {
      result: {
        text: 'ごめんね、コロンちょっと考え中！もう一度お話ししよう！',
        topic: context.topic ?? 'daily',
        context: { ...context, turn: context.turn + 1 },
        quality: { intent: 'unknown', replyType: 'ACKNOWLEDGE', questionRate: 0, duplicateReplyCount: 0, contextUsed: Boolean(context.subject), fallback: true },
      },
      failed: true,
    };
  }
}

interface ConversationRule {
  topic: ConversationTopic;
  match: RegExp;
  replies: readonly string[];
  followUps: readonly string[];
}

const RULES: readonly ConversationRule[] = [
  {
    topic: 'greeting', match: /こんにちは|おはよう|こんばんは|やっほ|ただいま|はじめまして/,
    replies: [
      'こんにちは！会えてうれしいな。今日はどんな気分？',
      'おはよう！きょうは何をして遊びたい？',
      'やっほー！いっしょにお話ししよう。何のお話にする？',
      'ただいまって言ってくれてうれしいな。今日はどうだった？',
      'こんばんは！今日いちばん楽しかったことはなあに？',
      '会えてうれしいな。今は何をしているところ？',
      'こんにちは！好きな遊びのお話を聞かせてくれる？',
      'やっほー！今日はどんなことがあったの？',
    ],
    followUps: ['もっとお話ししよう。次はどんなことを聞かせてくれる？', 'うんうん、聞いてるよ。ほかにもお話ししたいことある？'],
  },
  {
    topic: 'daily', match: /今日|きょう|幼稚園|保育園|学校|おでかけ|できた|あったこと/,
    replies: [
      '今日はどんなことがあったの？', 'きょうのこと、もう少し聞かせてくれる？',
      'それはどんな気持ちだった？', '今日いちばん心にのこったのは何かな？',
      'そのあと、どうなったの？', 'だれかといっしょにしたのかな？',
      'もう少し教えてくれる？どこが楽しかった？', 'それをしているとき、どんな気分だった？',
      'きょうのことを教えてくれてありがとう。次は何をしたい？',
    ],
    followUps: ['そのお話の続きも聞きたいな。次は何があったの？', 'そうなんだね。いちばん好きだったところはどこ？'],
  },
  {
    topic: 'play', match: /遊び|あそび|おもちゃ|ブロック|積み木|かくれんぼ|おにごっこ|絵を|お絵描き|つくった/,
    replies: [
      'どんな遊びが好き？', 'それで何を作ってみたい？', 'いっしょに遊ぶなら何をする？',
      'その遊びのどこが好きなの？', '次はどんな遊びをしてみたい？', 'どんな色を使ったの？',
      'それを作るのに何を使ったの？', '遊んでいるとき、どんな気分になる？', 'できあがったら何に使うの？',
    ],
    followUps: ['その遊び、もう少し教えて。どんなところが楽しい？', 'いいね。次は何を作ったり遊んだりする？'],
  },
  {
    topic: 'animals', match: /動物|どうぶつ|犬|いぬ|わんわん|猫|ねこ|にゃん|うさぎ|くま|ぞう|きりん|鳥|とり|魚|さかな|恐竜|きょうりゅう/,
    replies: [
      'どの動物が好き？', 'その子はどんな声で鳴くのかな？', '動物園で見たい動物はいる？',
      'その動物は何を食べるのかな？', 'もし会えたら、どんなことをしてみたい？',
      'その動物のどこが好きなの？', '大きい動物と小さい動物、どっちが好き？',
      '動物のお話、もっと聞かせてくれる？', 'その子はどこに住んでいるのかな？',
    ],
    followUps: ['その動物のお話、続きも聞きたいな。どんなところが好き？', 'ほかにはどんな動物が好き？'],
  },
  {
    topic: 'food', match: /食べ|ごはん|おやつ|好きなもの|りんご|バナナ|いちご|カレー|パン|ケーキ|アイス|野菜|やさい/,
    replies: [
      '好きな食べものは何かな？', 'それはどんな味がするの？', 'それを誰と食べたの？',
      'どんなおやつを食べてみたい？', 'あまいものとしょっぱいもの、どっちが好き？',
      'その食べものの色は何色？', 'いっしょにお料理するなら何を作る？',
      '好きなくだものは何かな？', '食べると元気になるものってある？',
    ],
    followUps: ['おいしそうだね。どんなところが好きなの？', '次に食べてみたいものは何かな？'],
  },
  {
    topic: 'weather', match: /天気|お天気|晴れ|はれ|雨|あめ|雪|ゆき|風|かぜ|暑い|寒い|くもり/,
    replies: [
      '今日はどんなお天気？', '晴れたら何をして遊びたい？', '雨の日は何をするのが好き？',
      '雪が降ったら何を作りたい？', 'お外に出るなら何を持っていく？', 'どんな季節が好き？',
      '雨の音ってどんな音に聞こえる？', 'お天気のお話をしてくれてありがとう。今は何がしたい？',
    ],
    followUps: ['そのお天気なら何をして遊べそう？', 'お天気が変わったら何をしてみたい？'],
  },
  {
    topic: 'happy', match: /うれし|嬉し|たのし|楽しい|やった|できた|すき|好き/,
    replies: [
      'うれしい気持ちなんだね！何があったの？', 'にこにこな気分だね。何が楽しかった？',
      'よかったね！その気持ちを誰かにも話した？', 'わあ、すてき！もう少し聞かせて？',
      'できたんだね！どんなところをがんばったの？', 'うれしいことがあると元気になるね。次は何をする？',
      'そのお話を聞けてわたしもうれしいな。どんな気分？', '楽しい時間だったんだね。いちばん好きだったのはどこ？',
    ],
    followUps: ['うれしい気持ち、もう少し教えて。何がいちばんよかった？', 'その楽しかったこと、またやってみたい？'],
  },
  {
    topic: 'sad', match: /かなしい|悲しい|さみしい|寂しい|ないちゃ|泣いちゃ|いやだった|いやだ/,
    replies: [
      'かなしい気持ちなんだね。話してくれてありがとう。近くにいる大人にも話せそう？',
      'そっか、つらかったね。今そばにいてほしい人はいる？', '話してくれてありがとう。何があったか、話せるところだけ教えて？',
      'かなしいときは、ゆっくりしていいんだよ。近くの大人にぎゅっとしてもらえる？',
      'その気持ちを聞かせてくれてありがとう。今できそうなことはある？', 'かなしい気持ちはひとりで持たなくていいよ。保護者に話してみようか？',
      'そばでお話を聞くよ。今はお話ししたい？それとも少し休みたい？', 'いやだったんだね。安心できる大人は近くにいる？',
    ],
    followUps: ['まだかなしいんだね。近くにいる保護者といっしょにいられる？', '話してくれてありがとう。もう少し聞いてもいい？'],
  },
  {
    topic: 'scared', match: /こわい|怖い|おばけ|ゆめ|夢|ひとり|ひとりぼっち/,
    replies: [
      'こわかったね。今、近くにいる保護者に話せる？', 'ここで話してくれてありがとう。今いる場所は安心できる？',
      'こわいときは、信頼できる大人のそばに行こう。近くにいる？', 'その気持ちを聞かせてくれてありがとう。明かりをつけてもらう？',
      'びっくりしたね。保護者にいっしょにいてもらえそう？', 'こわい夢だったのかな？今そばに大人はいる？',
      'ひとりでがまんしなくていいよ。近くの大人を呼べる？', '安心できる人にお話ししよう。だれに話せそう？',
    ],
    followUps: ['まだこわい？近くの保護者といっしょにいようね。', '安心できる大人に話せたかな？'],
  },
  {
    topic: 'surprised', match: /びっくり|おどろ|驚い|まさか/,
    replies: [
      'びっくりしたね！何があったの？', 'わあ、そんなことがあったの？どんな音だった？',
      '急だったのかな？そのあとどうなった？', 'びっくりしたとき、どんな気持ちだった？',
      '教えてくれてありがとう。もう一度見てみたい？', 'それはたしかにびっくりだね。何がいちばん驚いた？',
      'びっくりした気持ち、少し落ち着いた？', 'どんなところで起きたのか教えてくれる？',
    ],
    followUps: ['まだびっくりしてる？何がいちばん気になった？', 'そのあとはどうなったの？'],
  },
  {
    topic: 'repeat', match: /わからない|わかんない|もう一回|もういっかい|聞こえない|なにって|なんて言った|えっと/,
    replies: [
      'ゆっくりもう一度言うね。どこが聞きたい？', 'だいじょうぶだよ。短く言うと、いっしょに考えようってことだよ。',
      'もう一回お話しするね。どのところかな？', 'わからないって言ってくれてありがとう。どこからにしようか？',
      'ゆっくりお話ししよう。何をもう一度聞きたい？', 'だいじょうぶ、いっしょに考えよう。どんなところがむずかしい？',
      'もう一度言えるよ。どの言葉のことかな？', 'あわてなくていいよ。どんなふうに説明したらわかりやすい？',
    ],
    followUps: ['ゆっくり説明するね。どのところが気になった？', 'ほかにも聞きたいことがあったら教えてね。'],
  },
  {
    topic: 'bedtime', match: /おやすみ|ねむ|眠|寝る|ねる|ふとん|布団/,
    replies: [
      'おやすみの時間かな。今日はどんな夢を見たい？', 'ゆっくり休もうね。おやすみ前に何のお話をする？',
      'ねむくなってきたんだね。保護者におやすみを言った？', 'おふとんでゆっくりしようね。好きなぬいぐるみはそばにいる？',
      '今日もお話しできてうれしかったよ。おやすみの準備はできた？', 'ゆっくり眠れますように。どんな夢がいいかな？',
      'もう休む時間だね。保護者といっしょにおやすみしようね。', 'おやすみ。またお話ししようね。今日は何が楽しかった？',
    ],
    followUps: ['そろそろ休もうね。保護者におやすみを言おうか？', 'ゆっくり眠ってね。明日は何をして遊ぼう？'],
  },
];

export const RULE_PATTERN_COUNT = RULES.reduce((total, rule) => total + rule.replies.length, 0);

const SAFETY_PATTERN = /けが|怪我|血が|いたい|痛い|やけど|火をつけ|燃や|危ない|ひみつに|秘密に|触られ|たたか|叩か|殴ら|けられ|蹴られ|死にたい|消えたい/;
const PRIVACY_PATTERN = /名前|フルネーム|パスワード|住所|電話番号|電話|メールアドレス|どこに住|学校の名前/;
const SAFETY_REPLY = '話してくれてありがとう。それはひとりで抱えなくていいよ。近くにいる保護者や信頼できる大人に、今すぐ話そうね。';
const PRIVACY_REPLY = '名前や住所などは、ここで言わなくて大丈夫だよ。個人のことは保護者といっしょに確認しようね。';
const GENERIC_REPLY = 'そうなんだね。もう少し教えてくれる？';

export function protectedConversationReply(input: string): { text: string; topic: 'safety' } | null {
  if (PRIVACY_PATTERN.test(input)) return { text: PRIVACY_REPLY, topic: 'safety' };
  if (SAFETY_PATTERN.test(input)) return { text: SAFETY_REPLY, topic: 'safety' };
  return null;
}

export class RuleBasedConversationEngine implements ConversationEngine {
  reply(input: string, context: ConversationContext): ConversationResult {
    let trimmed = input.trim();
    if (PRIVACY_PATTERN.test(trimmed)) {
      return { text: PRIVACY_REPLY, topic: 'safety', context: { topic: context.topic, turn: context.turn + 1 } };
    }
    if (SAFETY_PATTERN.test(trimmed)) {
      return { text: SAFETY_REPLY, topic: 'safety', context: { topic: context.topic, turn: context.turn + 1 } };
    }

    const repairPrefix = /^(?:ちがう|違う|やっぱり|えっと|あ|そうじゃなくて)[、。\s　]*/;
    const isRepair = repairPrefix.test(trimmed);
    if (isRepair) {
      const corrected = trimmed.replace(repairPrefix, '').replace(/^(?:ちがう|違う|やっぱり|えっと|あ|そうじゃなくて)[、。\s　]*/, '').trim();
      if (corrected.length >= 2 && RULES.some((candidate) => candidate.match.test(corrected))) trimmed = corrected;
      else if (corrected.length < 2 || /^(?:やっぱり|えっと|あ|そうじゃなくて)$/.test(corrected)) {
        return { text: 'うん、ゆっくりでいいよ。どうしたの？', topic: context.topic ?? 'daily', context: { topic: context.topic, turn: context.turn + 1 } };
      } else trimmed = corrected;
    }

    if (/^(?:もう一回|もういっかい|もう一度|もっかい)$/.test(trimmed)) {
      return { text: context.topic ? 'もちろん。もう一回お話しするね。' : 'もちろん。どのお話を聞きたい？', topic: 'repeat', context: { topic: context.topic, turn: context.turn + 1 } };
    }
    if (/^(?:わかんない|わからない|わかんないよ|わからないよ)$/.test(trimmed)) {
      return { text: context.topic ? 'そっか。いっしょにゆっくり考えよう。' : 'そっか。何がわからないか、ゆっくり教えてね。', topic: context.topic ?? 'repeat', context: { topic: context.topic, turn: context.turn + 1 } };
    }
    if (/^(?:うん|うんうん|そう|そうだよ|はい|いや|ううん|ちがう|違う)$/.test(trimmed)) {
      if (!context.topic) return { text: trimmed === 'いや' || trimmed === 'ううん' ? 'そっか。教えてくれてありがとう。' : 'そうなんだね。', topic: 'daily', context: { topic: null, turn: context.turn + 1 } };
      const negative = /^(?:いや|ううん|ちがう|違う)$/.test(trimmed);
      const text = context.topic === 'greeting'
        ? (negative ? 'そっか。じゃあ、何のお話にしようか？' : 'うんうん。どんなことを話そうか？')
        : negative ? 'そっか。じゃあ、どんなのがいい？' : 'うんうん。もう少し聞かせて？';
      return { text, topic: context.topic, context: { topic: context.topic, turn: context.turn + 1 } };
    }

    const rule = RULES.find((candidate) => candidate.match.test(trimmed));
    if (!rule) {
      const text = isRepair ? 'うん、そうなんだね。どういうことか教えてくれる？' : GENERIC_REPLY;
      return { text, topic: context.topic ?? 'daily', context: { topic: context.topic, turn: context.turn + 1 } };
    }

    const sameTopic = context.topic === rule.topic && context.turn > 0;
    const source = sameTopic ? rule.followUps : rule.replies;
    const text = source[context.turn % source.length] ?? GENERIC_REPLY;
    return { text, topic: rule.topic, context: { topic: rule.topic, turn: context.turn + 1 } };
  }
}

export class MockConversationEngine implements ConversationEngine {
  reply(input: string, context: ConversationContext): ConversationResult {
    const text = input.trim()
      ? `「${input.trim().slice(0, 30)}」って思ったんだね。もう少し教えてくれる？`
      : GENERIC_REPLY;
    return { text, topic: context.topic ?? 'daily', context: { topic: context.topic, turn: context.turn + 1 } };
  }
}

/** Future adapter seam only. No local model is bundled or loaded in Phase 3A. */
export interface LocalLLMConversationEngine extends ConversationEngine {
  readonly kind: 'local-llm';
}

export const EMPTY_CONVERSATION_CONTEXT: ConversationContext = { topic: null, category: undefined, turn: 0 };
