import type { MotorSettings } from './protocol.ts';
export interface PowerNotes {
  settingV: number; measuredV: number | null; displayOffSeconds: number | null;
  outputAfterDisplayOff: 'unknown' | 'maintained' | 'stopped'; drivingPower: string; heat: 'unknown' | 'none' | 'present'; measuredAt: string;
}
export const INITIAL_POWER_NOTES: PowerNotes = { settingV: 1.5, measuredV: null, displayOffSeconds: null, outputAfterDisplayOff: 'unknown', drivingPower: '未確認', heat: 'unknown', measuredAt: '' };
export interface DiagnosticEntry {
  at: string; source: 'mock' | 'device' | 'manual'; phase: number; connection: boolean;
  uptimeMs: number | null; resetReason: string; operation: string; left: number; right: number;
  pwmHz: number; settings: MotorSettings; stopReason: string; power: PowerNotes; result: string; error: string;
}
export class MotorDiagnostics {
  readonly entries: DiagnosticEntry[] = [];
  add(entry: DiagnosticEntry): void {
    this.entries.push(structuredClone(entry));
    if (this.entries.length > 500) this.entries.splice(0, this.entries.length - 500);
  }
  json(): string {
    return JSON.stringify({ schema: 'colon-motor-test-1.0', sensors: { batteryInternalV: null, converterInputV: null, converterOutputV: null, motorCurrentA: null, lowLoadShutdown: null }, entries: this.entries }, null, 2);
  }
  csv(): string {
    const header = ['datetime', 'source', 'phase', 'connected', 'uptime_ms', 'reset_reason', 'operation', 'left_percent', 'right_percent', 'pwm_hz', 'left_setting_percent', 'right_setting_percent', 'invert_left', 'invert_right', 'soft_start_ms', 'pulse_ms', 'stop_reason', 'setting_v_user_configured', 'measured_v_user_reported', 'display_off_seconds_user_reported', 'output_after_display_off_user_reported', 'driving_power_user_reported', 'heat_user_reported', 'measurement_datetime_user_reported', 'result', 'error'];
    const cell = (v: unknown): string => {
      let s = v === null || v === undefined ? '' : String(v);
      if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    return '\uFEFF' + [header, ...this.entries.map(e => [e.at, e.source, e.phase, e.connection, e.uptimeMs, e.resetReason, e.operation, e.left, e.right, e.pwmHz, e.settings.leftPercent, e.settings.rightPercent, e.settings.invertLeft, e.settings.invertRight, e.settings.softStartMs, e.settings.pulseMs, e.stopReason, e.power.settingV, e.power.measuredV, e.power.displayOffSeconds, e.power.outputAfterDisplayOff, e.power.drivingPower, e.power.heat, e.power.measuredAt, e.result, e.error])].map(row => row.map(cell).join(',')).join('\r\n');
  }
}
export function validatePowerNotes(p: PowerNotes): void {
  if (![p.settingV, p.measuredV, p.displayOffSeconds].every(n => n === null || (Number.isFinite(n) && n >= 0))
    || p.settingV > 20 || (p.measuredV !== null && p.measuredV > 20) || p.drivingPower.length > 160
    || !['unknown', 'maintained', 'stopped'].includes(p.outputAfterDisplayOff) || !['unknown', 'none', 'present'].includes(p.heat)
    || (p.measuredAt && Number.isNaN(Date.parse(p.measuredAt)))) throw new Error('invalid-power-notes');
}
