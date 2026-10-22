import { entity, entityRules } from '../pattern-builders.ts';
export const foodEntities = [
  entity('りんご', ['林檎', 'りんごさん'], 'food', 'food-drink'), entity('バナナ', ['ばなな'], 'food', 'food-drink'),
  entity('いちご', ['苺', 'イチゴ'], 'food', 'food-drink'), entity('カレー', ['かれー'], 'food', 'food-drink'),
  entity('パン', ['ぱん'], 'food', 'food-drink'), entity('ケーキ', ['けーき'], 'food', 'food-drink'),
  entity('アイス', ['アイスクリーム'], 'food', 'food-drink'), entity('おにぎり', ['おむすび'], 'food', 'food-drink'),
  entity('牛乳', ['ぎゅうにゅう', 'ミルク'], 'food', 'food-drink'), entity('ジュース', ['じゅーす'], 'food', 'food-drink'),
  entity('野菜', ['やさい', 'にんじん', 'トマト', 'きゅうり'], 'food', 'food-drink'), entity('うどん', ['ラーメン', 'そば'], 'food', 'food-drink'),
];
export const foodRules = entityRules(foodEntities);
