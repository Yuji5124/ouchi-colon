import type {
  ConversationContext,
  ConversationEngine,
  ConversationQuality,
  ConversationResult,
} from './conversation-engine.ts';

export interface PlayRound {
  prompt: string;
  answers?: readonly string[];
  answer?: string;
}

export interface PlayInvitation {
  id: string;
  name: string;
  invitation: string;
  opening: string;
  rounds: readonly PlayRound[];
}

/** Data-only invitations make it easy to add small, deterministic games later. */
export const PLAY_INVITATIONS: readonly PlayInvitation[] = [
  {
    id: 'copycat', name: 'まねっこあそび',
    invitation: 'まねっこあそびしない？',
    opening: 'やった！ じゃあ、ぼくのまねしてね。ぴょん！',
    rounds: [
      { prompt: 'ぴょん！', answers: ['ぴょん', 'ぴょーん', 'とん'], answer: 'ぴょん！' },
      { prompt: 'ぶーん！', answers: ['ぶーん', 'ぶんぶん', 'ぶー'], answer: 'ぶーん！' },
      { prompt: 'ぷるるん！', answers: ['ぷるるん', 'ぷるん', 'ぷるぷる'], answer: 'ぷるるん！' },
    ],
  },
  {
    id: 'riddle', name: 'なぞなぞ',
    invitation: 'かんたんなぞなぞ、いっしょにしない？',
    opening: 'やった！ なぞなぞだよ。「にゃー」って鳴いて、ひげがある動物、だーれ？',
    rounds: [
      { prompt: '「にゃー」って鳴いて、ひげがある動物、だーれ？', answers: ['ねこ', 'ねこちゃん', 'にゃんこ', '猫'], answer: 'ねこ' },
      { prompt: '赤くて、木になることがあるくだもの、なーんだ？', answers: ['りんご', '林檎'], answer: 'りんご' },
      { prompt: '雨の日に足にはくと、ぬれにくいもの、なーんだ？', answers: ['ながぐつ', '長靴', 'ながくつ'], answer: 'ながぐつ' },
    ],
  },
  {
    id: 'wordplay', name: 'ことばあそび',
    invitation: 'ことばをならべて、へんな音を作ってみない？',
    opening: 'やった！ コロンは「ぷにょ・ぽこ・ぷー」！ きみも好きな音を言ってみて！',
    rounds: [
      { prompt: '「ぷにょ・ぽこ・ぷー」！ きみはどんな音にする？' },
      { prompt: 'つぎは「ぴた・ぽた・ぴー」！ へんな音になったかな？' },
      { prompt: 'コロンは「むにゃ・もにょ・むー」！ もうひとつ作れる？' },
    ],
  },
  {
    id: 'imagination', name: 'そうぞうあそび',
    invitation: 'ふしぎな場所をいっしょに想像してみない？',
    opening: 'やった！ ふわふわ雲の電車に乗れたよ。どこへ行こうかな？',
    rounds: [
      { prompt: '雲の電車で、どこへ行ってみたい？' },
      { prompt: 'そこに着いたら、どんなものがあるかな？' },
      { prompt: 'コロンは星のクッキーを持っていこうかな。きみは何を持つ？' },
    ],
  },
  {
    id: 'discovery', name: 'あそび発見',
    invitation: '好きなものから、あたらしい遊びを見つけてみない？',
    opening: 'やった！ 好きなものをひとつ教えて。そこから遊びを考えよう！',
    rounds: [
      { prompt: 'それを使って、どんな遊びができるかな？' },
      { prompt: 'いいね！ ほかにも何を足してみよう？' },
      { prompt: 'きみのアイデアで、あそびができてきたね！' },
    ],
  },
];

const BOREDOM = /^(?:ひま(?:だなあ?|だよ|ー)?|たいくつ|退屈|つまんない|つまらない|つまらなーい)(?:なあ?|だよ)?[。！!…\s　]*$/;
const DIRECT_PLAY = /^(?:あそぼう|遊ぼう|なんかしよう|なにかしよう|何かしよう|あそんで|遊んで|いっしょにあそぼう|一緒に遊ぼう)(?:よ)?[。！!？?\s　]*$/;
const WHAT_TO_DO = /^(?:なにする|何する|なにしてあそぶ|何して遊ぶ)[？?。！!\s　]*$/;
const DISCOVERY_CUE = /^(?:あそびをみつけたい|遊びを見つけたい|あそびをみつけよう|遊びを見つけよう|なにしてあそぼうかな|何して遊ぼうかな)[？?。！!\s　]*$/;
const YES = /^(?:うん|うんうん|いいよ|いいね|もちろん|やろう|あそぼう|遊ぼう|やってみる|やってみよう|はい)[。！!\s　]*$/;
const NO = /いや|やだ|やめる|やめて|やめたい|もういい|したくない|あそばない|遊ばない/;
const OTHER_GAME = /(?:ほかの|他の|別の)(?:あそび|遊び)?(?:がいい|にして|がしたい|やりたい|やろう)|ちがうあそびがいい|違う遊びがいい|なぞなぞがいい|まねっこがいい|ことばあそびがいい|そうぞうあそびがいい/;
const TOPIC_CHANGE = /^(?:ところで|それより|あとね|そういえば|きょうね|今日ね|今日|きょう|幼稚園|保育園|ママに|パパに|おなかが|お腹が)/;
const GAME_CATEGORIES = new Set(['play-toys', 'pretend-imagination', 'animals-insects', 'feelings', 'why-questions', 'unknown', 'word-learning']);

function qualityCategory(result: ConversationResult): string {
  return result.quality?.category ?? 'unknown';
}

function categoryForGame(gameId: string | null): string | null {
  if (gameId === 'riddle') return 'why-questions';
  if (gameId === 'imagination') return 'pretend-imagination';
  if (gameId) return 'play-toys';
  return null;
}

function isSafetyOrLearning(result: ConversationResult): boolean {
  return result.topic === 'safety' || qualityCategory(result) === 'safety' || qualityCategory(result) === 'word-learning';
}

function invitationTrigger(input: string, result: ConversationResult): boolean {
  if (BOREDOM.test(input.trim())) return true;
  if (DISCOVERY_CUE.test(input.trim())) return true;
  const intent = result.quality?.intent;
  return (DIRECT_PLAY.test(input.trim()) && (intent === 'request' || intent === 'proposal'))
    || (WHAT_TO_DO.test(input.trim()) && intent === 'question');
}

function stopRequested(input: string, result: ConversationResult): boolean {
  return NO.test(input.trim()) || result.quality?.intent === 'refusal';
}

function accepted(input: string, result: ConversationResult): boolean {
  return YES.test(input.trim()) || result.quality?.intent === 'short-answer' && YES.test(input.trim());
}

function changeRequested(input: string): boolean {
  return OTHER_GAME.test(input);
}

function isTopicChange(input: string, result: ConversationResult): boolean {
  if (TOPIC_CHANGE.test(input.trim())) return true;
  if (result.quality?.ruleId && !GAME_CATEGORIES.has(qualityCategory(result))) return true;
  return false;
}

function withoutPlayState(result: ConversationResult, previous: ConversationContext): ConversationResult {
  return {
    ...result,
    context: {
      ...result.context,
      playInvitation: undefined,
      playInvitesSuppressedUntil: (previous.playInvitesSuppressedUntil ?? -1) > previous.turn
        ? previous.playInvitesSuppressedUntil : undefined,
    },
  };
}

function makeResult(
  result: ConversationResult,
  text: string,
  gameId: string | null,
  turns = 0,
  round = 0,
  suppressedUntil = result.context.playInvitesSuppressedUntil,
): ConversationResult {
  const quality: ConversationQuality = result.quality
    ? { ...result.quality, category: categoryForGame(gameId) ?? result.quality.category ?? 'play-toys', ruleId: gameId ? `play.${gameId}` : 'play.finished' }
    : { intent: 'unknown', replyType: 'PLAY', questionRate: 0, duplicateReplyCount: 0, contextUsed: false, fallback: false, category: categoryForGame(gameId) ?? 'play-toys', ruleId: gameId ? `play.${gameId}` : 'play.finished' };
  return {
    ...result,
    text,
    topic: 'play',
    quality,
    context: {
      ...result.context,
      topic: 'play',
      playInvitation: gameId ? { phase: 'playing', gameId, turns, round } : undefined,
      playInvitesSuppressedUntil: suppressedUntil,
    },
  };
}

function offerResult(result: ConversationResult, game: PlayInvitation, turns = 0, round = 0): ConversationResult {
  const offered = makeResult(result, `いいよ！ ${game.name}にしよう。${game.invitation}`, game.id, turns, round);
  return {
    ...offered,
    quality: offered.quality ? { ...offered.quality, emotion: 'JOY' } : undefined,
    context: { ...offered.context, playInvitation: { phase: 'invited', gameId: game.id, turns, round } },
  };
}

function findRequestedGame(input: string): PlayInvitation | null {
  if (DISCOVERY_CUE.test(input.trim())) return PLAY_INVITATIONS.find((game) => game.id === 'discovery') ?? null;
  if (/なぞなぞ/.test(input)) return PLAY_INVITATIONS.find((game) => game.id === 'riddle') ?? null;
  if (/まねっこ/.test(input)) return PLAY_INVITATIONS.find((game) => game.id === 'copycat') ?? null;
  if (/ことばあそび|言葉遊び/.test(input)) return PLAY_INVITATIONS.find((game) => game.id === 'wordplay') ?? null;
  if (/そうぞうあそび|想像遊び/.test(input)) return PLAY_INVITATIONS.find((game) => game.id === 'imagination') ?? null;
  return null;
}

function nextGame(currentId: string, input: string, turn: number): PlayInvitation {
  const requested = findRequestedGame(input);
  if (requested && requested.id !== currentId) return requested;
  const index = PLAY_INVITATIONS.findIndex((game) => game.id === currentId);
  return PLAY_INVITATIONS[(index + 1 + Math.max(0, turn) % (PLAY_INVITATIONS.length - 1)) % PLAY_INVITATIONS.length]!;
}

function startsGame(result: ConversationResult, game: PlayInvitation, turns = 0, round = 0): ConversationResult {
  const currentRound = game.rounds[round % game.rounds.length]!;
  const opening = round === 0 ? game.opening : currentRound.prompt;
  const started = makeResult(result, opening, game.id, turns, round);
  return { ...started, quality: started.quality ? { ...started.quality, emotion: 'JOY' } : undefined };
}

function riddleReply(input: string, game: PlayInvitation, round: number): { text: string; nextRound: number } {
  const item = game.rounds[round % game.rounds.length]!;
  const normalized = input.trim().replace(/[。！!？?\s　]/g, '').toLowerCase();
  const isNegated = /じゃない|ではない|ちがう|違う/.test(normalized);
  const isCorrect = !isNegated && (item.answers?.some((answer) => normalized.includes(answer.toLowerCase())) ?? false);
  const doesntKnow = /わから|わかんない|むずかし|むずい/.test(normalized);
  const response = isCorrect
    ? `あたり！${item.answer}だね。コロン、うれしい！`
    : doesntKnow
      ? `だいじょうぶ！こたえは${item.answer}だよ。いっしょに考えるの楽しいね。`
      : `そのこたえもおもしろい！コロンは${item.answer}かなって思ったよ。`;
  return { text: `${response} もう一問やってみる？`, nextRound: round + 1 };
}

/** Plays short, opt-in turns on top of the existing natural conversation engine. */
export class PlayInvitationConversationEngine implements ConversationEngine {
  private readonly conversation: ConversationEngine;

  constructor(conversation: ConversationEngine) {
    this.conversation = conversation;
  }

  reply(input: string, context: ConversationContext): ConversationResult {
    const result = this.conversation.reply(input, context);
    if (isSafetyOrLearning(result)) return withoutPlayState(result, context);

    const state = context.playInvitation;
    if (state) {
      const game = PLAY_INVITATIONS.find((item) => item.id === state.gameId);
      if (!game) return withoutPlayState(result, context);

      if (changeRequested(input)) {
        const alternative = nextGame(game.id, input, state.turns);
        return offerResult(result, alternative, state.turns, state.round);
      }

      if (stopRequested(input, result)) {
        const goodbye = /やめる|もういい/.test(input) ? 'うん、ここでおしまい。また遊びたくなったら教えてね。' : 'そっか！ またあそぼうね。';
        return makeResult(result, goodbye, null, 0, 0, result.context.turn + 2);
      }

      if (state.phase === 'invited') {
        if (accepted(input, result)) return startsGame(result, game, state.turns, state.round);
        return withoutPlayState(result, context);
      }

      if (isTopicChange(input, result)) return withoutPlayState(result, context);

      if (game.id === 'riddle') {
        const response = riddleReply(input, game, state.round);
        return {
          ...makeResult(result, response.text, game.id, state.turns + 1, response.nextRound),
          context: { ...result.context, topic: 'play', playInvitation: { phase: 'invited', gameId: game.id, turns: state.turns + 1, round: response.nextRound } },
        };
      }

      const nextRound = state.round + 1;
      if (state.turns >= 2 || nextRound >= game.rounds.length) {
        return makeResult(result, `あー、たのしかった！${input.trim() ? 'おもしろいね！' : ''}また遊びたくなったら教えてね。`, null);
      }

      const playfulReplies: Record<string, readonly string[]> = {
        copycat: ['わあ、いいね！ コロンもできた！', 'えへへ、そっくり！コロンもうれしい！'],
        wordplay: ['その音、おもしろい！コロンも「ぽよよーん」って言ってみた！', 'へんな音になったね！コロンのおなかまで、ぷるぷる！'],
        imagination: ['わあ、そこに行くの楽しそう！コロンは星のクッキーを持っていくね。', 'すてき！雲の電車、ふわふわ走ってるよ。次は何が見えるかな？'],
      };
      const replies = playfulReplies[game.id] ?? ['それ、おもしろいね！つぎもやってみよう！'];
      const prompt = game.rounds[nextRound]!.prompt;
      const responseText = `${replies[state.turns % replies.length]} ${prompt}`;
      return makeResult(result, responseText, game.id, state.turns + 1, nextRound);
    }

    if (!invitationTrigger(input, result)) return withoutPlayState(result, context);
    const explicit = DIRECT_PLAY.test(input.trim());
    if (!explicit && (context.playInvitesSuppressedUntil ?? -1) > context.turn) return withoutPlayState(result, context);

    const game = findRequestedGame(input) ?? PLAY_INVITATIONS[context.turn % PLAY_INVITATIONS.length]!;
    const offered = makeResult(result, `ねえ、${game.invitation}`, game.id);
    return {
      ...offered,
      quality: offered.quality ? { ...offered.quality, emotion: 'JOY' } : undefined,
      context: { ...result.context, topic: 'play', playInvitation: { phase: 'invited', gameId: game.id, turns: 0, round: 0 } },
    };
  }
}
