import { entity, entityRules } from '../pattern-builders.ts';
export const peopleEntities = [
  entity('おかあさん', ['ママ', '母さん', 'お母さん'], 'daily', 'family-friends'), entity('おとうさん', ['パパ', '父さん', 'お父さん'], 'daily', 'family-friends'),
  entity('おばあちゃん', ['ばあば', 'おばあ'], 'daily', 'family-friends'), entity('おじいちゃん', ['じいじ', 'おじい'], 'daily', 'family-friends'),
  entity('おにいちゃん', ['兄ちゃん', 'お兄ちゃん'], 'daily', 'family-friends'), entity('おねえちゃん', ['姉ちゃん', 'お姉ちゃん'], 'daily', 'family-friends'),
  entity('弟', ['おとうと'], 'daily', 'family-friends'), entity('妹', ['いもうと'], 'daily', 'family-friends'),
  entity('お友だち', ['友達', 'ともだち', 'おともだち'], 'daily', 'family-friends'),
];
export const peopleRules = entityRules(peopleEntities);
