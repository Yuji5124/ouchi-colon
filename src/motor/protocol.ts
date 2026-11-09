export const MOTOR_PROTOCOL = 1;
export const MOTOR_PINS = [5, 6, 7, 8] as const;
export const HOLD_TIMEOUT_MS = 220;
export const LINK_TIMEOUT_MS = 1000;
export const REVERSAL_PAUSE_MS = 100;
export interface MotorSettings {
  leftPercent: number; rightPercent: number; invertLeft: boolean; invertRight: boolean;
  pwmHz: number; softStartMs: number; pulseMs: number;
}
export const DEFAULT_MOTOR_SETTINGS: MotorSettings = {
  leftPercent: 20, rightPercent: 20, invertLeft: false, invertRight: false,
  pwmHz: 1000, softStartMs: 100, pulseMs: 100,
};
export interface SafetyChecks {
  /** Explicit local acknowledgement for the separately verified legacy full-duty BLE setup. */
  legacyBlePowerReviewed?: boolean;
  wiring: boolean; physicalSwitch: boolean; raised: boolean; vmOff: boolean;
  voltageMeasured: boolean; currentReviewed: boolean;
}
export type MotorAction = 'ARM' | 'DISARM' | 'DRIVE' | 'HOLD' | 'HEARTBEAT' | 'STOP' | 'ESTOP' | 'RESET' | 'CONFIG';
export interface MotorCommand {
  type: MotorAction; seq: number; press?: number; left?: number; right?: number;
  settings?: MotorSettings; stage?: number; checks?: SafetyChecks; measuredMv?: number;
}
export interface MotorStatus {
  protocol: number; source: 'mock' | 'device'; firmware: string; bootId: string;
  bootCount: number; resetReason: string; uptimeMs: number; lastHeartbeatMs: number;
  connected: boolean; gpioReady: boolean; outputsEnabled: boolean; powerQualified: boolean;
  armed: boolean; estop: boolean; active: boolean; left: number; right: number;
  targetLeft: number; targetRight: number; stopReason: string; lastSeq: number;
  stage: number; settings: MotorSettings;
}
export function validPins(pins: readonly number[]): boolean {
  return pins.length === 4 && new Set(pins).size === 4 && pins.every(pin => MOTOR_PINS.includes(pin as typeof MOTOR_PINS[number]));
}
export function validateSettings(value: MotorSettings): void {
  const ranges: Array<[keyof MotorSettings, number, number]> = [
    ['leftPercent', 0, 100], ['rightPercent', 0, 100], ['pwmHz', 500, 20000],
    ['softStartMs', 50, 1000], ['pulseMs', 50, 500],
  ];
  if (!value || ranges.some(([key, min, max]) => !Number.isInteger(value[key]) || Number(value[key]) < min || Number(value[key]) > max)
    || typeof value.invertLeft !== 'boolean' || typeof value.invertRight !== 'boolean') throw new Error('invalid-settings');
}
export function validateStatus(value: unknown): MotorStatus {
  if (!value || typeof value !== 'object') throw new Error('invalid-status');
  const s = value as MotorStatus;
  validateSettings(s.settings);
  if (s.protocol !== MOTOR_PROTOCOL || !['mock', 'device'].includes(s.source)
    || ['firmware', 'bootId', 'resetReason', 'stopReason'].some(key => typeof s[key as keyof MotorStatus] !== 'string')
    || ['connected', 'gpioReady', 'outputsEnabled', 'powerQualified', 'armed', 'estop', 'active'].some(key => typeof s[key as keyof MotorStatus] !== 'boolean')
    || ['uptimeMs', 'lastHeartbeatMs', 'bootCount', 'lastSeq', 'stage'].some(key => !Number.isInteger(s[key as keyof MotorStatus]) || Number(s[key as keyof MotorStatus]) < 0)
    || [s.left, s.right, s.targetLeft, s.targetRight].some(n => !Number.isInteger(n) || Math.abs(n) > 100)) throw new Error('invalid-status');
  return s;
}
