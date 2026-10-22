import type { ConversationContext, ReplyType } from '../conversation-engine.ts';
import { animalEntities, animalRules } from './categories/animals-insects.ts';
import { colonRules } from './categories/about-colon.ts';
import { bodyEntities, bodyRules } from './categories/body-health.ts';
import { peopleEntities, peopleRules } from './categories/family-friends.ts';
import { feelingRules } from './categories/feelings.ts';
import { foodEntities, foodRules } from './categories/food-drink.ts';
import { greetingRules } from './categories/greeting-farewell.ts';
import { dailyEntities, dailyRules } from './categories/nursery-daily.ts';
import { playEntities, playRules } from './categories/play-toys.ts';
import { imaginationEntities, imaginationRules } from './categories/pretend-imagination.ts';
import { weatherEntities, weatherRules } from './categories/weather-nature.ts';
import { questionRules } from './categories/why-questions.ts';
import type { ConversationCategory, ConversationLibraryEntry, EntityLexicon, LibraryIntent } from './types.ts';
export { escapeRegex } from './pattern-builders.ts';

export type { ConversationCategory, ConversationLibraryEntry, EntityLexicon, LibraryIntent } from './types.ts';
export const CONVERSATION_ENTITIES: readonly EntityLexicon[] = [
  ...foodEntities, ...playEntities, ...animalEntities, ...peopleEntities, ...dailyEntities,
  ...weatherEntities, ...bodyEntities, ...imaginationEntities,
];

export const CONVERSATION_LIBRARY: readonly ConversationLibraryEntry[] = [
  ...greetingRules, ...foodRules, ...playRules, ...animalRules, ...peopleRules, ...dailyRules,
  ...feelingRules, ...weatherRules, ...bodyRules, ...imaginationRules, ...questionRules, ...colonRules,
];

export const UTTERANCE_PATTERN_COUNT = CONVERSATION_LIBRARY.reduce((sum, entry) => sum + entry.utterancePatterns.length, 0);

export interface LibraryMatch {
  entry: ConversationLibraryEntry | null;
  category: ConversationCategory | 'unknown';
  conflictRuleIds: string[];
  fallbackReason: string | null;
}

function contextAvailable(requirements: ConversationLibraryEntry['contextRequirements'], context: ConversationContext): boolean {
  return requirements.every((requirement) => requirement === 'subject' ? Boolean(context.subject)
    : requirement === 'topic' ? Boolean(context.topic)
      : Boolean(context.lastReplyWasQuestion));
}

function matches(entry: ConversationLibraryEntry, text: string): boolean {
  return entry.utterancePatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function intentMatches(entryIntent: LibraryIntent, intent: string): boolean {
  return entryIntent === intent || (intent === 'preference-negative' && entryIntent === 'preference');
}

export function matchConversationLibrary(input: string, intent: string, context: ConversationContext): LibraryMatch {
  const text = input.trim().replace(/[。！!？?]+$/g, '');
  const allMatches = CONVERSATION_LIBRARY.filter((entry) => matches(entry, text) && contextAvailable(entry.contextRequirements, context));
  const relevant = allMatches.filter((entry) => intentMatches(entry.intent, intent));
  const ordered = [...relevant].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  if (ordered.length) {
    const winner = ordered[0]!;
    const conflicts = ordered.filter((entry) => entry.priority === winner.priority && entry.category !== winner.category);
    const contextual = conflicts.find((entry) => categoryMatchesTopic(entry.category, context.topic));
    const selected = contextual ?? winner;
    return { entry: selected, category: selected.category, conflictRuleIds: conflicts.map((entry) => entry.id), fallbackReason: null };
  }
  const bestCategory = [...allMatches].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0];
  return {
    entry: null,
    category: bestCategory?.category ?? 'unknown',
    conflictRuleIds: [],
    fallbackReason: bestCategory ? 'category-matched-no-intent-rule' : 'no-library-pattern-matched',
  };
}

function categoryMatchesTopic(category: ConversationCategory, topic: ConversationContext['topic']): boolean {
  if (category === 'animals-insects') return topic === 'animals';
  if (category === 'food-drink') return topic === 'food';
  if (category === 'play-toys' || category === 'pretend-imagination') return topic === 'play';
  if (category === 'weather-nature') return topic === 'weather';
  return false;
}

/** Probe-based overlap check; reports multiple category matches instead of hiding the collision. */
export function findRuleConflicts(probes: readonly string[]): Array<{ input: string; ruleIds: string[] }> {
  const conflicts: Array<{ input: string; ruleIds: string[] }> = [];
  for (const input of probes) {
    const text = input.trim().replace(/[。！!？?]+$/g, '');
    const entries = CONVERSATION_LIBRARY.filter((entry) => matches(entry, text));
    const categories = new Set(entries.map((entry) => entry.category));
    if (categories.size > 1) conflicts.push({ input, ruleIds: entries.map((entry) => entry.id) });
  }
  return conflicts;
}

export function candidateFor(entry: ConversationLibraryEntry, replyType: ReplyType, turn: number, subject: string): string | null {
  const candidates = entry.responseCandidates[replyType];
  if (!candidates?.length) return null;
  return candidates[turn % candidates.length]!.replaceAll('{subject}', subject || 'それ');
}
