import { entity, entityRules } from '../pattern-builders.ts';
export const animalEntities = [
  entity('ねこ', ['猫', 'にゃんこ', 'にゃんにゃん'], 'animals', 'animals-insects'), entity('いぬ', ['犬', 'わんわん', 'わんこ'], 'animals', 'animals-insects'),
  entity('うさぎ', ['兎', 'うさちゃん'], 'animals', 'animals-insects'), entity('くま', ['熊', 'くまさん'], 'animals', 'animals-insects'),
  entity('ぞう', ['象', 'ぞうさん'], 'animals', 'animals-insects'), entity('きりん', ['麒麟'], 'animals', 'animals-insects'),
  entity('恐竜', ['きょうりゅう', 'きょーりゅー'], 'animals', 'animals-insects'), entity('鳥', ['とり', 'ことり', '小鳥'], 'animals', 'animals-insects'),
  entity('魚', ['さかな', 'おさかな'], 'animals', 'animals-insects'), entity('虫', ['むし', 'てんとう虫', 'ちょうちょ', '蝶', 'アリ', 'あり'], 'animals', 'animals-insects'),
  entity('クモ', ['蜘蛛', 'くも'], 'animals', 'animals-insects'), entity('クモの巣', ['蜘蛛の巣', 'くものす'], 'animals', 'animals-insects'),
];
export const animalRules = entityRules(animalEntities);
