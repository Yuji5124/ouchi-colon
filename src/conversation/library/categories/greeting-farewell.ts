import { phraseRule } from '../pattern-builders.ts';
export const greetingRules = [
  phraseRule('greeting.hello', 'greeting-farewell', 'greeting', [
    'こんにちは', 'こんちは', 'おはよう', 'おはよ', 'おはよー', 'こんばんは', 'こんばんわ', 'やっほ', 'やほ', 'おかえり', 'ただいま', 'はじめまして', 'きたよ', 'コロンいる', 'コロンこんにちは',
  ], { REACT: ['やっほー！会えてうれしいな！', 'こんにちは！コロン、わくわくしてきた！'], SHARE: ['来てくれてありがとう！コロンここにいるよ！'] }, 100),
  phraseRule('greeting.goodbye', 'greeting-farewell', 'farewell', [
    'ばいばい', 'バイバイ', 'またね', 'さようなら', 'じゃあね', 'おやすみ', 'ねるね', 'またあそぼ', 'またあとで', 'いってきます', 'いってらっしゃい', 'おしまい', 'もういくね', 'またお話しよう', 'またおはなししよう',
  ], { ACKNOWLEDGE: ['またお話ししようね！', 'ばいばい！またね！'], SHARE: ['お話しできてうれしかったよ。ゆっくり休んでね！'] }, 100),
];
