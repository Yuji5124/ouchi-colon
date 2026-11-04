import type {MotorSettings,MotorStatus} from './protocol.ts';
import type {PowerRecord} from './diagnostics.ts';
/** User-authorized experimental test; this does not qualify or measure the supply. */
export function singleTestBlock(status:MotorStatus,settings:MotorSettings,power:PowerRecord,phase:number){
  if(!settings.singleTest)return status.singleTest?'本体単独版には「1.5V想定の単独試験」モードが必要です。':'';
  if(!status.singleTest)return '本体単独ファーム1.2へ書き換えて再接続してください。信号試験版では通電できません。';
  if(phase!==5)return '本体単独試験はPhase 5を選んでください。';
  if(settings.signalOnly||settings.frequency!==1000||settings.pulseMs<50||settings.pulseMs>100)return '単独試験は1000Hz・50〜100msです。';
  if(power.settingV!==1.5||(power.measuredV!==null&&(power.measuredV<=0||power.measuredV>1.5)))return '想定設定1.5Vと診断メモの値を確認してください。';
  if(power.heat==='present')return '発熱ありの記録です。モーター電源を切ってください。';
  return '';
}
