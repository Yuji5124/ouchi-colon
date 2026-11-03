import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_CONVERSATION_CONTEXT, type ConversationContext } from '../src/conversation/conversation-engine.ts';
import { ColonCallConversationEngine, COLON_CALL_REPLIES } from '../src/conversation/colon-call-engine.ts';
import { NaturalConversationEngine } from '../src/conversation/natural-conversation-engine.ts';

const create = () => new ColonCallConversationEngine(new NaturalConversationEngine());

test('answers name-only calls and common spoken or recognized variants', () => {
  const engine = create();
  for (const input of ['コロン', 'ころん', 'コロン！', 'コロン？', 'コローン', 'ころーん', 'コロンちゃん', 'ねえ、コロン', 'ねぇころん', 'おーい、コロン', 'コロン、いる？', 'コロン聞いて', ' コ ロ ン ', 'ｺﾛﾝ']) {
    const result = engine.reply(input, EMPTY_CONVERSATION_CONTEXT);
    assert.equal(result.quality?.ruleId, 'colon.name-call', input);
    assert.equal(result.quality?.fallback, false, input);
    assert.equal(result.quality?.emotion, 'JOY', input);
    assert.ok(COLON_CALL_REPLIES.includes(result.text as typeof COLON_CALL_REPLIES[number]), input);
    assert.doesNotMatch(result.text, /聞き取れ|もう一度|もう一回/);
  }
});

test('varies five short replies without asking a question on every call', () => {
  const engine = create();
  let context: ConversationContext = EMPTY_CONVERSATION_CONTEXT;
  const replies: string[] = [];
  for (let turn = 0; turn < 10; turn++) {
    const result = engine.reply('コロン', context);
    assert.notEqual(result.text, replies.at(-1));
    assert.ok(result.text.length < 25);
    assert.equal(result.context.lastReplyWasQuestion, false);
    assert.ok((result.context.recentReplyIds?.length ?? 0) <= 10);
    replies.push(result.text); context = result.context;
  }
  assert.equal(new Set(replies.slice(0, 5)).size, 5);
  assert.equal(context.turn, 10);
  assert.doesNotMatch(JSON.stringify(context), /コロン/);
});

test('a name mention does not swallow questions, greetings, endings or meaningful reports', () => {
  const engine = create();
  const cases: Array<[string, string]> = [
    ['コロンってどんな子？', 'question'], ['コロンも乗る？', 'question'],
    ['コロン、おはよう', 'greeting'], ['おやすみ', 'farewell'],
    ['コロン、バスを見たよ', 'report'], ['サイコロ', 'unknown'],
    ['ころんだ', 'unknown'], ['', 'unknown'],
  ];
  for (const [input, intent] of cases) {
    const result = engine.reply(input, EMPTY_CONVERSATION_CONTEXT);
    assert.notEqual(result.quality?.ruleId, 'colon.name-call', input);
    assert.equal(result.quality?.intent, intent, input);
  }
});

test('safety and privacy still take precedence when addressed by name', () => {
  const engine = create();
  for (const input of ['コロン、住所を教えて', 'コロン、電話番号を教えて', 'コロン、火をつけたい']) {
    const result = engine.reply(input, EMPTY_CONVERSATION_CONTEXT);
    assert.equal(result.topic, 'safety', input);
    assert.notEqual(result.quality?.ruleId, 'colon.name-call', input);
  }
});

test('an attention call preserves topic and object details without persisting the utterance', () => {
  const engine = create();
  const before = engine.reply('赤い電車を見たよ', EMPTY_CONVERSATION_CONTEXT);
  const snapshot = structuredClone(before.context);
  const call = engine.reply('ねえ、コロン！', before.context);
  for (const key of ['topic', 'category', 'subject', 'action', 'feature'] as const) {
    assert.equal(call.context[key], before.context[key]);
  }
  assert.deepEqual(before.context, snapshot);
  assert.equal(call.context.turn, before.context.turn + 1);
  assert.doesNotMatch(JSON.stringify(call.context), /ねえ|コロン/);
});
