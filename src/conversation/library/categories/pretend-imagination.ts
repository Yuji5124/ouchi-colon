import { entity, entityRules } from '../pattern-builders.ts';
export const imaginationEntities = [
  entity('ドラゴン', ['どらごん', 'りゅう', '竜'], 'play', 'pretend-imagination'), entity('おひめさま', ['お姫さま', 'プリンセス'], 'play', 'pretend-imagination'),
  entity('ヒーロー', ['ひーろー', '戦隊'], 'play', 'pretend-imagination'), entity('宇宙船', ['うちゅうせん', 'ロケット'], 'play', 'pretend-imagination'),
  entity('魔法', ['まほう', '魔法使い'], 'play', 'pretend-imagination'), entity('おばけ', ['オバケ', 'お化け', 'モンスター'], 'play', 'pretend-imagination'),
];
export const imaginationRules = entityRules(imaginationEntities);
