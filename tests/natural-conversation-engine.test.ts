import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_CONVERSATION_CONTEXT, replyWithFallback, type ConversationContext } from '../src/conversation/conversation-engine.ts';
import { NaturalConversationEngine } from '../src/conversation/natural-conversation-engine.ts';

test('recognizes concrete subjects, actions, and features instead of asking a generic follow-up', () => {
  const engine = new NaturalConversationEngine();
  const examples = [
    ['赤い電車を見たよ', '電車', '見た', '赤い'],
    ['クモの巣を見つけた', 'クモの巣', '見つけた', null],
    ['りんごを食べた', 'りんご', '食べた', null],
    ['ねこと遊んだ', 'ねこ', '遊んだ', null],
    ['ブロックでお城を作った', 'お城', '作った', null],
    ['青いボールを見た', 'ボール', '見た', '青い'],
  ];
  for (const [input, subject, action, feature] of examples) {
    const result = engine.reply(input, EMPTY_CONVERSATION_CONTEXT);
    assert.equal(result.context.subject, subject, input);
    assert.equal(result.context.action, action, input);
    assert.equal(result.context.feature, feature, input);
    assert.ok(result.text.length > 0);
  }
  const train = engine.reply('赤い電車を見たよ', EMPTY_CONVERSATION_CONTEXT);
  assert.match(train.text, /赤い電車/);
  assert.doesNotMatch(train.text, /どんな電車だった/);
});

test('covers 24 short child utterances across intent and topic categories', () => {
  const engine = new NaturalConversationEngine();
  const cases: Array<[string, string]> = [
    ['こんにちは', 'greeting'], ['電車が走ってた', 'report'], ['クモの巣を見つけた', 'report'],
    ['黄色い虫がいた', 'report'], ['りんごを食べた', 'report'], ['ブロックで遊んだ', 'report'],
    ['パンを食べたよ', 'report'], ['青いボールを見た', 'report'], ['お城を作った', 'report'],
    ['鳥を見つけた', 'report'], ['うれしかった', 'emotion'], ['こわい', 'emotion'],
    ['かなしい', 'emotion'], ['うん', 'short-answer'], ['いや', 'refusal'],
    ['もう一回', 'repeat'], ['コロンも乗る？', 'question'], ['歌って', 'request'],
    ['何して遊んだの？', 'question'], ['ちがう！お城！', 'correction'], ['大きかった', 'report'],
    ['ぷるぱら', 'unknown'], ['今日幼稚園で遊んだ', 'report'], ['あ、そうじゃなくて', 'correction'],
  ];
  for (const [input, expectedIntent] of cases) {
    const result = engine.reply(input, EMPTY_CONVERSATION_CONTEXT);
    assert.equal(result.quality?.intent, expectedIntent, input);
    assert.ok(result.text.length > 0, input);
  }
});

test('connects discovery, size, short confirmation, and correction without restoring a stale subject', () => {
  const engine = new NaturalConversationEngine();
  const web = engine.reply('クモの巣を見つけた！', EMPTY_CONVERSATION_CONTEXT);
  assert.match(web.text, /クモのおうち/);
  const big = engine.reply('大きかった！', web.context);
  assert.match(big.text, /大きいの|大きかった/);
  assert.equal(big.context.subject, 'クモの巣');
  const yes = engine.reply('うん！', big.context);
  assert.ok(yes.quality?.contextUsed);
  const blocks = engine.reply('ブロックで遊んだ', EMPTY_CONVERSATION_CONTEXT);
  const correction = engine.reply('ちがう！お城！', blocks.context);
  assert.equal(correction.context.subject, 'お城');
  assert.doesNotMatch(correction.text, /ブロック/);
  const vagueCorrection = engine.reply('ちがう', blocks.context);
  assert.equal(vagueCorrection.quality?.intent, 'correction');
  assert.equal(vagueCorrection.context.subject, null);
  assert.match(vagueCorrection.text, /ほんとは何だった/);

  const train = engine.reply('電車を見たよ', EMPTY_CONVERSATION_CONTEXT);
  const correctedSubject = engine.reply('ちがう、電車じゃなくてバス！', train.context);
  assert.equal(correctedSubject.context.subject, 'バス');
  assert.match(correctedSubject.text, /バスだった/);
  assert.doesNotMatch(correctedSubject.text, /電車/);

  const actuallyCorrection = engine.reply('本当はバス！', train.context);
  assert.equal(actuallyCorrection.context.subject, 'バス');
  assert.match(actuallyCorrection.text, /バスだった/);
});

test('moves to a new topic without carrying the previous subject forward', () => {
  const engine = new NaturalConversationEngine();
  const train = engine.reply('赤い電車を見たよ', EMPTY_CONVERSATION_CONTEXT);
  const apple = engine.reply('りんごを食べたよ', train.context);
  assert.equal(apple.context.subject, 'りんご');
  assert.equal(apple.context.topic, 'food');
  assert.doesNotMatch(apple.text, /電車/);
});

test('respects a child ending and clears the active conversation topic', () => {
  const engine = new NaturalConversationEngine();
  const started = engine.reply('赤い電車を見たよ', EMPTY_CONVERSATION_CONTEXT);
  const ended = engine.reply('もういい', started.context);
  assert.equal(ended.quality?.intent, 'farewell');
  assert.match(ended.text, /ここでおしまい/);
  assert.doesNotMatch(ended.text, /[？?]/);
  assert.equal(ended.context.topic, null);
  assert.equal(ended.context.subject, null);
  assert.equal(ended.context.lastReplyWasQuestion, false);
});

test('uses the previous prompt to interpret short activity and object answers', () => {
  const engine = new NaturalConversationEngine();
  const activityPrompt: ConversationContext = { ...EMPTY_CONVERSATION_CONTEXT, topic: 'play', assistantQuestionFocus: 'activity', lastReplyWasQuestion: true };
  const answer = engine.reply('ブロック！', activityPrompt);
  assert.equal(answer.context.subject, 'ブロック');
  assert.match(answer.text, /ブロックで遊んだ|ブロック！/);
  const askedWhatMade = engine.reply('何を作ったの？', answer.context);
  const house = engine.reply('おうち！', askedWhatMade.context);
  assert.equal(house.context.subject, 'おうち');
  assert.equal(house.context.action, '作った');
});

test('answers a child question about the shared topic instead of asking another question', () => {
  const engine = new NaturalConversationEngine();
  const train = engine.reply('電車が走ってた！', EMPTY_CONVERSATION_CONTEXT);
  const question = engine.reply('コロンも乗る？', train.context);
  assert.equal(question.quality?.intent, 'question');
  assert.equal(question.quality?.replyType, 'SHARE');
  assert.match(question.text, /乗りたい|窓から景色/);
  assert.doesNotMatch(question.text, /[？?]/);
});

test('keeps question rate modest over ten concrete turns and avoids long question streaks', () => {
  const engine = new NaturalConversationEngine();
  const prompts = [
    '赤い電車を見た', 'クモの巣を見つけた', 'りんごを食べた', 'ブロックで遊んだ', 'ねこを見た',
    '青いボールがあった', 'パンを食べた', '大きな恐竜を見た', 'お城を作った', '黄色い電車を見た',
  ];
  let context: ConversationContext = { ...EMPTY_CONVERSATION_CONTEXT };
  const results = prompts.map((prompt) => {
    const result = engine.reply(prompt, context);
    context = result.context;
    return result;
  });
  const questionCount = results.filter((result) => result.quality?.replyType === 'QUESTION').length;
  assert.ok(questionCount <= 3, `questions=${questionCount}`);
  assert.ok(results.every((result) => result.quality?.questionRate !== undefined));
  assert.ok(!results.some((_, index) => results.slice(index, index + 3).every((item) => item.quality?.replyType === 'QUESTION')));
});

test('varies clarification for unknown words and has deterministic output for identical context', () => {
  const engine = new NaturalConversationEngine();
  let context: ConversationContext = { ...EMPTY_CONVERSATION_CONTEXT };
  const unknownReplies: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    const result = engine.reply('ぷるぱら！', context);
    context = result.context;
    unknownReplies.push(result.text);
  }
  assert.ok(new Set(unknownReplies).size >= 4);
  const sameA = engine.reply('赤い電車を見た', EMPTY_CONVERSATION_CONTEXT);
  const sameB = engine.reply('赤い電車を見た', EMPTY_CONVERSATION_CONTEXT);
  assert.deepEqual(sameA, sameB);
});

test('does not repeat identical replies when a child repeats the same short story', () => {
  const engine = new NaturalConversationEngine();
  let context: ConversationContext = { ...EMPTY_CONVERSATION_CONTEXT };
  const replies: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    const result = engine.reply('赤い電車を見た', context);
    context = result.context;
    replies.push(result.text);
  }
  assert.ok(replies.every((reply, index) => index === 0 || reply !== replies[index - 1]), replies.join(' / '));
});

test('preserves safety and privacy handling without storing the input text', () => {
  const engine = new NaturalConversationEngine();
  const danger = engine.reply('やけどした', EMPTY_CONVERSATION_CONTEXT);
  const privateData = engine.reply('住所を教えて', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(danger.topic, 'safety');
  assert.match(danger.text, /保護者|信頼できる大人/);
  assert.match(privateData.text, /言わなくて大丈夫/);
  assert.doesNotMatch(JSON.stringify(privateData.context), /住所/);
});

test('quality memory retains only bounded reply identifiers and session annotations', () => {
  const engine = new NaturalConversationEngine();
  let context: ConversationContext = { ...EMPTY_CONVERSATION_CONTEXT };
  for (let index = 0; index < 14; index += 1) context = engine.reply(`電車を見た ${index}`, context).context;
  assert.ok((context.recentReplyTypes?.length ?? 0) <= 10);
  assert.ok((context.recentReplyIds?.length ?? 0) <= 10);
  assert.deepEqual(Object.keys(context).sort(), [
    'action', 'assistantQuestionFocus', 'category', 'feature', 'intent', 'lastReplyWasQuestion', 'recentReplyIds',
    'recentReplyTypes', 'subject', 'topic', 'turn',
  ]);
  assert.doesNotMatch(JSON.stringify(context), /電車を見た/);
});

test('conversation exceptions return a safe reply so the caller can continue the voice turn', () => {
  const throwingEngine = { reply: () => { throw new Error('rule failure'); } };
  const safe = replyWithFallback(throwingEngine, '電車', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(safe.failed, true);
  assert.match(safe.result.text, /コロン.*考え中/);
  assert.equal(safe.result.quality?.fallback, true);
  assert.equal(safe.result.context.turn, 1);
});
