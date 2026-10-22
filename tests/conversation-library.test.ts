import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_CONVERSATION_CONTEXT } from '../src/conversation/conversation-engine.ts';
import { CONVERSATION_ENTITIES, CONVERSATION_LIBRARY, UTTERANCE_PATTERN_COUNT, findRuleConflicts } from '../src/conversation/library/index.ts';
import { NaturalConversationEngine } from '../src/conversation/natural-conversation-engine.ts';

test('provides twelve typed categories and between 300 and 500 generated utterance patterns', () => {
  const categories = new Set(CONVERSATION_LIBRARY.map((entry) => entry.category));
  assert.deepEqual([...categories].sort(), [
    'about-colon', 'animals-insects', 'body-health', 'family-friends', 'feelings', 'food-drink',
    'greeting-farewell', 'nursery-daily', 'play-toys', 'pretend-imagination', 'weather-nature', 'why-questions',
  ].sort());
  assert.ok(UTTERANCE_PATTERN_COUNT >= 300 && UTTERANCE_PATTERN_COUNT <= 500, `patterns=${UTTERANCE_PATTERN_COUNT}`);
  assert.ok(CONVERSATION_LIBRARY.every((entry) => entry.id && entry.utterancePatterns.length && entry.responseCandidates));
});

test('evaluates at least 100 age-appropriate utterance variants across entity categories', () => {
  const engine = new NaturalConversationEngine();
  const examples = CONVERSATION_ENTITIES.flatMap((entity) => {
    const names = [...new Set([entity.canonical, ...entity.aliases])].slice(0, 2);
    return names.flatMap((name) => [
      `${name}を見たよ`, `${name}がいた！`, `${name}すき！`, `${name}を見たいな`, `${name}を見た？`,
    ]);
  });
  assert.ok(examples.length >= 100, `examples=${examples.length}`);
  for (const phrase of examples) {
    const result = engine.reply(phrase, EMPTY_CONVERSATION_CONTEXT);
    assert.ok(result.text.length > 0, phrase);
    assert.ok(result.quality?.category && result.quality.category !== 'unknown', phrase);
  }
});

test('distinguishes report, preference, wish, question, dislike, and proposal for the same food', () => {
  const engine = new NaturalConversationEngine();
  const cases = [
    ['カレー食べた', 'report'], ['カレー好き', 'preference'], ['カレー食べたい', 'wish'],
    ['カレー食べた？', 'question'], ['カレー嫌い', 'preference-negative'], ['カレー作ろう', 'proposal'],
  ] as const;
  for (const [input, intent] of cases) assert.equal(engine.reply(input, EMPTY_CONVERSATION_CONTEXT).quality?.intent, intent, input);
  assert.match(engine.reply('カレー食べた', EMPTY_CONVERSATION_CONTEXT).text, /食べたんだね/);
  assert.match(engine.reply('カレー食べた？', EMPTY_CONVERSATION_CONTEXT).text, /コロンは食べない/);
  assert.match(engine.reply('カレー作ろう', EMPTY_CONVERSATION_CONTEXT).text, /お料理ごっこ/);
});

test('uses context for short replies, descriptions, and corrections without restoring the old subject', () => {
  const engine = new NaturalConversationEngine();
  const first = engine.reply('りんご食べた', EMPTY_CONVERSATION_CONTEXT);
  const color = engine.reply('赤いやつ！', first.context);
  assert.equal(color.context.subject, 'りんご');
  assert.match(color.text, /赤いりんご/);
  const large = engine.reply('大きかった', color.context);
  assert.equal(large.context.subject, 'りんご');
  const wrong = engine.reply('ブロックで遊んだ', EMPTY_CONVERSATION_CONTEXT);
  const corrected = engine.reply('ちがう、お城！', wrong.context);
  assert.equal(corrected.context.subject, 'お城');
  assert.doesNotMatch(corrected.text, /ブロック/);
  assert.equal(engine.reply('うん', first.context).quality?.intent, 'short-answer');
});

test('answers child questions, avoids repeating unknown fallback text, and handles safety disclosures', () => {
  const engine = new NaturalConversationEngine();
  const colonLike = engine.reply('コロン好き？', EMPTY_CONVERSATION_CONTEXT);
  assert.match(colonLike.text, /コロンもあなたとお話しするのが好き/);
  let context = EMPTY_CONVERSATION_CONTEXT;
  const unknownReplies = Array.from({ length: 5 }, () => {
    const result = engine.reply('ぷるぱら', context);
    context = result.context;
    return result.text;
  });
  assert.ok(new Set(unknownReplies).size > 1);
  const safety = engine.reply('おなか痛い', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(safety.quality?.category, 'safety');
  assert.match(safety.text, /保護者|信頼できる大人/);
});

test('reports rule collisions for probe utterances so overlapping categories can be reviewed', () => {
  const conflicts = findRuleConflicts(['くもを見た', 'コロンの好きな食べ物は？', '赤い電車を見た']);
  assert.ok(conflicts.length > 0);
  assert.ok(conflicts.every((conflict) => conflict.ruleIds.length > 1));
});
