import { FACE_ASSET_PATHS } from '../character/face-renderer.ts';
export function bundleReferences(text: string, current: string): string[] {
  const links = new Set<string>();
  for (const regex of [/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g,
    /(?:from\s*|import\s*|import\s*\(\s*)["'](\.\/[^"']+\.(?:js|css))["']/g,
    /url\(["']?([^)'"\s]+)["']?\)/g]) {
    for (const match of text.matchAll(regex)) {
      const url = new URL(match[1]!, current);
      if (url.origin === new URL(current).origin) links.add(url.href);
    }
  }
  return [...links];
}
export async function cacheScreenResources(initial: string[], cache: Pick<Cache, 'put'>, fetcher: typeof fetch = fetch): Promise<number> {
  const pending = [...initial], visited = new Set<string>();
  while (pending.length) {
    const url = pending.shift()!; if (visited.has(url)) continue;
    if (visited.size >= 100) throw new Error('保存対象が多すぎます。更新後に再試行してください。');
    const response = await fetcher(url, { cache: 'reload', redirect: 'error' });
    if (!response.ok || response.type === 'opaque') throw new Error('画面データを保存できません。インターネット接続を確認してください。');
    visited.add(url); await cache.put(url, response.clone());
    if (/\.(html|js|css)(?:\?|$)/.test(url)) pending.push(...bundleReferences(await response.text(), url));
  }
  return visited.size;
}
export async function saveOfflineScreen(): Promise<number> {
  if (!('serviceWorker' in navigator) || !('caches' in window)) throw new Error('このブラウザーではオフライン保存APIを確認できません。オンラインでページを開いてください。');
  const registration = await new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('オフライン保存の準備を確認できません。ページを更新してください。')), 3000);
    navigator.serviceWorker.ready.then(value => { clearTimeout(timeout); resolve(value); }, error => { clearTimeout(timeout); reject(error); });
  });
  if (!registration.active) throw new Error('ページを再読み込みしてから保存してください。');
  const cacheName = await new Promise<string>((resolve, reject) => {
    const channel = new MessageChannel(), timeout = setTimeout(() => reject(new Error('保存の準備ができません。ページを更新してください。')), 3000);
    channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(event.data?.cache ?? ''); };
    registration.active!.postMessage({ type: 'GET_CACHE_VERSION' }, [channel.port2]);
  });
  if (cacheName !== 'ouchicolon-shell-ble-v35') throw new Error('新しい版へ更新してから保存してください。');
  const cache = await caches.open(cacheName);
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href;
  const base = new URL('.', manifest ?? location.href);
  const pending = [new URL('phone.html', base).href, new URL('manifest-phone.webmanifest', base).href,
    ...Object.values(FACE_ASSET_PATHS).map(path => new URL('assets/face/' + path, base).href)];
  return cacheScreenResources(pending, cache);
}
