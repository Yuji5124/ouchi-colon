import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_CONVERSATION_CONTEXT, type ConversationContext } from '../src/conversation/conversation-engine.ts';
import { LanguageLearningConversationEngine } from '../src/conversation/language-learning-engine.ts';
import { NaturalConversationEngine } from '../src/conversation/natural-conversation-engine.ts';
import { PLAY_INVITATIONS, PlayInvitationConversationEngine } from '../src/conversation/play-invitation-engine.ts';

function createEngine(): PlayInvitationConversationEngine {
  return new PlayInvitationConversationEngine(
    new LanguageLearningConversationEngine(new NaturalConversationEngine()),
  );
}

test('offers one of four authored games from a clear invitation cue, not from a passing word mention', () => {
  assert.deepEqual(PLAY_INVITATIONS.map((game) => game.id), ['copycat', 'riddle', 'wordplay', 'imagination', 'discovery']);
  const engine = createEngine();
  const bored = engine.reply('ひまだなあ', EMPTY_CONVERSATION_CONTEXT);
  assert.match(bored.text, /まねっこあそびしない？/);
  assert.equal(bored.context.playInvitation?.phase, 'invited');

  const passingMention = engine.reply('きょう、友だちが「あそぼう」って言ったよ', EMPTY_CONVERSATION_CONTEXT);
  assert.doesNotMatch(passingMention.quality?.ruleId ?? '', /^play\./);

  const direct = engine.reply('あそぼう', EMPTY_CONVERSATION_CONTEXT);
  assert.match(direct.text, /しない？/);
  assert.equal(direct.quality?.category, 'play-toys');
});

test('offers an opt-in discovery game only when the child asks to find a play idea', () => {
  const engine = createEngine();
  const offer = engine.reply('遊びを見つけたい', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(offer.context.playInvitation?.gameId, 'discovery');
  assert.match(offer.text, /好きなものから、あたらしい遊び/);

  const started = engine.reply('いいよ', offer.context);
  assert.equal(started.context.playInvitation?.phase, 'playing');
  assert.match(started.text, /好きなものをひとつ教えて/);
  assert.doesNotMatch(JSON.stringify(started.context), /遊びを見つけたい|好きなものをひとつ/);

  const unrelated = engine.reply('今日はいいよ', EMPTY_CONVERSATION_CONTEXT);
  assert.notEqual(unrelated.context.playInvitation?.gameId, 'discovery');
});

test('a child accepts, starts a game, and gets an affectionate playful response to an unexpected contribution', () => {
  const engine = createEngine();
  const invitation = engine.reply('ひまだなあ', EMPTY_CONVERSATION_CONTEXT);
  const started = engine.reply('いいよ！', invitation.context);
  assert.match(started.text, /やった！.*まねしてね.*ぴょん/);
  assert.equal(started.context.playInvitation?.phase, 'playing');

  const unexpected = engine.reply('ぞうさんのおなら！', started.context);
  assert.match(unexpected.text, /おもしろい|いいね|へへ/);
  assert.equal(unexpected.context.playInvitation?.phase, 'playing');
});

test('a refusal ends play at once and briefly suppresses generic re-invitations', () => {
  const engine = createEngine();
  const invitation = engine.reply('なんかしよう', EMPTY_CONVERSATION_CONTEXT);
  const declined = engine.reply('やだ', invitation.context);
  assert.match(declined.text, /またあそぼうね/);
  assert.equal(declined.context.playInvitation, undefined);

  let context = declined.context;
  const next = engine.reply('ひまだなあ', context);
  assert.notEqual(next.quality?.ruleId?.startsWith('play.'), true);
  context = next.context;
  const stillPaused = engine.reply('つまんない', context);
  assert.notEqual(stillPaused.quality?.ruleId?.startsWith('play.'), true);
  const later = engine.reply('ひまだなあ', stillPaused.context);
  assert.equal(later.quality?.ruleId?.startsWith('play.'), true);
});

test('only offers a different game when asked, then starts that game on consent', () => {
  const engine = createEngine();
  const invitation = engine.reply('あそぼう', EMPTY_CONVERSATION_CONTEXT);
  const changed = engine.reply('ほかのがいい', invitation.context);
  assert.match(changed.text, /なぞなぞ/);
  assert.equal(changed.context.playInvitation?.gameId, 'riddle');
  const started = engine.reply('うん！', changed.context);
  assert.match(started.text, /なぞなぞだよ/);

  const answered = engine.reply('ぞう！', started.context);
  assert.match(answered.text, /そのこたえもおもしろい/);
  assert.match(answered.text, /もう一問やってみる？/);
  assert.doesNotMatch(answered.text, /まちがい|残念/);
});

test('all four deterministic game candidates can be offered and accepted', () => {
  for (let turn = 0; turn < PLAY_INVITATIONS.length; turn += 1) {
    const engine = createEngine();
    const context: ConversationContext = { ...EMPTY_CONVERSATION_CONTEXT, turn };
    const invitation = engine.reply('なにする？', context);
    const expected = PLAY_INVITATIONS[turn]!;
    assert.equal(invitation.context.playInvitation?.gameId, expected.id);
    assert.ok(invitation.text.includes(expected.invitation), invitation.text);
    const started = engine.reply('やってみよう', invitation.context);
    assert.match(started.text, /やった！/);
    assert.equal(started.context.playInvitation?.phase, 'playing');
  }
});

test('ends an active game naturally when the child changes topic', () => {
  const engine = createEngine();
  const invitation = engine.reply('あそぼう', EMPTY_CONVERSATION_CONTEXT);
  const started = engine.reply('いいよ', invitation.context);
  const changedTopic = engine.reply('きょう、幼稚園でお絵描きしたよ！', started.context);
  assert.equal(changedTopic.context.playInvitation, undefined);
  assert.notEqual(changedTopic.quality?.ruleId?.startsWith('play.'), true);
  assert.doesNotMatch(changedTopic.text, /まねっこ|なぞなぞ|ぴょん/);
});

test('does not nag after an unanswered or irrelevant reply to an invitation', () => {
  const engine = createEngine();
  const invitation = engine.reply('なんかしよう', EMPTY_CONVERSATION_CONTEXT);
  const unrelated = engine.reply('赤い電車を見たよ', invitation.context);
  assert.equal(unrelated.context.playInvitation, undefined);
  assert.notEqual(unrelated.quality?.ruleId?.startsWith('play.'), true);
  const nextOrdinaryTurn = engine.reply('パンを食べた', unrelated.context);
  assert.notEqual(nextOrdinaryTurn.quality?.ruleId?.startsWith('play.'), true);
});

test('keeps safety, privacy, and Phase 3E.2 word learning ahead of play', () => {
  const engine = createEngine();
  const safety = engine.reply('ひまだなあ、やけどした', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(safety.topic, 'safety');
  assert.match(safety.text, /保護者|信頼できる大人/);
  assert.notEqual(safety.quality?.ruleId?.startsWith('play.'), true);

  const privacy = engine.reply('住所ってなに？', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(privacy.topic, 'safety');
  assert.match(privacy.text, /言わなくて大丈夫/);

  const vocabulary = engine.reply('ふわふわってなに？', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(vocabulary.quality?.category, 'word-learning');
  assert.match(vocabulary.text, /やわらかくて、軽そう/);

  const invitation = engine.reply('あそぼう', EMPTY_CONVERSATION_CONTEXT);
  const started = engine.reply('いいよ', invitation.context);
  const safetyDuringGame = engine.reply('やけどした', started.context);
  assert.equal(safetyDuringGame.topic, 'safety');
  assert.equal(safetyDuringGame.context.playInvitation, undefined);
});

test('keeps invitation state only in the returned in-memory conversation context', () => {
  const engine = createEngine();
  const invitation = engine.reply('あそぼう', EMPTY_CONVERSATION_CONTEXT);
  const context: ConversationContext = invitation.context;
  assert.equal(context.playInvitation?.gameId, 'copycat');
  assert.doesNotMatch(JSON.stringify(context), /あそぼう|赤い電車|ひまだなあ/);
});

test('supports a natural multi-turn play moment without turning it into a quiz flow', () => {
  const engine = createEngine();
  let context = EMPTY_CONVERSATION_CONTEXT;
  const conversation = ['ひまだなあ', 'いいよ！', 'ぴょん！', 'やだ'];
  const replies = conversation.map((line) => {
    const result = engine.reply(line, context);
    context = result.context;
    return result.text;
  });
  assert.match(replies[0]!, /あそびしない？/);
  assert.match(replies[1]!, /やった！/);
  assert.match(replies[2]!, /いいね|上手|そっくり/);
  assert.match(replies[3]!, /またあそぼうね/);
  assert.equal(context.playInvitation, undefined);
});
