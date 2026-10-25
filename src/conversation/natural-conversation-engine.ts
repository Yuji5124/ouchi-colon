import {
  protectedConversationReply,
  type ConversationContext,
  type ConversationEngine,
  type ConversationIntent,
  type ConversationQuality,
  type ConversationResult,
  type ConversationTopic,
  type ReplyType,
} from './conversation-engine.ts';
import { chooseReplyType, repeatedReplyCount } from './conversation-policy.ts';
import { candidateFor, CONVERSATION_ENTITIES, matchConversationLibrary, escapeRegex, type ConversationCategory, type ConversationLibraryEntry } from './library/index.ts';

interface ParsedUtterance {
  original: string;
  intent: ConversationIntent;
  subject: string | null;
  action: string | null;
  feature: string | null;
  topic: ConversationTopic;
  corrected: boolean;
  endRequested: boolean;
  fallback: boolean;
  category: ConversationCategory | 'unknown';
  ruleId: string | null;
  fallbackReason: string | null;
  libraryEntry: ConversationLibraryEntry | null;
}

const SUBJECTS: readonly [RegExp, string, ConversationTopic][] = [
  [/クモの巣|蜘蛛の巣/, 'クモの巣', 'animals'],
  [/消防車|しょうぼうしゃ|しょうぼう車/, '消防車', 'play'],
  [/バス|ばす/, 'バス', 'play'],
  [/電車|でんしゃ|新幹線|しんかんせん|汽車/, '電車', 'things'],
  [/お城|しろ|城/, 'お城', 'play'],
  [/おうち|お家|家|いえ|おうち/, 'おうち', 'play'],
  [/ブロック|積み木|つみき/, 'ブロック', 'play'],
  [/クモ|蜘蛛/, 'クモ', 'animals'],
  [/ちょうちょ|蝶/, 'ちょうちょ', 'animals'], [/アリ|あり/, 'アリ', 'animals'], [/てんとう虫/, 'てんとう虫', 'animals'],
  [/虫|むし/, '虫', 'animals'],
  [/ねこ|猫|にゃん/, 'ねこ', 'animals'], [/いぬ|犬|わんわん/, 'いぬ', 'animals'], [/うさぎ/, 'うさぎ', 'animals'],
  [/くま/, 'くま', 'animals'], [/ぞう/, 'ぞう', 'animals'], [/きりん/, 'きりん', 'animals'],
  [/恐竜|きょうりゅう/, '恐竜', 'animals'], [/鳥|とり/, '鳥', 'animals'], [/魚|さかな/, '魚', 'animals'], [/動物|どうぶつ/, '動物', 'animals'],
  [/りんご/, 'りんご', 'food'], [/バナナ/, 'バナナ', 'food'], [/いちご/, 'いちご', 'food'],
  [/カレー/, 'カレー', 'food'], [/パン/, 'パン', 'food'], [/ケーキ/, 'ケーキ', 'food'], [/アイス/, 'アイス', 'food'],
  [/おやつ|ごはん/, 'ごはん', 'food'], [/食べもの|食べ物/, '食べもの', 'food'],
  [/ボール/, 'ボール', 'play'], [/ぬいぐるみ/, 'ぬいぐるみ', 'play'], [/おもちゃ/, 'おもちゃ', 'play'],
  [/お人形|人形/, 'お人形', 'play'], [/レゴ/, 'レゴ', 'play'],
  ...CONVERSATION_ENTITIES.map((item): [RegExp, string, ConversationTopic] => [
    new RegExp(`(?:${item.aliases.map(escapeRegex).sort((a, b) => b.length - a.length).join('|')})`),
    item.canonical,
    item.topic,
  ]),
];

const COLORS: readonly [RegExp, string][] = [
  [/赤い|あかい|赤/, '赤い'], [/青い|あおい|青/, '青い'], [/黄色い|きいろ|黄色/, '黄色い'],
  [/緑の|みどり|緑/, '緑の'], [/ピンクの|ぴんく/, 'ピンクの'], [/黒い|くろい|黒/, '黒い'], [/白い|しろい|白/, '白い'],
];

function firstMatch<T extends string>(input: string, entries: readonly [RegExp, T][]): T | null {
  return entries.find(([pattern]) => pattern.test(input))?.[1] ?? null;
}

function extractSubject(input: string, preferCorrectionTarget = false): { subject: string; topic: ConversationTopic } | null {
  if (preferCorrectionTarget) {
    const separators = [...input.matchAll(/(?:じゃなくて|ではなくて|じゃなく|ではなく)/g)];
    const separator = separators.at(-1);
    if (separator?.index !== undefined) {
      const correctedPart = input.slice(separator.index + separator[0].length);
      if (correctedPart.trim()) {
        const correctedSubject = extractSubject(correctedPart);
        if (correctedSubject) return correctedSubject;
      }
    }
  }
  for (const [pattern, subject, topic] of SUBJECTS) if (pattern.test(input)) return { subject, topic };
  return null;
}

function parseUtterance(input: string, previous: ConversationContext): ParsedUtterance {
  let text = input.trim().replace(/[。！!？?]+$/g, '');
  const correctionPrefix = /^(?:あ、そうじゃなくて|あ、ちがう|あ、違う|ちがう|違う|やっぱり|そうじゃなくて)[、。！!\s　]*/;
  const corrected = correctionPrefix.test(text);
  const truthPrefix = /^(?:本当は|ほんとは|ほんとうは)[、。！!\s　]*/;
  const truthCorrection = truthPrefix.test(text);
  if (corrected) text = text.replace(correctionPrefix, '').trim();
  else if (truthCorrection) text = text.replace(truthPrefix, '').trim();
  const correction = corrected || truthCorrection;
  const endRequested = /^(?:もういい|もうおしまい|おしまい|おわり|終わり|会話はここまで|やめる|もうやめる|やめて|ばいばい|バイバイ|またね|またあとで|さようなら|じゃあね|おやすみ|ねるね)$/.test(text);

  const found = extractSubject(text, correction);
  let subject = found?.subject ?? null;
  let topic = found?.topic ?? previous.topic ?? 'daily';
  let action: string | null = /作ろう|つくろう/.test(text) ? '作ろう'
    : /作っ|つくっ|組み立て/.test(text) ? '作った'
      : /見つけ|みつけ/.test(text) ? '見つけた'
        : /食べ/.test(text) ? /たい/.test(text) ? '食べたい' : /よう/.test(text) ? '食べよう' : '食べた'
          : /飲みたい/.test(text) ? '飲みたい' : /飲ん|のん/.test(text) ? '飲んだ'
            : /遊ぼう|あそぼう/.test(text) ? '遊ぼう'
              : /遊ん|あそん/.test(text) ? '遊んだ'
                : /走っ|走って/.test(text) ? '走った'
                  : /見た|みた|いた/.test(text) ? '見た' : null;
  const feature = firstMatch(text, COLORS) ?? (/大き|おおき/.test(text) ? '大きい' : /小さ|ちいさ/.test(text) ? '小さい' : /いっぱい|たくさん/.test(text) ? 'たくさん' : null);

  if (!subject && (feature || /大き|おおき|小さ|ちいさ|赤|あか|青|あお|黄色|きいろ|緑|みどり|ピンク|ぴんく|黒|くろ|白|しろ/.test(text))) subject = previous.subject ?? null;
  if (!found && subject) topic = previous.topic ?? 'daily';
  if (!action && subject && previous.assistantQuestionFocus === 'activity') action = '遊んだ';
  if (!action && subject && previous.assistantQuestionFocus === 'object') action = '作った';
  if (!action && subject === 'おうち' && previous.subject === 'ブロック') action = '作った';

  let intent: ConversationIntent = 'unknown';
  if (correction) intent = 'correction';
  else if (endRequested) intent = 'farewell';
  else if (/もう一回|もういっかい|もう一度|もっかい|聞こえない|なんて言った/.test(text)) intent = 'repeat';
  else if (/^(?:いや|ううん|やだ|いやだ|やめて|したくない)$/.test(text)) intent = 'refusal';
  else if (/^(?:うん|うんうん|そう|そうだよ|はい|いいよ|いいね)$/.test(text)) intent = 'short-answer';
  else if (/^(?:ばいばい|バイバイ|またね|またあとで|さようなら|じゃあね|おやすみ|ねるね)$/.test(text)) intent = 'farewell';
  else if (/こんにちは|こんちは|おはよう|おはよ|こんばんは|こんばんわ|やっほ|ただいま|はじめまして/.test(text)) intent = 'greeting';
  else if (/[？?]$|どうして|なんで|何で|なに|何|どこ|だれ|誰|いつ|かな$|どういうこと/.test(input.trim())) intent = 'question';
  else if (/して|してよ|してね|してほしい|歌って|お話して|遊んで|コロン.*(?:きて|来て)/.test(text)) intent = 'request';
  else if (/こわ|怖|かなしい|悲し|さみしい|寂し|いやだった|うれし|嬉し|たのし|楽しかっ|楽しい|つかれ|疲れ|ねむ|眠い|痛い|いたい/.test(text)) intent = 'emotion';
  else if (/(?:好き|すき|大好き|だいすき)じゃない|(?:嫌い|きらい|大嫌い|だいきらい)/.test(text)) intent = 'preference-negative';
  else if (/好き|すき|大好き|だいすき/.test(text)) intent = 'preference';
  else if (/たい(?:な|よ|の)?$|ほしい|欲しい/.test(text)) intent = 'wish';
  else if (/作ろう|つくろう|食べよう|飲もう|遊ぼう|あそぼう|しよう|やろう|しない[？?]?$/.test(text)) intent = 'proposal';
  else if (found || action || feature || /今日|きょう|保育園|幼稚園/.test(text)) intent = 'report';
  else if (previous.lastReplyWasQuestion && text.length <= 8 && subject) intent = 'report';

  if (intent === 'preference' || intent === 'preference-negative') subject ??= previous.subject ?? null;
  if (intent === 'emotion') topic = /こわ|怖/.test(text) ? 'scared'
    : /かなしい|悲し|さみしい|寂し|いやだった/.test(text) ? 'sad'
      : /ねむ|眠/.test(text) ? 'bedtime' : 'happy';
  if (intent === 'greeting' || intent === 'farewell') topic = 'greeting';
  if (intent === 'question' && !found) topic = previous.topic ?? 'daily';

  const library = matchConversationLibrary(input.trim(), intent, previous);
  const category = library.category === 'unknown' ? previous.category as ConversationCategory | undefined ?? 'unknown' : library.category;
  const hasSignal = intent !== 'unknown' || Boolean(found || action || feature);
  return {
    original: input, intent, subject, action, feature, topic, corrected: correction, endRequested,
    fallback: !hasSignal || (intent === 'unknown' && library.category === 'unknown'),
    category, ruleId: library.entry?.id ?? (intent === 'correction' ? 'context.correction' : intent === 'short-answer' && previous.category ? 'context.short-answer' : null),
    fallbackReason: intent === 'unknown' ? library.fallbackReason : null,
    libraryEntry: library.entry,
  };
}

function formatSubject(parsed: ParsedUtterance): string {
  if (parsed.subject === 'クモの巣') return 'クモのおうち';
  if (parsed.subject === '動物') return 'その子';
  if (parsed.subject === '食べもの') return 'それ';
  return parsed.subject ?? 'それ';
}

function makeReply(type: ReplyType, parsed: ParsedUtterance, context: ConversationContext, turn: number): { text: string; focus: ConversationContext['assistantQuestionFocus']; fallback: boolean } {
  const subject = formatSubject(parsed);
  const coloredSubject = `${parsed.feature ?? ''}${parsed.subject ?? 'それ'}`;
  if (parsed.intent === 'correction') {
    if (!parsed.subject) return { text: 'あっ、まちがえちゃった？ごめんね。ほんとは何だった？', focus: 'general', fallback: false };
    return { text: `あっ、${parsed.subject}だったんだ！${parsed.feature ? `${parsed.feature}の、すてきだね！` : 'コロン、まちがえちゃった！'}`, focus: null, fallback: false };
  }
  if (parsed.intent === 'question') {
    if (/コロン.*乗/.test(parsed.original)) {
      return { text: '乗りたい！コロンは窓から景色を見る係！', focus: null, fallback: false };
    }
    if (parsed.category === 'about-colon') {
      if (/好き|すき|大好き|だいすき/.test(parsed.original)) return { text: 'うれしいな！コロンもあなたとお話しするのが好きだよ！', focus: null, fallback: false };
      if (/名前|だれ|誰|なにもの|何者/.test(parsed.original)) return { text: 'コロンは、お話しするキャラクターだよ！', focus: null, fallback: false };
      if (/なんさい|何歳|いくつ/.test(parsed.original)) return { text: 'コロンは年をとらないキャラクターなんだ。', focus: null, fallback: false };
      if (/食べ|飲/.test(parsed.original)) return { text: 'コロンは食べたり飲んだりしないけど、食べ物のお話は好きだよ！', focus: null, fallback: false };
      if (/寝|ねる|眠/.test(parsed.original)) return { text: 'コロンは眠らないけど、おやすみのお話は好きだよ！', focus: null, fallback: false };
      if (/見え|見た|みえる/.test(parsed.original)) return { text: 'コロンは周りの物は見えないんだ。お話で教えてね！', focus: null, fallback: false };
    }
    if (parsed.category === 'food-drink' && parsed.subject) return { text: `コロンは食べないけど、${subject}のお話を聞くのは好きだよ！`, focus: null, fallback: false };
    const candidate = parsed.libraryEntry ? candidateFor(parsed.libraryEntry, type, turn, subject) : null;
    if (candidate) return { text: candidate, focus: null, fallback: false };
    return { text: `うーん、コロンも考え中！いっしょに考えてみよう！`, focus: null, fallback: false };
  }
  if (parsed.intent === 'greeting') {
    const candidate = parsed.libraryEntry ? candidateFor(parsed.libraryEntry, type, turn, subject) : null;
    return { text: candidate ?? (turn % 2 ? 'やっほー！コロン、わくわくしてきた！' : 'こんにちは！会えてうれしいな！'), focus: null, fallback: false };
  }
  if (parsed.intent === 'farewell') {
    if (parsed.endRequested) return { text: 'うん、ここでおしまい。またお話ししたくなったら教えてね。', focus: null, fallback: false };
    const candidate = parsed.libraryEntry ? candidateFor(parsed.libraryEntry, type, turn, subject) : null;
    return { text: candidate ?? 'またお話ししようね！ばいばい！', focus: null, fallback: false };
  }
  if (parsed.intent === 'preference') return { text: `${subject}が好きなんだね！好きな気持ちが伝わってきたよ！`, focus: null, fallback: false };
  if (parsed.intent === 'preference-negative') return { text: `そっか、${subject}は好きじゃないんだね。教えてくれてありがとう！`, focus: null, fallback: false };
  if (parsed.intent === 'wish') return { text: `${subject}がいいんだね！いつかできるといいね！`, focus: null, fallback: false };
  if (parsed.intent === 'proposal') {
    if (parsed.category === 'food-drink') return { text: `いいね！${subject}のお料理ごっこをしよう！`, focus: null, fallback: false };
    const candidate = parsed.libraryEntry ? candidateFor(parsed.libraryEntry, type, turn, subject) : null;
    return { text: candidate ?? `いいね！${subject}でごっこ遊びしよう！`, focus: null, fallback: false };
  }
  if (parsed.intent === 'refusal') return { text: 'そっか、いやなんだね。無理しなくていいよ。', focus: null, fallback: false };
  if (parsed.intent === 'repeat') return { text: context.subject ? `もちろん！${subject}のお話を、ゆっくりもう一回するね。` : 'もちろん！どのお話をもう一回しようか？', focus: context.subject ? null : 'general', fallback: false };
  if (parsed.intent === 'short-answer') {
    if (context.lastReplyWasQuestion) {
      return { text: context.subject ? `うんうん！${subject}のお話、コロンも好き！` : 'うんうん！コロンもいっしょに楽しんでるよ！', focus: null, fallback: false };
    }
    return { text: turn % 2 ? 'そうなんだ！コロン、にこにこ！' : 'うんうん！つづきのお話も楽しみ！', focus: null, fallback: false };
  }
  if (parsed.intent === 'request') {
    return { text: /歌/.test(parsed.original) ? 'いいよ！ラララ〜♪コロンもいっしょに歌うね！' : 'いいよ！ガタンゴトン、コロン電車が出発！', focus: null, fallback: false };
  }
  if (parsed.intent === 'emotion') {
    if (parsed.topic === 'sad' || parsed.topic === 'scared') return { text: 'そうだったんだね。近くの保護者にもお話ししてね。', focus: null, fallback: false };
    if (/楽しかっ|たのしかっ/.test(parsed.original)) {
      return { text: `${context.subject ?? 'それ'}、楽しかったんだね！`, focus: null, fallback: false };
    }
    const candidate = parsed.libraryEntry ? candidateFor(parsed.libraryEntry, type, turn, subject) : null;
    if (candidate) return { text: candidate, focus: null, fallback: false };
    return { text: 'うれしい気持ち、コロンにも伝わったよ！', focus: null, fallback: false };
  }
  if (parsed.intent === 'report' && parsed.subject && parsed.action) {
    if (parsed.action === '見た' && type === 'QUESTION') return { text: `いいなあ！${parsed.subject}、大きかった？`, focus: 'general', fallback: false };
    const replies = parsed.action === '食べた' ? [`${subject}を食べたんだね！おいしそう！`, `${subject}を食べたんだ！どんな味だった？`, `${subject}を食べたんだね。おなかもにこにこかな！`]
      : parsed.action === '飲んだ' ? [`${subject}を飲んだんだね！`, `${subject}を飲んで、のどがすっきりしたかな！`, `${subject}を飲んだんだ！いいね！`]
        : parsed.action === '遊んだ' ? [`${parsed.subject === 'ブロック' ? 'ブロックで' : `${subject}と`}遊んだんだね！楽しそう！`, `${subject}と遊んだんだ！いい時間だったね！`, `${subject}で遊んだんだね。コロンもわくわく！`]
          : parsed.action === '作った' ? [`${subject}を作ったんだね！すてき！`, `${subject}ができたんだ！かっこいいね！`, `${subject}を作ったの！コロンも見てみたいな！`]
            : parsed.action === '見つけた' && parsed.subject === 'クモの巣' ? ['クモのおうち、見つけたの！', 'クモの巣を見つけたんだね！', 'えー！クモのおうちがあったの！']
              : parsed.action === '見た' || parsed.action === '見つけた' ? [`${coloredSubject}を見たんだね！`, `${coloredSubject}を見つけたんだ！`, `わあ、${coloredSubject}がいたんだね！`] : null;
    if (replies) return { text: replies[turn % replies.length]!, focus: null, fallback: false };
  }
  if (parsed.intent === 'unknown') {
    if (type !== 'QUESTION') {
      const acknowledgements = [
        'コロン、今のことばを聞き逃しちゃったみたい。', 'ごめんね、うまく聞き取れなかったよ。',
        'あれれ？コロン、もう一度聞けたらうれしいな。', '今のことば、コロンの耳を通りすぎちゃった！',
        'コロン、まだそのことばがわからないみたい。', 'あっ、聞きそびれちゃった。',
        'コロン、頭の中でことばを探してるよ。', 'もう一度聞いたら、わかるかもしれないな。',
        'コロンの耳がちょっとおやすみしてたみたい。', '今のことば、コロンにはむずかしかったよ。',
      ];
      return { text: acknowledgements[turn % acknowledgements.length]!, focus: null, fallback: true };
    }
    const lines = [
      'ん？コロン、ちょっと聞き取れなかったみたい。もう一回言ってもらえる？',
      'あれれ？今のところ、コロン聞き逃しちゃった。ゆっくりお願い！',
      'ごめんね、うまく聞き取れなかったよ。もう一度聞いてもいい？',
      'コロン、ことばを聞き逃しちゃった。もう一回教えてくれる？',
      'んん？コロンの耳に届かなかったみたい。もう一度いい？',
      '今のことば、ちょっとむずかしかった！ゆっくり聞かせてね。',
      'あれれ、コロン聞き取れなかったよ。もう一度お願い！',
      'コロン、今のことばを探してるよ。もう一回聞かせて？',
      'ごめんね、もう一度言ってくれたらわかるかも！',
      'コロンの耳がびっくりしちゃった！ゆっくりもう一回お願い！',
    ];
    return { text: lines[turn % lines.length]!, focus: type === 'QUESTION' ? 'general' : null, fallback: true };
  }

  if (parsed.feature === '大きい' && parsed.subject) return { text: `${parsed.subject}、大きかったんだね！びっくり！`, focus: null, fallback: false };
  if (parsed.feature && parsed.subject) {
    if (context.lastReplyWasQuestion && context.subject === parsed.subject) return { text: `${coloredSubject}だったんだね！`, focus: null, fallback: false };
    if (type === 'QUESTION') return { text: `${coloredSubject}、どこで見つけたの？`, focus: 'general', fallback: false };
    const reactions: Partial<Record<ReplyType, string>> = {
      REACT: `えー！${coloredSubject}、すてき！`,
      ACKNOWLEDGE: `${coloredSubject}、かっこいいね！`,
      SHARE: `コロンも${parsed.feature}のが好き！`,
      IMAGINE: `${coloredSubject}、遠くからも目立ちそう！`,
      PLAY: `${coloredSubject}で、出発ごっこしよう！`,
    };
    return { text: reactions[type] ?? `${coloredSubject}、すてき！`, focus: null, fallback: false };
  }
  if (parsed.subject === 'クモの巣' && parsed.action === '見つけた') {
    return { text: type === 'QUESTION' ? 'クモのおうち、どこにあったの？' : 'えー！クモのおうち、見つけたの！', focus: type === 'QUESTION' ? 'general' : null, fallback: false };
  }
  if (parsed.subject === '電車') {
    if (type === 'QUESTION') return { text: 'その電車、どこまで走ったの？', focus: 'general', fallback: false };
    if (type === 'PLAY') return { text: 'ガタンゴトン！コロン電車、出発！', focus: null, fallback: false };
    const trainReplies: Partial<Record<ReplyType, string>> = {
      REACT: 'えー！電車が走ってたの！', ACKNOWLEDGE: 'ガタンゴトン！速そう！',
      SHARE: '電車の音、コロンも好き！', IMAGINE: '雲まで走る電車だったら面白そう！',
    };
    return { text: trainReplies[type] ?? '電車のお話、コロンもわくわく！', focus: null, fallback: false };
  }
  if (parsed.subject === 'お城') {
    const castleReplies: Partial<Record<ReplyType, string>> = {
      REACT: 'お城を作ったの！かっこいい！', ACKNOWLEDGE: '大きなお城、すてきだね！',
      SHARE: 'コロンもお城に住んでみたいな！', IMAGINE: 'お城にドラゴンがいたら楽しそう！',
      PLAY: 'お城ごっこしよう！コロンは門番ね！',
    };
    return { text: type === 'QUESTION' ? 'どんなお城を作ったの？' : castleReplies[type] ?? 'お城のお話、すてき！', focus: type === 'QUESTION' ? 'object' : null, fallback: false };
  }
  if (parsed.subject === 'おうち') {
    const houseReplies: Partial<Record<ReplyType, string>> = {
      REACT: 'おうちを作ったの！すてきだね！', ACKNOWLEDGE: 'おうちができたんだね！',
      SHARE: 'コロンのお部屋にはクッションがほしいな！', IMAGINE: 'おうちに小さな滑り台があったら面白そう！',
      PLAY: 'おうちごっこしよう！コロンがお客さんね！',
    };
    return { text: houseReplies[type] ?? 'おうちのお話、すてきだね！', focus: null, fallback: false };
  }
  if (parsed.subject === 'ブロック') {
    if (type === 'QUESTION') return { text: 'ブロックで何を作ったの？', focus: 'object', fallback: false };
    const blockReplies: Partial<Record<ReplyType, string>> = {
      REACT: 'ブロック！コロンもお城を作ってみたい！', ACKNOWLEDGE: parsed.action === '遊んだ' ? 'ブロックで遊んだんだね！いいね！' : 'ブロックで作ったんだね！すごい！',
      SHARE: 'コロンはブロックで長い道を作りたいな！', IMAGINE: 'ブロックのお城に、ねこの王さまがいたら楽しそう！',
      PLAY: 'ブロックでお城ごっこしよう！',
    };
    return { text: blockReplies[type] ?? 'ブロックのお話、わくわくするね！', focus: null, fallback: false };
  }
  if (parsed.libraryEntry) {
    const candidate = candidateFor(parsed.libraryEntry, type, turn, subject);
    if (candidate) return { text: candidate, focus: type === 'QUESTION' ? 'general' : null, fallback: false };
  }
  if (parsed.subject) {
    if (type === 'QUESTION' && parsed.topic === 'play') return { text: `それで何して遊んだの？`, focus: 'activity', fallback: false };
    if (type === 'QUESTION') return { text: `${subject}、どんなところが好き？`, focus: 'general', fallback: false };
    if (type === 'PLAY') return { text: `${subject}ごっこ、いっしょにしよう！`, focus: null, fallback: false };
    if (type === 'IMAGINE') return { text: `${subject}が空を飛んだら、雲まで行けそう！`, focus: null, fallback: false };
    return { text: `${subject}のお話、コロンもわくわく！`, focus: null, fallback: false };
  }
  return { text: 'そうなんだ！コロン、聞けてうれしいな！', focus: null, fallback: false };
}

export class NaturalConversationEngine implements ConversationEngine {
  reply(input: string, context: ConversationContext): ConversationResult {
    const protectedReply = protectedConversationReply(input.trim());
    if (protectedReply) {
      return { text: protectedReply.text, topic: 'safety', context: { ...context, category: 'safety', turn: context.turn + 1 }, quality: { intent: 'emotion', replyType: 'ACKNOWLEDGE', questionRate: 0, duplicateReplyCount: 0, contextUsed: false, fallback: false, category: 'safety', ruleId: 'safety.protected-content', fallbackReason: null } };
    }

    const parsed = parseUtterance(input, context);
    const recentTypes = (context.recentReplyTypes ?? []).slice(-9);
    const recentIds = (context.recentReplyIds ?? []).slice(-9);
    let type = chooseReplyType({
      intent: parsed.intent,
      hasKnownSubject: Boolean(parsed.subject),
      hasCorrection: parsed.corrected,
      lastQuestion: Boolean(context.lastReplyWasQuestion),
      recentTypes,
      recentQuestionCount: recentTypes.filter((entry) => entry === 'QUESTION').length,
      hasNewInformation: parsed.intent === 'report' && Boolean(parsed.subject && parsed.action) && !parsed.feature && !context.lastReplyWasQuestion,
    });
    let reply = makeReply(type, parsed, context, context.turn);
    const variation = parsed.fallback ? `-${context.turn % 10}` : '';
    let replyId = `${type.toLowerCase()}-${parsed.subject ?? parsed.topic}-${parsed.action ?? 'no-action'}-${parsed.feature ?? 'no-feature'}${variation}`;
    if (recentIds.includes(replyId) && parsed.intent !== 'question') {
      for (const alternative of ['REACT', 'ACKNOWLEDGE', 'SHARE', 'IMAGINE', 'PLAY'] as const) {
        const alternativeId = `${alternative.toLowerCase()}-${parsed.subject ?? parsed.topic}-${parsed.action ?? 'no-action'}-${parsed.feature ?? 'no-feature'}${variation}`;
        if (recentIds.includes(alternativeId) || alternative === type) continue;
        type = alternative;
        reply = makeReply(type, parsed, context, context.turn);
        replyId = alternativeId;
        break;
      }
    }
    const nextTypes = [...recentTypes, type].slice(-10);
    const nextIds = [...recentIds, replyId].slice(-10);
    const questions = nextTypes.filter((entry) => entry === 'QUESTION').length;
    const quality: ConversationQuality = {
      intent: parsed.intent,
      replyType: type,
      questionRate: nextTypes.length ? questions / nextTypes.length : 0,
      duplicateReplyCount: repeatedReplyCount(nextIds),
      contextUsed: Boolean(context.subject || context.action || context.feature || context.lastReplyWasQuestion || context.assistantQuestionFocus),
      fallback: reply.fallback || parsed.fallback,
      category: parsed.category,
      ruleId: parsed.ruleId ?? undefined,
      fallbackReason: (reply.fallback || parsed.fallback) ? parsed.fallbackReason ?? (parsed.libraryEntry ? null : 'no-specific-response-rule') : null,
      ...(parsed.intent === 'greeting' ? { emotion: 'JOY' as const }
        : parsed.topic === 'sad' && parsed.intent === 'emotion' ? { emotion: 'SAD' as const }
          : parsed.topic === 'bedtime' && parsed.intent === 'emotion' ? { emotion: 'SLEEPY' as const } : {}),
    };
    const nextContext: ConversationContext = {
      topic: parsed.endRequested ? null : parsed.topic,
      category: parsed.endRequested ? undefined : parsed.category,
      turn: context.turn + 1,
      subject: parsed.endRequested ? null : parsed.subject ?? (parsed.corrected ? null : context.subject ?? null),
      action: parsed.endRequested ? null : parsed.action ?? (parsed.corrected ? null : context.action ?? null),
      feature: parsed.endRequested ? null : parsed.feature ?? (parsed.corrected ? null : context.feature ?? null),
      intent: parsed.intent,
      recentReplyTypes: nextTypes,
      recentReplyIds: nextIds,
      lastReplyWasQuestion: !parsed.endRequested && (type === 'QUESTION' || /[？?]/.test(reply.text)),
      assistantQuestionFocus: parsed.endRequested ? null : reply.focus,
    };
    return { text: reply.text, topic: parsed.topic, context: nextContext, quality };
  }
}
