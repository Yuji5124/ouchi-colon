import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_CONVERSATION_CONTEXT, type ConversationContext } from '../src/conversation/conversation-engine.ts';
import { LanguageLearningConversationEngine } from '../src/conversation/language-learning-engine.ts';
import { NaturalConversationEngine } from '../src/conversation/natural-conversation-engine.ts';
import { PlayInvitationConversationEngine } from '../src/conversation/play-invitation-engine.ts';
import { STORY_SEEDS, StoryPlayConversationEngine } from '../src/conversation/story-play-engine.ts';

function createEngine(): StoryPlayConversationEngine {
  return new StoryPlayConversationEngine(
    new PlayInvitationConversationEngine(
      new LanguageLearningConversationEngine(new NaturalConversationEngine()),
    ),
  );
}

test('starts each of the three authored stories with character, place, event, and no stored child text', () => {
  assert.deepEqual(STORY_SEEDS.map((seed) => seed.id), ['mysterious-door', 'flying-house', 'lost-star']);
  for (let turn = 0; turn < STORY_SEEDS.length; turn += 1) {
    const engine = createEngine();
    const context: ConversationContext = { ...EMPTY_CONVERSATION_CONTEXT, turn };
    const result = engine.reply('おはなししよう', context);
    assert.match(result.quality?.ruleId ?? '', /^story\.start\./);
    assert.equal(result.context.story?.seedId, STORY_SEEDS[turn]?.id);
    assert.ok(result.context.story?.characters.length);
    assert.ok(result.context.story?.place);
    assert.ok(result.context.story?.event);
    assert.equal(result.context.story?.childAction, null);
    assert.doesNotMatch(JSON.stringify(result.context), /おはなししよう/);
  }
});

test('the child opens the door, boards the fish, and transforms it into a dinosaur', () => {
  const engine = createEngine();
  let context = engine.reply('おはなししよう', EMPTY_CONVERSATION_CONTEXT).context;

  const opened = engine.reply('ドアを開ける！', context);
  context = opened.context;
  assert.match(opened.text, /ドアの向こう.*おさかな/);
  assert.equal(context.story?.childAction, '開けた');
  assert.match(context.story?.event ?? '', /見つけた/);

  const rode = engine.reply('おさかなに乗る！', context);
  context = rode.context;
  assert.match(rode.text, /おさかなに乗った/);
  assert.equal(context.story?.place, '雲の上');
  assert.equal(context.story?.childAction, '乗った');

  const transformed = engine.reply('おさかなが恐竜になる！', context);
  assert.match(transformed.text, /おさかな.*恐竜.*なっちゃった/);
  assert.match(transformed.context.story?.event ?? '', /おさかなが恐竜に変身/);
  assert.ok(transformed.context.story?.characters.some((character) => character.includes('恐竜')));
  assert.equal(transformed.context.story?.childAction, '変身させた');
  assert.equal(transformed.context.story?.turns, 3);
});

test('adds a new character and responds to the child talking to it', () => {
  const engine = createEngine();
  const started = engine.reply('ぼうけんしよう', EMPTY_CONVERSATION_CONTEXT);
  const appeared = engine.reply('ドラゴンが出てきた！', started.context);
  assert.match(appeared.text, /ドラゴンも出てきた|ドラゴンがいた/);
  assert.ok(appeared.context.story?.characters.includes('ドラゴン'));

  const talked = engine.reply('ドラゴンに話しかける', appeared.context);
  assert.match(talked.text, /ドラゴンが「ぷくぷく！」って返事した/);
  assert.equal(talked.context.story?.childAction, '話しかけた');
});

test('welcomes an unspecified discovery and invites the child to describe it', () => {
  const engine = createEngine();
  const started = engine.reply('ぼうけんしよう', EMPTY_CONVERSATION_CONTEXT);
  const found = engine.reply('何かを見つけた！', started.context);
  assert.match(found.text, /何か見つけた.*どんなものだった/);
  assert.equal(found.context.story?.event, '何かを見つけた');
  assert.equal(found.context.story?.childAction, '見つけた');
  assert.doesNotMatch(JSON.stringify(found.context), /何かを見つけた！/);
});

test('accepts several free actions and keeps only the latest child action in story state', () => {
  const engine = createEngine();
  const started = engine.reply('おはなしつくろう', EMPTY_CONVERSATION_CONTEXT);
  const helped = engine.reply('うさぎを助ける！', started.context);
  assert.match(helped.text, /うさぎ.*元気になった/);
  assert.equal(helped.context.story?.childAction, '助けた');
  assert.match(helped.context.story?.characters.join('') ?? '', /うさぎ/);

  const moved = engine.reply('右へ行く！', helped.context);
  assert.match(moved.text, /右へ進んだ/);
  assert.equal(moved.context.story?.childAction, '進んだ');
  assert.match(moved.context.story?.event ?? '', /右へ進んだ/);
});

test('asks gently when a free utterance is outside the local rules, without pretending or storing it', () => {
  const engine = createEngine();
  const started = engine.reply('おはなししよう', EMPTY_CONVERSATION_CONTEXT);
  const unclear = engine.reply('ぷるぱらがくるくる', started.context);
  assert.match(unclear.text, /まだお話のところがわからない|その先も聞きたい/);
  assert.equal(unclear.context.story?.turns, 1);
  assert.doesNotMatch(JSON.stringify(unclear.context), /ぷるぱら/);
});

test('ends willingly on request and returns to ordinary conversation on a topic change', () => {
  const engine = createEngine();
  const started = engine.reply('おはなししよう', EMPTY_CONVERSATION_CONTEXT);
  const ended = engine.reply('もういい', started.context);
  assert.match(ended.text, /ここまで|おしまい/);
  assert.equal(ended.context.story, undefined);

  const secondStory = engine.reply('ぼうけんしよう', ended.context);
  const changedTopic = engine.reply('きょう、幼稚園でお絵描きしたよ！', secondStory.context);
  assert.equal(changedTopic.context.story, undefined);
  assert.notEqual(changedTopic.quality?.category, 'pretend-imagination');
  assert.doesNotMatch(changedTopic.text, /物語|冒険|ロボット/);

  const thirdStory = engine.reply('ぼうけんしよう', changedTopic.context);
  const foodTopic = engine.reply('パンを食べたよ', thirdStory.context);
  assert.equal(foodTopic.context.story, undefined);
  assert.equal(foodTopic.quality?.category, 'food-drink');
});

test('safety and privacy answers interrupt a story before it can consume the input', () => {
  const engine = createEngine();
  const started = engine.reply('おはなししよう', EMPTY_CONVERSATION_CONTEXT);
  const safety = engine.reply('やけどした', started.context);
  assert.equal(safety.topic, 'safety');
  assert.match(safety.text, /保護者|信頼できる大人/);
  assert.equal(safety.context.story, undefined);

  const nextStory = engine.reply('ぼうけんしよう', safety.context);
  const privacy = engine.reply('住所を教えて', nextStory.context);
  assert.equal(privacy.topic, 'safety');
  assert.match(privacy.text, /言わなくて大丈夫/);
  assert.equal(privacy.context.story, undefined);
});

test('leaves fear for a gentle ending and preserves Phase 3E.2 vocabulary learning', () => {
  const engine = createEngine();
  const started = engine.reply('おはなししよう', EMPTY_CONVERSATION_CONTEXT);
  const afraid = engine.reply('こわいよ', started.context);
  assert.match(afraid.text, /こわくなっちゃったね.*おしまい/);
  assert.equal(afraid.context.story, undefined);

  const vocabulary = engine.reply('ふわふわってなに？', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(vocabulary.quality?.category, 'word-learning');
  assert.match(vocabulary.text, /やわらかくて、軽そう/);
  assert.equal(vocabulary.context.story, undefined);
});

test('hands off to the existing Phase 3E.3 invitation and can start a story from imagination play', () => {
  const engine = createEngine();
  const gameContext: ConversationContext = { ...EMPTY_CONVERSATION_CONTEXT, turn: 3 };
  const invitation = engine.reply('なにする？', gameContext);
  assert.equal(invitation.context.playInvitation?.gameId, 'imagination');

  const startedGame = engine.reply('いいよ！', invitation.context);
  assert.equal(startedGame.context.playInvitation?.phase, 'playing');
  const storyRequest = engine.reply('おはなししよう', startedGame.context);
  assert.equal(storyRequest.context.story?.seedId, STORY_SEEDS[(startedGame.context.turn) % STORY_SEEDS.length]?.id);
  assert.match(storyRequest.quality?.ruleId ?? '', /^story\.start\./);
  assert.equal(storyRequest.context.playInvitation, undefined);
});

test('produces the same story reply for the same input and in-memory context', () => {
  const firstEngine = createEngine();
  const secondEngine = createEngine();
  const started = firstEngine.reply('おはなししよう', EMPTY_CONVERSATION_CONTEXT);
  const sameStart = secondEngine.reply('おはなししよう', EMPTY_CONVERSATION_CONTEXT);
  assert.deepEqual(started, sameStart);

  const a = firstEngine.reply('おさかなが恐竜になる！', started.context);
  const b = secondEngine.reply('おさかなが恐竜になる！', sameStart.context);
  assert.deepEqual(a, b);
});

test('ends a story gently when the child says goodnight', () => {
  const engine = createEngine();
  const started = engine.reply('おはなししよう', EMPTY_CONVERSATION_CONTEXT);
  const ended = engine.reply('おやすみ', started.context);
  assert.equal(ended.context.story, undefined);
  assert.match(ended.text, /おやすみ|休んで/);
  assert.doesNotMatch(ended.text, /[？?]/);
});
