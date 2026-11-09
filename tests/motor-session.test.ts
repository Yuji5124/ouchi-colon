import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {MotorSession} from '../src/motor/session.ts';
import {MockTransport} from '../src/motor/transport.ts';
import {INITIAL_SETTINGS,OPS} from '../src/motor/protocol.ts';
import {defaultPatterns} from '../src/motor/patterns.ts';

test('Session: BLE読出し120ms・書込み40msでもハートビートが許可を維持する',async()=>{
  const transport=new MockTransport(false,true),session=new MotorSession(transport);
  let now=0,reads=0;
  transport.now=()=>now;
  const read=transport.read.bind(transport),write=transport.write.bind(transport);
  transport.read=async()=>{now+=120;reads++;return read();};
  transport.write=async frame=>{now+=40;transport.core.tick(now);return write(frame);};
  await session.connect();
  try{
    await session.arm();
    assert.equal(session.status?.armed,true);
    for(let i=0;i<8;i++){
      const previousReads=reads;
      await session.heartbeat();
      assert.equal(reads,previousReads,'心拍の送信に読出しを挟まない');
      await session.poll();
      assert.equal(session.status?.armed,true);
    }
    const beforeMotionReads=reads;
    await session.send(OPS.MOVE,100,100);
    assert.equal(reads,beforeMotionReads+1,'移動は応答確認の読出し1回で送る');
    assert.equal(session.status?.armed,true);
    assert.equal(transport.core.state.left,100);
    assert.ok(session.lastHeartbeatAt,'本体の応答をポーリングで確認する');
    now+=350;
    await session.poll();
    assert.equal(session.status?.armed,false);
    assert.equal(session.status?.stopReason,'heartbeat-timeout');
  }finally{session.disconnect();}
});

test('Session: ハートビートを書いただけでは本体の応答時刻を更新しない',async()=>{
  const transport=new MockTransport(),session=new MotorSession(transport);
  await session.connect();
  try{
    const write=transport.write.bind(transport);
    transport.write=async frame=>{if(frame[1]!==OPS.HEARTBEAT)await write(frame);};
    await session.heartbeat();
    assert.equal(session.lastHeartbeatAt,null);
    await session.poll();
    assert.equal(session.lastHeartbeatAt,null,'本体が処理していない心拍を応答済みにしない');
    transport.write=write;
    await session.heartbeat();
    assert.equal(session.lastHeartbeatAt,null);
    await session.poll();
    assert.ok(session.lastHeartbeatAt);
  }finally{session.disconnect();}
});

function holdNextRead(transport:MockTransport){
  const original=transport.read.bind(transport);
  let release!:()=>void,hold=true,calls=0;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  transport.read=async()=>{calls++;if(hold){hold=false;await gate;}return original();};
  return {release,calls:()=>calls};
}

test('Session: 停止ボタンの連続押下で通信を切断しない',async()=>{
  const transport=new MockTransport(false,true),session=new MotorSession(transport);
  await session.connect();const gate=holdNextRead(transport);
  session.requestStop();session.requestStop();session.requestStop();gate.release();
  for(let i=0;i<20&&session.busy;i++)await nextTurn();
  assert.equal(session.connected,true);assert.equal(session.status?.stopReason,'operator-stop');
  session.disconnect();
});

test('Session: STOP待機中のESTOPを優先し、古いSTOPの取消で切断しない',async()=>{
  const transport=new MockTransport(false,true),session=new MotorSession(transport);
  await session.connect();const gate=holdNextRead(transport);
  session.requestStop();session.requestStop(true);gate.release();
  for(let i=0;i<20&&(session.busy||!session.status?.estop);i++)await nextTurn();
  assert.equal(session.connected,true);assert.equal(session.status?.estop,true);assert.equal(session.status?.left,0);
  session.disconnect();
});

test('Session: 3V直接操作はキー操作ごとに開始し、ハードウェア確認フラグを立てない',async()=>{
  const transport=new MockTransport(false,true),session=new MotorSession(transport),frames:Uint8Array[]=[];
  const write=transport.write.bind(transport);
  transport.write=async frame=>{frames.push(frame.slice());await write(frame);};
  await session.connect();
  session.settings={...INITIAL_SETTINGS,signalOnly:false,rcTest:true,directControl:true,pulseMs:500};
  try{
    assert.equal(transport.core.state.armed,false);
    await session.drive(100,100);
    assert.deepEqual([transport.core.state.left,transport.core.state.right],[100,100]);
    assert.deepEqual(frames.map(frame=>frame[1]),[OPS.MOVE]);
    assert.equal(frames[0][15],0);assert.equal(frames[0][16],4);
    assert.equal(transport.core.state.powerQualified,false);
    session.requestStop();
    await nextTurn();
    assert.equal(transport.core.state.armed,false);
    await session.drive(-100,-100);
    assert.deepEqual([transport.core.state.left,transport.core.state.right],[-100,-100]);
  }finally{session.disconnect();}
});

test('Session: 直接操作の準備中に離すと移動を送らず、緊急停止を保持する',async()=>{
  const transport=new MockTransport(false,true),session=new MotorSession(transport),ops:number[]=[];
  await session.connect();
  session.settings={...INITIAL_SETTINGS,signalOnly:false,rcTest:true,directControl:true};
  const write=transport.write.bind(transport);
  transport.write=async frame=>{ops.push(frame[1]);await write(frame);};
  try{
    const held=holdNextRead(transport),polling=session.poll(),motion=session.drive(100,100);
    session.requestStop(true);
    await assert.rejects(motion,/取り消/);
    held.release();await polling;
    await nextTurn();
    assert.deepEqual(ops,[OPS.ESTOP]);
    assert.equal(transport.core.state.estop,true);assert.equal(transport.core.state.left,0);
  }finally{session.disconnect();}
});

test('Session: 直接操作の前後パターンは保存値を確認して1秒で停止する',async()=>{
  const transport=new MockTransport(false,true),session=new MotorSession(transport);
  let now=0;transport.now=()=>now;
  await session.connect();
  now=1000;
  session.settings={...INITIAL_SETTINGS,signalOnly:false,rcTest:true,directControl:true};
  try{
    await session.runProgram('forward100',{speed:100,durationMs:1000});
    assert.equal(transport.core.state.left,100);
    for(const time of [1200,1450,1700,1950]){now=time;await session.heartbeat();}
    now=2000;await session.poll();
    assert.equal(session.status?.stopReason,'pulse-limit');assert.equal(session.status?.left,0);
    session.disconnect();await session.connect();
    assert.equal(transport.core.state.armed,false);
  }finally{session.disconnect();}
});

test('Session: 遅い定期読取り中も操作ボタンを無効にせず、次の通信枠でパターンを読める',async()=>{
  const transport=new MockTransport(),s=new MotorSession(transport);await s.connect();
  try{
    const held=holdNextRead(transport),poll=s.poll();
    assert.equal(s.busy,true);assert.equal(s.foregroundBusy,false);
    const reading=s.readPatternTable();assert.equal(s.foregroundBusy,true);
    await assert.rejects(s.readPatternTable(),/完了/);
    await s.poll();await s.heartbeat();assert.equal(held.calls(),1);
    held.release();await poll;
    assert.deepEqual(await reading,defaultPatterns());assert.equal(s.foregroundBusy,false);
  }finally{s.disconnect();}
});

test('Session: 12パターンの保存・読戻しの途中へ定期通信を割り込ませない',async()=>{
  const transport=new MockTransport(),s=new MotorSession(transport);await s.connect();
  const operations:number[]=[],write=transport.write.bind(transport),table=defaultPatterns();
  transport.write=async frame=>{operations.push(frame[1]);await s.poll();await s.heartbeat();await write(frame);};
  try{
    const result=await s.savePatternTable(table,count=>{if(count===1)table.forward25.durationMs=300;});
    assert.deepEqual(operations,Array(12).fill(OPS.SAVE_PATTERN));
    assert.equal(result.forward25.durationMs,200,'転送開始時のスナップショットを保存する');
    assert.equal(transport.core.state.armed,false);assert.equal(s.foregroundBusy,false);
  }finally{s.disconnect();}
});

test('Session: 待機中の許可要求を緊急停止で取消し、動作要求は待ち行列へ入れない',async()=>{
  const transport=new MockTransport(),s=new MotorSession(transport);await s.connect();
  const operations:number[]=[],write=transport.write.bind(transport);
  transport.write=async frame=>{operations.push(frame[1]);await write(frame);};
  try{
    const held=holdNextRead(transport),poll=s.poll(),arming=s.arm();
    await assert.rejects(s.send(OPS.MOVE,25,25),/送信していません/);
    s.requestStop(true);await assert.rejects(arming,/取り消し/);
    held.release();await poll;await nextTurn();
    assert.deepEqual(operations,[OPS.ESTOP]);assert.equal(transport.core.state.estop,true);
    assert.equal(transport.core.state.armed,false);
  }finally{s.disconnect();}
});

test('Session: パターン保存中も緊急停止を優先し、残りの書込みを再開しない',async()=>{
  const transport=new MockTransport(),s=new MotorSession(transport);await s.connect();
  const operations:number[]=[],write=transport.write.bind(transport);
  transport.write=async frame=>{operations.push(frame[1]);await write(frame);};
  try{
    await assert.rejects(s.savePatternTable(defaultPatterns(),count=>{if(count===1)s.requestStop(true);}),/取り消し/);
    await nextTurn();assert.deepEqual(operations,[OPS.SAVE_PATTERN,OPS.ESTOP]);
    assert.equal(transport.core.state.estop,true);assert.equal(s.foregroundBusy,false);
  }finally{s.disconnect();}
});

test('Session: 応答のないパターン読取りは切断し、処理中表示を解除する',async()=>{
  const transport=new MockTransport(),s=new MotorSession(transport);await s.connect();
  transport.readPatterns=()=>new Promise(()=>{});
  try{
    await assert.rejects(s.readPatternTable(),/通信応答なし/);
    assert.equal(s.connected,false);assert.equal(s.foregroundBusy,false);assert.equal(s.busy,false);
  }finally{s.disconnect();}
});

test('Session: 設定と許可の2コマンドを一続きで送り、その間の定期通信を抑止する',async()=>{
  const transport=new MockTransport(),s=new MotorSession(transport);await s.connect();
  transport.core.connect(-150);
  const operations:number[]=[],write=transport.write.bind(transport);
  transport.write=async frame=>{operations.push(frame[1]);await s.heartbeat();await s.poll();await write(frame);};
  try{
    await s.arm();assert.deepEqual(operations,[OPS.CONFIG,OPS.ARM]);
    assert.equal(s.status?.armed,true);assert.equal(s.status?.left,0);assert.equal(s.status?.right,0);
  }finally{s.disconnect();}
});

test('Session: 方向を押し続けると、定期読取り直後の通信枠で移動を送る',async()=>{
  const transport=new MockTransport();
  const session=new MotorSession(transport);
  await session.connect();
  try{
    transport.core.connect(-150);
    await session.arm();
    const held=holdNextRead(transport);
    const poll=session.poll();
    const motion=session.send(OPS.MOVE,50,-50);
    assert.equal(session.foregroundBusy,true);
    assert.equal(transport.core.state.stopReason,'armed');
    held.release();
    await poll;
    await motion;
    transport.core.tick(transport.now()+65);
    assert.equal(transport.core.state.left,50);
    assert.equal(transport.core.state.right,-50);
  }finally{session.disconnect();}
});

test('Session: 定期読取りの間に指を離すと、待機していた移動を一度も送らない',async()=>{
  const transport=new MockTransport();
  const session=new MotorSession(transport);
  await session.connect();
  try{
    transport.core.connect(-150);
    await session.arm();
    const writes:number[]=[];
    const write=transport.write.bind(transport);
    transport.write=async frame=>{writes.push(frame[1]);await write(frame);};
    const held=holdNextRead(transport);
    const poll=session.poll();
    const motion=session.send(OPS.MOVE,50,50);
    session.requestStop();
    await assert.rejects(motion,/取り消し/);
    held.release();
    await poll;
    await nextTurn();
    assert.deepEqual(writes,[OPS.STOP]);
    assert.equal(transport.core.state.armed,false);
  }finally{session.disconnect();}
});


test('Session: 初期状態の読取りが終わるまで定期通信を開始しない',async()=>{
 const transport=new MockTransport(false,true),s=new MotorSession(transport);
 const held=holdNextRead(transport),writes:number[]=[],write=transport.write.bind(transport);
 transport.write=async frame=>{writes.push(frame[1]);await write(frame);};
 try{const connecting=s.connect();await nextTurn();assert.equal(s.connected,false);assert.equal(s.status,null);
 await s.poll();await s.heartbeat();assert.equal(held.calls(),1);assert.deepEqual(writes,[]);
 held.release();await connecting;assert.equal(s.connected,true);assert.equal(s.foregroundBusy,false);assert.equal(s.status?.firmware,'colon-motor-1.8.0');
 }finally{s.disconnect();}
});
test('Session: 初期読取り中の切断を、遅い接続完了で上書きしない',async()=>{
 const transport=new MockTransport(false,true),s=new MotorSession(transport),held=holdNextRead(transport);
 const connecting=s.connect();await nextTurn();s.disconnect();held.release();await assert.rejects(connecting,/取り消し/);
 assert.equal(s.connected,false);assert.equal(s.status,null);assert.equal(s.foregroundBusy,false);
});
test('Session: STOPの受付が返らない場合は処理中を継続せず切断する',async()=>{
 const transport=new MockTransport(false,true),s=new MotorSession(transport);await s.connect();
 const read=transport.read.bind(transport);transport.read=async()=>{await new Promise(resolve=>setTimeout(resolve,220));return read();};
 transport.write=async()=>{};
 try{const started=performance.now();s.requestStop();await new Promise(resolve=>setTimeout(resolve,2500));
 assert.equal(s.connected,false);assert.equal(s.foregroundBusy,false);assert.equal(s.busy,false);assert.ok(performance.now()-started<3000);
 }finally{s.disconnect();}
});
