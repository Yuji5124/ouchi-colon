import {validatePower,type PowerRecord} from './diagnostics.ts';

/** These are operator measurements. AtomS3 has no VM/current feedback. */
export function bootPowerBlock(power:PowerRecord,dirty:boolean):string {
  if(dirty||!validatePower(power)||power.measuredV===null){
    return '電源診断でドライバのVM–GND実測値と測定日時を記録してください。';
  }
  if(power.measuredV<1.5||power.measuredV>3){
    return 'FA-130RA-2270相当の起動試験は、VMの実測値1.5〜3.0Vが条件です。';
  }
  if(power.heat==='present'||power.outputAfterOff==='stopped'){
    return '発熱または電源停止の記録があります。原因を確認してください。';
  }
  return '';
}
