import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_CONVERSATION_CONTEXT, RuleBasedConversationEngine, type ConversationContext } from '../src/conversation/conversation-engine.ts';
import { LanguageLearningConversationEngine, LEARNING_WORDS } from '../src/conversation/language-learning-engine.ts';
import { NaturalConversationEngine } from '../src/conversation/natural-conversation-engine.ts';

test('starts with thirty locally authored words for familiar things, actions, feelings, and sound words', () => {
  assert.equal(LEARNING_WORDS.length, 30);
  assert.ok(LEARNING_WORDS.every(({ word, meaning, example }) => word && meaning.length < 80 && example.length < 80));
});

test('answers explicit word questions with short concrete meanings and only occasional follow-up questions', () => {
  const engine = new LanguageLearningConversationEngine(new NaturalConversationEngine());
  const first = engine.reply('水たまりってなに？', EMPTY_CONVERSATION_CONTEXT);
  assert.match(first.text, /雨のあとに、地面にできる水/);
  assert.match(first.text, /長ぐつ/);
  assert.doesNotMatch(first.text, /知ってた/);

  let context = first.context;
  const second = engine.reply('つぼみって何？', context);
  context = second.context;
  assert.match(second.text, /お花がひらく前/);
  assert.doesNotMatch(second.text, /知ってた/);

  const third = engine.reply('肉球とはなに？', context);
  assert.match(third.text, /足のうら/);
  assert.match(third.text, /知ってた/);

  const repeated = engine.reply('肉球って何？', third.context);
  assert.doesNotMatch(repeated.text, /知ってた/);
});

test('discovers expressive words inside an ordinary story without correcting the child', () => {
  const engine = new LanguageLearningConversationEngine(new NaturalConversationEngine());
  const result = engine.reply('うさぎがぴょんぴょん跳ねたよ！', EMPTY_CONVERSATION_CONTEXT);
  assert.match(result.text, /ぴょんぴょん.*跳ねる/);
  assert.match(result.quality?.ruleId ?? '', /^word-learning\.bounce$/);
  assert.doesNotMatch(result.text, /ちがう|まちがい|正しくは/);
});

test('does not invent an unknown meaning and does not continue learning after the child changes topic', () => {
  const engine = new LanguageLearningConversationEngine(new NaturalConversationEngine());
  const unknown = engine.reply('フラペチーノってなに？', EMPTY_CONVERSATION_CONTEXT);
  assert.match(unknown.text, /まだよく知らない/);
  assert.match(unknown.text, /どこで聞いた/);
  assert.doesNotMatch(unknown.text, /飲み物|コーヒー/);

  const discovered = engine.reply('水たまりでぴちゃぴちゃしたよ！', EMPTY_CONVERSATION_CONTEXT);
  const switched = engine.reply('ところで、ブロックで遊んだよ！', discovered.context);
  assert.doesNotMatch(switched.text, /ぴちゃぴちゃ|水たまり/);
  assert.notEqual(switched.quality?.category, 'word-learning');
});

test('does not mistake an ordinary word fragment for the vocabulary word 巣', () => {
  const engine = new LanguageLearningConversationEngine(new NaturalConversationEngine());
  const result = engine.reply('好きってなに？', EMPTY_CONVERSATION_CONTEXT);
  assert.doesNotMatch(result.text, /鳥や虫|鳥の巣/);
});

test('keeps the existing safety and privacy responses ahead of vocabulary handling', () => {
  const engine = new LanguageLearningConversationEngine(new NaturalConversationEngine());
  const safety = engine.reply('やけどってなに？', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(safety.topic, 'safety');
  assert.match(safety.text, /保護者|信頼できる大人/);
  assert.doesNotMatch(safety.text, /やけどはね/);

  const privacy = engine.reply('住所ってなに？', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(privacy.topic, 'safety');
  assert.match(privacy.text, /言わなくて大丈夫/);
});

test('does not persist introduced words or alter ordinary conversational replies', () => {
  const original = new NaturalConversationEngine();
  const wrapped = new LanguageLearningConversationEngine(original);
  const wordQuestion = wrapped.reply('ふわふわってなに？', EMPTY_CONVERSATION_CONTEXT);
  assert.match(wordQuestion.text, /やわらかくて、軽そう/);

  const ordinaryContext: ConversationContext = { ...EMPTY_CONVERSATION_CONTEXT };
  const ordinary = wrapped.reply('赤い電車を見たよ', ordinaryContext);
  const expected = new NaturalConversationEngine().reply('赤い電車を見たよ', ordinaryContext);
  assert.equal(ordinary.text, expected.text);
  assert.doesNotMatch(JSON.stringify(ordinary.context), /ふわふわ|word-learning/);
});

test('also wraps the legacy conversation engine without changing its ordinary replies', () => {
  const engine = new LanguageLearningConversationEngine(new RuleBasedConversationEngine());
  const ordinary = engine.reply('こんにちは', EMPTY_CONVERSATION_CONTEXT);
  assert.match(ordinary.text, /こんにちは/);
});
