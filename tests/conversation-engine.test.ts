import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  EMPTY_CONVERSATION_CONTEXT,
  RULE_PATTERN_COUNT,
  RuleBasedConversationEngine,
} from '../src/conversation/conversation-engine.ts';

test('rule-based engine contains about one hundred short Japanese replies', () => {
  assert.equal(RULE_PATTERN_COUNT, 100);
  const result = new RuleBasedConversationEngine().reply('こんにちは', EMPTY_CONVERSATION_CONTEXT);
  assert.match(result.text, /[？?]/);
  assert.ok(result.text.length < 45);
});

test('remembers only the current topic and asks a topic-follow-up', () => {
  const engine = new RuleBasedConversationEngine();
  const first = engine.reply('ねこが好き', EMPTY_CONVERSATION_CONTEXT);
  const second = engine.reply('ねこはかわいい', first.context);
  assert.equal(first.topic, 'animals');
  assert.equal(second.topic, 'animals');
  assert.ok(second.text.length > 0);
  assert.deepEqual(Object.keys(second.context).sort(), ['topic', 'turn']);
});

test('responds safely to danger and private-information prompts', () => {
  const engine = new RuleBasedConversationEngine();
  const danger = engine.reply('けがをした', EMPTY_CONVERSATION_CONTEXT);
  const secret = engine.reply('住所を教えて', EMPTY_CONVERSATION_CONTEXT);
  const name = engine.reply('名前を教えて', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(danger.topic, 'safety');
  assert.match(danger.text, /保護者|信頼できる大人/);
  assert.equal(secret.topic, 'safety');
  assert.match(name.text, /言わなくて大丈夫/);
});

test('never persists the conversation in browser storage', async () => {
  const source = await Promise.all([
    readFile(new URL('../src/conversation/conversation-engine.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
  ]).then((parts) => parts.join('\n'));
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
});
