import { phraseRule } from '../pattern-builders.ts';
export const questionRules = [
  phraseRule('questions.why', 'why-questions', 'question', ['なんで', '何で', 'どうして', 'なぜ', 'どうやったら', 'どうしたら', 'なんでなの', 'どうしてなの', 'なんでかな', 'なんでだろう'], {
    SHARE: ['いい質問だね！コロンもいっしょに考えてみるね。'], ACKNOWLEDGE: ['気になったんだね。'], IMAGINE: ['ふしぎだね！いっしょに想像してみよう！'], QUESTION: ['どんなことを考えたの？'],
  }, 105),
  phraseRule('questions.what-where-who', 'why-questions', 'question', ['なに？', '何？', 'なにかな', 'どこ？', 'どこかな', 'だれ？', '誰？', 'いつ？', 'どっち？', 'どんなの？', 'どうなるの？', 'いくつ？', 'どういうこと？', 'おしえて', '教えて'], {
    SHARE: ['うーん、コロンも考えてみるね。', 'いいところに気づいたね！'], ACKNOWLEDGE: ['知りたくなったんだね！'], QUESTION: ['どのことが気になったの？'],
  }, 92),
];
