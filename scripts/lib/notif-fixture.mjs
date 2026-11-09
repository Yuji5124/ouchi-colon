import http from 'node:http';
import {ACTION_PATTERN_IDS} from '../../src/motor/patterns.ts';
import {MockMotor} from '../../src/motor/mock.ts';
import {createMotorExtension} from '../../local-server/notif-extension.mjs';
export async function startNotifFixture(dist,latency={readMs:0,writeMs:0}){
 const core=new MockMotor(false,true,true,true),origin=performance.now(),now=()=>Math.floor(performance.now()-origin),ops=[],frames=[];
 const timer=setInterval(()=>core.tick(now()),5),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const worker={async request(op,payload={}){ops.push(op);if(op==='scan')return [{id:'test-atom',name:'Colon-Motor-Test（疑似）'}];if(op==='connect'){core.connect(now());return core.status(now());}if(op==='disconnect'){core.disconnect(now());return null;}if(op==='read'){await delay(latency.readMs);return core.status(now());}if(op==='patterns')return {version:7,slots:ACTION_PATTERN_IDS.map(id=>[core.patterns[id].speed,core.patterns[id].durationMs])};if(op==='write'){await delay(latency.writeMs);frames.push(payload.frame.slice());core.write(new Uint8Array(payload.frame),now());return null;}throw Error('bad op');},close(){clearInterval(timer);}};
 const token='fixture-token',extension=createMotorExtension({token,worker,dist});
 const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/session'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({token}));return;}if(url.pathname.startsWith('/ouchi-colon/')||url.pathname.startsWith('/api/motor/')){await extension.handle(req,res,url);return;}res.writeHead(404);res.end();});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {base:'http://127.0.0.1:'+server.address().port,token,core,ops,frames,close:async()=>{extension.close();await new Promise(r=>server.close(r));}};
}
