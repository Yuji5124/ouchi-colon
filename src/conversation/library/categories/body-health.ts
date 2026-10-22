import { entity, entityRules, phraseRule } from '../pattern-builders.ts';
export const bodyEntities = [
  entity('おなか', ['お腹', 'はら'], 'daily', 'body-health'), entity('あたま', ['頭'], 'daily', 'body-health'),
  entity('歯', ['は', 'はっぱ'], 'daily', 'body-health'), entity('手', ['て'], 'daily', 'body-health'),
  entity('足', ['あし', 'あんよ'], 'daily', 'body-health'), entity('目', ['め'], 'daily', 'body-health'),
  entity('お熱', ['おねつ', '熱', 'ねつ'], 'daily', 'body-health'), entity('トイレ', ['おしっこ', 'うんち'], 'daily', 'body-health'),
];
export const bodyRules = [
  ...entityRules(bodyEntities),
  phraseRule('body.discomfort', 'body-health', 'emotion', ['いたい', '痛い', 'いたかった', 'かゆい', '気持ち悪い', 'きもちわるい', '吐きそう', '血がでた', '血が出た', 'けがした', '怪我した'], {
    ACKNOWLEDGE: ['痛いんだね。すぐ近くの保護者に伝えてね。'], QUESTION: ['近くに保護者や先生はいる？すぐ伝えようね。'],
  }, 120),
  phraseRule('body.routine', 'body-health', 'report', ['はみがきした', '歯みがきした', 'てをあらった', '手を洗った', 'おふろはいった', 'お風呂入った', 'ねたよ', '寝たよ', 'おきたよ', '起きたよ'], {
    REACT: ['できたんだね！えらいね！'], ACKNOWLEDGE: ['毎日のこと、ちゃんとできたんだね！'], SHARE: ['コロンは歯みがきのお歌が気になるな！'],
  }, 90),
];
