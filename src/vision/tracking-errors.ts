export function cameraFailureMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'カメラ権限がありません。Safariのサイト設定をご確認ください。';
  if (name === 'NotFoundError') return '利用できる前面カメラが見つかりません。';
  if (name === 'NotReadableError') return 'カメラを起動できません。他のアプリが使用していないかご確認ください。';
  return error instanceof Error ? error.message : 'カメラを起動できませんでした。';
}

export function detectorFailureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `顔検出ライブラリ/モデルを読み込めませんでした（${detail}）。オンラインで再試行してください。`;
}
