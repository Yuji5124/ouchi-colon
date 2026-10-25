import { entity, entityRules } from '../pattern-builders.ts';
export const playEntities = [
  entity('ブロック', ['積み木', 'つみき', 'レゴ'], 'play', 'play-toys'), entity('バス', ['ばす'], 'play', 'play-toys'), entity('消防車', ['しょうぼうしゃ', 'しょうぼう車'], 'play', 'play-toys'), entity('電車', ['でんしゃ', '新幹線', 'しんかんせん', '汽車'], 'things', 'play-toys'),
  entity('ボール', ['ぼーる'], 'play', 'play-toys'), entity('ぬいぐるみ', ['人形', 'お人形', 'おもちゃ'], 'play', 'play-toys'),
  entity('お城', ['城', 'しろ'], 'play', 'play-toys'), entity('おうち', ['お家', '家', 'いえ'], 'play', 'play-toys'),
  entity('お絵かき', ['絵', 'おえかき', 'お絵描き'], 'play', 'play-toys'), entity('かくれんぼ', ['おにごっこ', '鬼ごっこ'], 'play', 'play-toys'),
  entity('パズル', ['ぱずる'], 'play', 'play-toys'),
];
export const playRules = entityRules(playEntities);
