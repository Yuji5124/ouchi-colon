const directions:Readonly<Record<string,string>>={
  KeyW:'forward',KeyS:'backward',KeyA:'left',KeyD:'right',
  ArrowUp:'forward',ArrowDown:'backward',ArrowLeft:'left',ArrowRight:'right',
  w:'forward',s:'backward',a:'left',d:'right',
};

export function driveKey(code:string,key:string){
  const token=code&&code!=='Unidentified'?code:key.length===1?key.toLowerCase():key;
  const motion=Object.hasOwn(directions,token)?directions[token]:undefined;
  return motion?{token,motion,label:token.startsWith('Key')?token.slice(3):token.length===1?token.toUpperCase():token}:null;
}
