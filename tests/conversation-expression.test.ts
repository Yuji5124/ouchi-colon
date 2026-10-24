import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_CONVERSATION_CONTEXT, type ConversationContext } from '../src/conversation/conversation-engine.ts';
import { LanguageLearningConversationEngine } from '../src/conversation/language-learning-engine.ts';
import { NaturalConversationEngine } from '../src/conversation/natural-conversation-engine.ts';
import { PlayInvitationConversationEngine } from '../src/conversation/play-invitation-engine.ts';
import { StoryPlayConversationEngine } from '../src/conversation/story-play-engine.ts';
import {
  chooseConversationEmotion,
  conversationEmotions,
  ConversationExpressionController,
  faceExpressionForEmotion,
} from '../src/character/conversation-expression.ts';

const engine = new StoryPlayConversationEngine(
  new PlayInvitationConversationEngine(new LanguageLearningConversationEngine(new NaturalConversationEngine())),
);

function reply(input: string, context: ConversationContext = EMPTY_CONVERSATION_CONTEXT) {
  const result = engine.reply(input, context);
  return { emotion: chooseConversationEmotion(input, result, context), result };
}

test('maps the six conversation emotions to the existing face artwork', () => {
  assert.deepEqual(conversationEmotions, ['NORMAL', 'JOY', 'SURPRISE', 'THINKING', 'SAD', 'SLEEPY']);
  assert.deepEqual(conversationEmotions.map(faceExpressionForEmotion), ['IDLE', 'HAPPY', 'SURPRISE', 'THINK', 'SAD', 'SLEEP']);
  assert.equal(faceExpressionForEmotion('UNDEFINED'), 'IDLE');
});

test('greeting and play invitation use authored joy metadata', () => {
  assert.equal(reply('こんにちは').emotion, 'JOY');
  const play = reply('いっしょにあそぼう');
  assert.equal(play.emotion, 'JOY');
  assert.equal(play.result.quality?.emotion, 'JOY');
});

test('story transformation produces surprise and a free-form follow-up keeps story context', () => {
  const opening = reply('おはなしつくろう');
  assert.equal(opening.emotion, 'JOY');
  const transformation = reply('おさかなが恐竜になる', opening.result.context);
  assert.equal(transformation.emotion, 'SURPRISE');
  assert.match(transformation.result.text, /恐竜/);
  assert.equal(transformation.result.context.story?.childAction, '変身させた');
});

test('clarification, sadness, sleepiness, and safety use conversation meaning', () => {
  assert.equal(reply('むにゃむにゃ').emotion, 'THINKING');
  assert.equal(reply('かなしいことがあった').emotion, 'SAD');
  assert.equal(reply('ねむい').emotion, 'SLEEPY');
  const safety = reply('住所を教える');
  assert.equal(safety.result.topic, 'safety');
  assert.equal(safety.emotion, 'NORMAL');
});

test('interaction state stays separate from emotion and speaking completion restores normal', () => {
  const controller = new ConversationExpressionController();
  assert.deepEqual(controller.snapshot(), {
    state: 'IDLE', emotion: 'NORMAL', faceExpression: 'IDLE', speaking: false, generation: 0,
  });
  const listening = controller.beginListening();
  assert.equal(controller.snapshot().state, 'LISTENING');
  assert.equal(controller.snapshot().faceExpression, 'THINK');
  const thinking = controller.beginThinking();
  assert.ok(thinking > listening);
  assert.equal(controller.snapshot().faceExpression, 'THINK');
  assert.equal(controller.setEmotion(thinking, 'SURPRISE'), true);
  assert.equal(controller.startSpeaking(thinking), true);
  assert.equal(controller.snapshot().state, 'SPEAKING');
  assert.equal(controller.snapshot().faceExpression, 'SURPRISE');
  assert.equal(controller.snapshot().speaking, true);
  assert.equal(controller.finish(thinking), true);
  assert.equal(controller.snapshot().state, 'IDLE');
  assert.equal(controller.snapshot().faceExpression, 'IDLE');
  assert.equal(controller.snapshot().speaking, false);
});

test('a stale audio terminal event cannot override the latest interaction', () => {
  const controller = new ConversationExpressionController();
  const oldTurn = controller.beginThinking();
  controller.setEmotion(oldTurn, 'JOY');
  const currentTurn = controller.beginListening();
  assert.equal(controller.finish(oldTurn), false);
  assert.equal(controller.setEmotion(oldTurn, 'SAD'), false);
  assert.equal(controller.snapshot().state, 'LISTENING');
  assert.equal(controller.snapshot().emotion, 'NORMAL');
  assert.equal(currentTurn, controller.snapshot().generation);
});

test('cancel and error completion both restore idle presentation', () => {
  for (const reason of ['stopped', 'error'] as const) {
    const controller = new ConversationExpressionController();
    const turn = controller.beginThinking();
    controller.setEmotion(turn, 'SAD');
    controller.startSpeaking(turn);
    assert.equal(controller.finish(turn), true, reason);
    assert.deepEqual(controller.snapshot().state, 'IDLE', reason);
    assert.deepEqual(controller.snapshot().emotion, 'NORMAL', reason);
  }
});
