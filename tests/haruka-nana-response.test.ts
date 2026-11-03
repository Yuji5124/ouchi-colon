import assert from 'node:assert/strict';
import test from 'node:test';
import { HarukaNanaResponseCatalog } from '../src/speech/haruka-nana-response.ts';

const dictionary = {
  entries: [
    {
      id: 'greeting.01.1', patterns: ['おはよう', 'おはようコロン'], priority: 50,
      safety_sensitive: false, session_action: 'set_current_topic',
      responses: [
        { id: 'r1', text: '会えてうれしいな。', role: 'acknowledge', asks_question: false },
        { id: 'r2', text: 'すてきな朝だね！', role: 'encourage', asks_question: false },
        { id: 'r3', text: '今日は何をしようか？', role: 'imagine', asks_question: false },
        { id: 'r4', text: 'よく眠れた？', role: 'ask', asks_question: true },
        { id: 'r5', text: 'またお話ししようね。', role: 'close', asks_question: false },
        { id: 'r6', text: 'それはかなしかったね。', role: 'empathize', asks_question: false },
        { id: 'r7', text: 'ゆっくり聞かせてね。', role: 'listen', asks_question: false },
      ],
    },
    {
      id: 'safety.01.1', patterns: ['けがをした'], priority: 100,
      safety_sensitive: true, session_action: 'route_to_safety',
      responses: [{ id: 'r1', text: '大人に知らせよう。', role: 'safety_support', asks_question: false }],
    },
  ],
};

function createCatalog(): { catalog: HarukaNanaResponseCatalog; fetchCount: () => number } {
  let fetchCount = 0;
  const manifest = [
    ...dictionary.entries.flatMap((entry) => entry.responses.map((response, index) => ({
      id: `${entry.id}.${response.id}`,
      file: `wav/${String(index + 1).padStart(4, '0')}.wav`,
    }))),
  ];
  const fetcher: typeof fetch = async (input) => {
    fetchCount += 1;
    if (String(input) === '/assets/dictionary.json') return new Response(JSON.stringify(dictionary));
    if (String(input) === '/voice/haruka-nana/manifest.jsonl') {
      return new Response(manifest.map((entry) => JSON.stringify(entry)).join('\n'));
    }
    return new Response('', { status: 404 });
  };
  return {
    catalog: new HarukaNanaResponseCatalog('/assets/dictionary.json', '/voice/haruka-nana/', fetcher),
    fetchCount: () => fetchCount,
  };
}

test('selects an exact dictionary response whose role fits Colon’s joy reaction', async () => {
  const { catalog } = createCatalog();
  const reply = await catalog.select('おはよう！', 'JOY', [], false, false, 0);
  assert.ok(reply);
  assert.equal(reply.role, 'encourage');
  assert.equal(reply.text, 'すてきな朝だね！');
  assert.equal(reply.audioUrl, '/voice/haruka-nana/wav/0002.wav');
});

test('does not choose an unrelated or question role when it does not fit the reaction', async () => {
  const { catalog } = createCatalog();
  const sad = await catalog.select('おはよう', 'SAD', [], false, false, 0);
  const thinking = await catalog.select('おはよう', 'THINKING', [], false, false, 0);
  assert.equal(sad?.role, 'empathize');
  assert.equal(thinking?.role, 'listen');
});

test('avoids the most recent response and selects a closing line without a question', async () => {
  const { catalog } = createCatalog();
  const varied = await catalog.select('おはよう', 'JOY', ['greeting.01.1.r2'], false, false, 0);
  const closing = await catalog.select('おはよう', 'NORMAL', [], false, true, 3);
  assert.equal(varied?.id, 'greeting.01.1.r3');
  assert.equal(closing?.role, 'close');
});

test('never selects dictionary entries marked for safety routing', async () => {
  const { catalog } = createCatalog();
  assert.equal(await catalog.select('けがをした', 'SAD', [], false, false, 0), null);
});

test('repeatedly resolves matching speech and reaction roles across 1,000 cases', async () => {
  const { catalog, fetchCount } = createCatalog();
  const allowed = new Set(['acknowledge', 'encourage', 'imagine']);
  for (let index = 0; index < 1000; index += 1) {
    const reply = await catalog.select('おはようコロン', 'JOY', [], false, false, index);
    assert.ok(reply, `case ${index + 1} should resolve`);
    assert.ok(allowed.has(reply.role), `case ${index + 1} selected ${reply.role}`);
    assert.ok(reply.audioUrl.startsWith('/voice/haruka-nana/wav/'));
  }
  assert.equal(fetchCount(), 2, 'dictionary and manifest are loaded once, then reused in memory');
});

test('bundled production dictionary selects matching WAV text without any dictionary network request', async () => {
  const { readFile } = await import('node:fs/promises');
  const dictionary = JSON.parse(await readFile(new URL('../src/data/language-dictionary-500.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('../src/data/haruka-nana-manifest.json', import.meta.url), 'utf8'));
  const fullManifest = (await readFile(new URL('../public/voice/haruka-nana/manifest.jsonl', import.meta.url), 'utf8')).trim().split(/\r?\n/).map(row => JSON.parse(row));
  const byId = new Map(fullManifest.map(row => [row.id, row]));
  const noNetwork = (() => { throw new Error('dictionary must be bundled'); }) as typeof fetch;
  const catalog = new HarukaNanaResponseCatalog(dictionary, '/voice/', noNetwork, manifest);
  const bedtime = await catalog.select('おやすみ', 'SLEEPY', [], false, true, 0);
  assert.equal(bedtime?.text, 'おやすみ。ゆっくり休んでね。');
  assert.equal(bedtime?.audioUrl, '/voice/wav/0071.wav');
  for (const entry of dictionary.entries) {
    for (const response of entry.responses) {
      const id = `${entry.id}.${response.id}`;
      assert.equal(byId.get(id)?.text, response.text, `WAV metadata must match displayed text: ${id}`);
      assert.equal(manifest.find(row => row.id === id)?.file, byId.get(id)?.file, id);
    }
    const selected = await catalog.select(entry.patterns[0], 'NORMAL', [], true, entry.session_action === 'end_conversation', 0);
    if (entry.safety_sensitive || entry.session_action === 'route_to_safety') {
      assert.equal(selected, null);
    } else {
      assert.ok(selected, entry.id);
      assert.equal(selected.text, byId.get(selected.id)?.text, selected.id);
      assert.equal(selected.audioUrl, '/voice/' + byId.get(selected.id)?.file, selected.id);
    }
  }
});
