import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_CONVERSATION_CONTEXT, type ConversationContext, type ConversationEngine } from '../src/conversation/conversation-engine.ts';
import { ImaginativePlayConversationEngine } from '../src/conversation/imaginative-play-engine.ts';
import { LanguageLearningConversationEngine } from '../src/conversation/language-learning-engine.ts';
import { NaturalConversationEngine } from '../src/conversation/natural-conversation-engine.ts';
import { PlayInvitationConversationEngine } from '../src/conversation/play-invitation-engine.ts';
import { StoryPlayConversationEngine } from '../src/conversation/story-play-engine.ts';

function productionConversation(): ConversationEngine {
  return new ImaginativePlayConversationEngine(
    new StoryPlayConversationEngine(
      new PlayInvitationConversationEngine(
        new LanguageLearningConversationEngine(new NaturalConversationEngine()),
      ),
    ),
  );
}

function say(engine: ConversationEngine, text: string, context: ConversationContext) {
  return engine.reply(text, context);
}

test('the production engine carries a child-discovered idea into evolving imaginative play', () => {
  const engine = productionConversation();
  let context = EMPTY_CONVERSATION_CONTEXT;
  const turns = ['遊びを見つけたい', 'いいよ', 'バス！', '宇宙！', '恐竜も乗る！', '屋根を大きくする！'];
  const replies: string[] = [];
  for (const turn of turns) {
    const result = say(engine, turn, context);
    replies.push(result.text);
    context = result.context;
  }

  assert.match(replies[0]!, /好きなものから/);
  assert.match(replies[1]!, /好きなものをひとつ教えて/);
  assert.match(replies[2]!, /どこに行くバス/);
  assert.match(replies[3]!, /お月さまに停まろう/);
  assert.match(replies[4]!, /恐竜の頭が屋根から出ちゃう/);
  assert.match(replies[5]!, /恐竜専用のバス/);
  assert.equal(context.playInvitation, undefined);
  assert.equal(context.imaginativePlay?.feature, '屋根');
  assert.doesNotMatch(JSON.stringify(context), /遊びを見つけたい|いいよ|バス！|宇宙！/);
});

test('ordinary reports stay ordinary while explicit requests can start play', () => {
  const engine = productionConversation();
  const report = say(engine, 'きょう幼稚園でバスを見たよ', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(report.context.imaginativePlay, undefined);
  assert.equal(report.context.playInvitation, undefined);
  assert.equal(report.context.story, undefined);

  const invitation = say(engine, 'あそぼう', EMPTY_CONVERSATION_CONTEXT);
  assert.equal(invitation.context.playInvitation?.phase, 'invited');
});

test('safety and privacy replies interrupt an active discovered play without retaining it', () => {
  const engine = productionConversation();
  const offer = say(engine, '遊びを見つけたい', EMPTY_CONVERSATION_CONTEXT);
  const accepted = say(engine, 'いいよ', offer.context);
  const play = say(engine, 'バス！', accepted.context);
  const safety = say(engine, '住所を教えて', play.context);

  assert.equal(safety.topic, 'safety');
  assert.match(safety.text, /言わなくて大丈夫/);
  assert.equal(safety.context.playInvitation, undefined);
  assert.equal(safety.context.imaginativePlay, undefined);
  assert.doesNotMatch(JSON.stringify(safety.context), /住所を教えて|バス！/);
});

test('the production engine starts and ends a story gently at bedtime', () => {
  const engine = productionConversation();
  const story = say(engine, 'お話ししよう', EMPTY_CONVERSATION_CONTEXT);
  assert.ok(story.context.story);

  const goodnight = say(engine, 'おやすみ', story.context);
  assert.match(goodnight.text, /おやすみ.*ゆっくり休んでね/);
  assert.equal(goodnight.context.story, undefined);
  assert.equal(goodnight.context.imaginativePlay, undefined);
  assert.equal(goodnight.context.playInvitation, undefined);
});
