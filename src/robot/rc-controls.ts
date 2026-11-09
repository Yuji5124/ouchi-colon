export interface DriveControlState {
  rc: boolean; connected: boolean; estop: boolean; permitted: boolean; busy: boolean; held: boolean;
}

/** Keep the current press target enabled so touch capture survives a pending MOVE. */
export function driveButtonDisabled(state: DriveControlState): boolean {
  if (!state.rc || !state.connected || state.estop) return true;
  return !state.held && (!state.permitted || state.busy);
}

export function missingDriveChecks(checks: { wiring: boolean; switch: boolean; raised: boolean; current: boolean; ble: boolean; power: boolean }): string[] {
  return [!checks.wiring && '配線', !checks.switch && '物理スイッチ', !checks.raised && 'キャタピラを浮かせる',
    !checks.current && '電源・電流', checks.ble && !checks.power && '100%出力条件'].filter((s): s is string => Boolean(s));
}
