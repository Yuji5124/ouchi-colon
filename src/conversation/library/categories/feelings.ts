import { phraseRule } from '../pattern-builders.ts';
const comfort = { ACKNOWLEDGE: ['そうだったんだね。話してくれてありがとう。', 'その気持ちを教えてくれてありがとう。'], SHARE: ['近くの保護者にもお話ししてね。コロンも聞いているよ。'] } as const;
export const feelingRules = [
  phraseRule('feelings.happy', 'feelings', 'emotion', ['うれし', '嬉し', 'たのし', '楽しい', 'やった', 'できた', 'にこにこ', 'わくわく', 'すき', '好き'], {
    REACT: ['やったね！うれしい気持ち、コロンにも伝わったよ！', 'わあ！にこにこな気分なんだね！'], ACKNOWLEDGE: ['うれしかったんだね！', '楽しい気持ちなんだね！'], SHARE: ['コロンもいっしょににこにこ！'], QUESTION: ['何がいちばんうれしかった？'],
  }, 95),
  phraseRule('feelings.sad-scared', 'feelings', 'emotion', ['かなしい', '悲し', 'さみしい', '寂し', 'こわ', '怖', 'いやだった', '泣いちゃ', 'ないちゃ', 'ひとりぼっち'], {
    ...comfort, REACT: ['そっか、こわかったね。', 'かなしい気持ちだったんだね。'], QUESTION: ['今、近くに保護者はいる？'],
  }, 110),
  phraseRule('feelings.angry-tired', 'feelings', 'emotion', ['おこった', '怒った', 'いらいら', 'つかれた', '疲れた', 'ねむい', '眠い', 'いやだ'], {
    ...comfort, ACKNOWLEDGE: ['そっか、つかれたんだね。少し休んでもいいよ。'], QUESTION: ['近くの大人に話せそう？'],
  }, 90),
];
