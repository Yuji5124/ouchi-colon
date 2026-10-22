import type { ConversationIntent, ConversationTopic, ReplyType } from '../conversation-engine.ts';

export type ConversationCategory =
  | 'greeting-farewell' | 'food-drink' | 'play-toys' | 'animals-insects'
  | 'family-friends' | 'nursery-daily' | 'feelings' | 'weather-nature'
  | 'body-health' | 'pretend-imagination' | 'why-questions' | 'about-colon'
  | 'safety' | 'unknown';

export type LibraryIntent = ConversationIntent | 'preference' | 'preference-negative' | 'wish' | 'proposal' | 'farewell';
export type ContextRequirement = 'subject' | 'topic' | 'previous-question';

export interface EntityLexicon {
  canonical: string;
  aliases: readonly string[];
  topic: ConversationTopic;
  category: ConversationCategory;
}

export interface ConversationLibraryEntry {
  id: string;
  category: ConversationCategory;
  intent: LibraryIntent;
  utterancePatterns: readonly RegExp[];
  responseCandidates: Partial<Record<ReplyType, readonly string[]>>;
  contextRequirements: readonly ContextRequirement[];
  priority: number;
}
