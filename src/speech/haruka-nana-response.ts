export type HarukaNanaEmotion = 'NORMAL' | 'JOY' | 'SURPRISE' | 'THINKING' | 'SAD' | 'SLEEPY';
export type HarukaNanaRole = 'acknowledge' | 'reflect' | 'empathize' | 'encourage' | 'imagine' | 'invite' | 'ask' | 'reassure' | 'close' | 'safety_support' | 'practical_support' | 'character_color' | 'listen';

interface DictionaryResponse {
  id: string;
  text: string;
  role: HarukaNanaRole;
  asks_question: boolean;
}

interface DictionaryEntry {
  id: string;
  patterns: string[];
  priority: number;
  safety_sensitive: boolean;
  session_action: string;
  responses: DictionaryResponse[];
}

interface DictionaryDocument { entries: DictionaryEntry[] }
interface VoiceManifestEntry { id: string; file: string }

export interface HarukaNanaSelectedResponse {
  id: string;
  text: string;
  role: HarukaNanaRole;
  audioUrl: string;
}

const ROLE_PREFERENCE: Record<HarukaNanaEmotion, readonly HarukaNanaRole[]> = {
  JOY: ['encourage', 'imagine', 'acknowledge', 'character_color', 'invite', 'reflect'],
  SURPRISE: ['imagine', 'acknowledge', 'character_color', 'encourage', 'reflect'],
  SAD: ['empathize', 'reassure', 'listen', 'reflect', 'acknowledge'],
  THINKING: ['listen', 'reflect', 'reassure', 'ask', 'acknowledge'],
  SLEEPY: ['reassure', 'close', 'listen', 'acknowledge', 'reflect'],
  NORMAL: ['acknowledge', 'reflect', 'listen', 'character_color', 'invite', 'encourage'],
};

function normalizePhrase(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/[\s、。，．・!！?？]/g, '');
}

export class HarukaNanaResponseCatalog {
  private catalogPromise: Promise<{ entries: DictionaryEntry[]; audioById: Map<string, string> }> | null = null;
  private readonly dictionaryUrl: string;
  private readonly assetBaseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    dictionaryUrl: string,
    assetBaseUrl: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.dictionaryUrl = dictionaryUrl;
    this.assetBaseUrl = assetBaseUrl;
    this.fetcher = fetcher;
  }

  private load(): Promise<{ entries: DictionaryEntry[]; audioById: Map<string, string> }> {
    if (this.catalogPromise) return this.catalogPromise;
    this.catalogPromise = Promise.all([
      this.fetcher(this.dictionaryUrl).then((response) => {
        if (!response.ok) throw new Error('dictionary unavailable');
        return response.json() as Promise<DictionaryDocument>;
      }),
      this.fetcher(`${this.assetBaseUrl}manifest.jsonl`).then(async (response) => {
        if (!response.ok) throw new Error('voice manifest unavailable');
        const rows = (await response.text()).split(/\r?\n/).filter(Boolean);
        return rows.map((line) => JSON.parse(line) as VoiceManifestEntry);
      }),
    ]).then(([dictionary, manifest]) => ({
      entries: dictionary.entries,
      audioById: new Map(manifest.map((item) => [item.id, `${this.assetBaseUrl}${item.file}`] as const)),
    })).catch((error: unknown) => {
      this.catalogPromise = null;
      throw error;
    });
    return this.catalogPromise;
  }

  async select(
    input: string,
    emotion: HarukaNanaEmotion,
    recentReplyIds: readonly string[],
    allowQuestion: boolean,
    ending: boolean,
    turn: number,
  ): Promise<HarukaNanaSelectedResponse | null> {
    const normalized = normalizePhrase(input);
    if (!normalized) return null;
    try {
      const catalog = await this.load();
      const entries = catalog.entries.filter((entry) => !entry.safety_sensitive
        && entry.session_action !== 'route_to_safety'
        && entry.patterns.some((pattern) => normalizePhrase(pattern) === normalized))
        .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
      for (const entry of entries) {
        const roles: readonly HarukaNanaRole[] = ending ? ['close', 'acknowledge', 'listen'] : ROLE_PREFERENCE[emotion];
        const usable = entry.responses.filter((response) => response.role !== 'safety_support'
          && (allowQuestion || !response.asks_question));
        const preferred = usable.filter((response) => roles.includes(response.role));
        const ranked = [...(preferred.length ? preferred : usable)].sort((a, b) => {
          const aRank = roles.indexOf(a.role);
          const bRank = roles.indexOf(b.role);
          return (aRank < 0 ? roles.length : aRank) - (bRank < 0 ? roles.length : bRank)
            || a.id.localeCompare(b.id);
        });
        const unseen = ranked.filter((response) => !recentReplyIds.includes(`${entry.id}.${response.id}`));
        const choices = unseen.length ? unseen : ranked;
        if (!choices.length) continue;
        const response = choices[Math.abs(turn) % choices.length]!;
        const id = `${entry.id}.${response.id}`;
        const file = catalog.audioById.get(id);
        if (file) return { id, text: response.text, role: response.role, audioUrl: file };
      }
    } catch {
      return null;
    }
    return null;
  }
}
