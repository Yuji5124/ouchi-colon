import { entity, entityRules } from '../pattern-builders.ts';
export const dailyEntities = [
  entity('保育園', ['ほいくえん', '幼稚園', 'ようちえん'], 'daily', 'nursery-daily'), entity('給食', ['きゅうしょく', 'おひるごはん'], 'food', 'nursery-daily'),
  entity('お昼寝', ['おひるね', 'お昼ね'], 'bedtime', 'nursery-daily'), entity('お風呂', ['おふろ', 'おふろば'], 'daily', 'nursery-daily'),
  entity('お出かけ', ['おでかけ', 'お買い物', 'おかいもの'], 'daily', 'nursery-daily'), entity('お迎え', ['おむかえ'], 'daily', 'nursery-daily'),
  entity('お片づけ', ['おかたづけ', '片付け'], 'daily', 'nursery-daily'), entity('お手伝い', ['おてつだい'], 'daily', 'nursery-daily'),
];
export const dailyRules = entityRules(dailyEntities);
