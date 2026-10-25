import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_CONVERSATION_CONTEXT, RuleBasedConversationEngine } from '../src/conversation/conversation-engine.ts';
import { ImaginativePlayConversationEngine } from '../src/conversation/imaginative-play-engine.ts';
import { NaturalConversationEngine } from '../src/conversation/natural-conversation-engine.ts';
import { PlayInvitationConversationEngine } from '../src/conversation/play-invitation-engine.ts';

function engine(): ImaginativePlayConversationEngine {
  return new ImaginativePlayConversationEngine(new RuleBasedConversationEngine());
}

function say(play: ImaginativePlayConversationEngine, input: string, context = { ...EMPTY_CONVERSATION_CONTEXT }) {
  return play.reply(input, context);
}

test('builds a child-led bus, space, dinosaur, and roof play sequence', () => {
  const play = engine();
  const bus = say(play, 'バス！');
  assert.match(bus.text, /どこに行くバス/);
  assert.equal(bus.context.imaginativePlay?.subject, 'バス');

  const space = say(play, '宇宙！', bus.context);
  assert.equal(space.text, '宇宙バスだ！お月さまに停まろう！');
  const dinosaur = say(play, '恐竜も乗る！', space.context);
  assert.equal(dinosaur.text, 'えーっ！恐竜の頭が屋根から出ちゃう！');
  const roof = say(play, '屋根を大きくする！', dinosaur.context);
  assert.equal(roof.text, 'すごい！恐竜専用のバスだ！');
});

test('combines train, sea, and fish suggestions', () => {
  const play = engine();
  const train = say(play, '電車',);
  const sea = say(play, '海！', train.context);
  assert.match(sea.text, /海へ行く電車/);
  const fish = say(play, '魚も！', sea.context);
  assert.match(fish.text, /魚も乗る/);
  assert.equal(fish.context.imaginativePlay?.guest, '魚');
});

test('turns an accepted play-discovery invitation into child-led imaginative play', () => {
  const play = new ImaginativePlayConversationEngine(
    new PlayInvitationConversationEngine(new NaturalConversationEngine()),
  );
  const offer = play.reply('遊びを見つけたい', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(offer.context.playInvitation?.gameId, 'discovery');

  const accepted = play.reply('いいよ', offer.context);
  assert.match(accepted.text, /好きなものをひとつ教えて/);

  const childIdea = play.reply('バス！', accepted.context);
  assert.match(childIdea.text, /どこに行くバス/);
  assert.equal(childIdea.context.playInvitation, undefined);
  assert.equal(childIdea.context.imaginativePlay?.subject, 'バス');
  assert.doesNotMatch(JSON.stringify(childIdea.context), /遊びを見つけたい|バス！/);
});

test('lets the child change the play direction and end naturally', () => {
  const play = engine();
  const bus = say(play, 'バス');
  const changed = say(play, 'やっぱり電車にする！', bus.context);
  assert.match(changed.text, /電車だね/);
  assert.equal(changed.context.imaginativePlay?.subject, '電車');
  const ended = say(play, 'おしまい', changed.context);
  assert.match(ended.text, /ここでおしまい/);
  assert.equal(ended.context.imaginativePlay, undefined);
});

test('does not start from short ambiguous input or ordinary conversation', () => {
  const play = engine();
  for (const input of ['あ', 'それ', '今日は幼稚園で遊んだ']) {
    const result = say(play, input);
    assert.equal(result.context.imaginativePlay, undefined, input);
  }
});

test('does not prompt again after silence and clears play on a topic change', () => {
  const play = engine();
  const started = say(play, 'バス');
  const nextTurn = say(play, '今日は幼稚園で遊んだ', started.context);
  assert.equal(nextTurn.context.imaginativePlay, undefined);
});

test('safety and privacy replies take priority and clear active play', () => {
  const play = engine();
  const started = say(play, 'バス');
  const safety = say(play, '住所を教えるね', started.context);
  assert.equal(safety.topic, 'safety');
  assert.match(safety.text, /言わなくて大丈夫/);
  assert.equal(safety.context.imaginativePlay, undefined);
});

test('ends imaginative play gently when the child says goodnight', () => {
  const play = engine();
  const started = say(play, 'バス');
  const ended = say(play, 'おやすみ', started.context);
  assert.equal(ended.context.imaginativePlay, undefined);
  assert.match(ended.text, /おやすみ|休んで/);
  assert.doesNotMatch(ended.text, /[？?]/);
});
