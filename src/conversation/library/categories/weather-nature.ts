import { entity, entityRules, phraseRule } from '../pattern-builders.ts';
export const weatherEntities = [
  entity('雨', ['あめ', 'あめふり'], 'weather', 'weather-nature'), entity('雪', ['ゆき'], 'weather', 'weather-nature'),
  entity('晴れ', ['はれ', 'おひさま', '太陽'], 'weather', 'weather-nature'), entity('風', ['かぜ'], 'weather', 'weather-nature'),
  entity('雲', ['くも'], 'weather', 'weather-nature'), entity('虹', ['にじ'], 'weather', 'weather-nature'),
];
export const weatherRules = [
  ...entityRules(weatherEntities),
  phraseRule('weather.season', 'weather-nature', 'report', ['春になった', '夏になった', '秋になった', '冬になった', 'あつい', '暑い', 'さむい', '寒い', 'あったかい', '冷たい'], {
    REACT: ['季節がかわってきたね！', 'あつかったり、さむかったりするね！'], ACKNOWLEDGE: ['今日はそんなお天気なんだね！'], IMAGINE: ['雨つぶが太鼓みたいに鳴ったらおもしろそう！'],
  }, 85),
];
