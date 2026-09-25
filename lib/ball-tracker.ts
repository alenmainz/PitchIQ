import type {Box} from './tracking';
import type {Frame} from './patch-tracker';
import {stillCamera,type CameraMotion} from './track-vision';
export type BallTrack={box:Box;time:number;lastSeen:number;vx:number;vy:number;diameter:number;pending?:Box;pendingTime?:number;lastConfirmed?:Box;nearPlayer?:{id:string;time:number}};
export type BallPlayer=Box&{id?:string};
export type BallCandidate={box:Box;quality:number};
const center=(b:Box)=>({x:b.x+b.w/2,y:b.y+b.h/2});
// Compact light objects with local contrast. Long white lines are rejected by shape,
// component size, and border contact. This complements, not replaces, the neural detector.
export function ballCandidates(f:Frame,around:Box,radius=100):BallCandidate[]{
 const p=center(around),cx=p.x*f.width,cy=p.y*f.height;
 const x0=Math.max(0,Math.floor(cx-radius)),y0=Math.max(0,Math.floor(cy-radius)),x1=Math.min(f.width-1,Math.ceil(cx+radius)),y1=Math.min(f.height-1,Math.ceil(cy+radius));
 const w=x1-x0+1,h=y1-y0+1;if(w<=0||h<=0)return [];
 const mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),result:BallCandidate[]=[];
 const lum=(x:number,y:number)=>{const i=(Math.max(0,Math.min(f.height-1,y))*f.width+Math.max(0,Math.min(f.width-1,x)))*4;return f.data[i]*.299+f.data[i+1]*.587+f.data[i+2]*.114;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=((y+y0)*f.width+x+x0)*4,r=f.data[i],g=f.data[i+1],b=f.data[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b);if(min>90&&max-min<max*.38&&lum(x+x0,y+y0)>135)mask[y*w+x]=1;}
 for(let i=0;i<mask.length;i++){if(!mask[i]||seen[i])continue;const queue=[i];seen[i]=1;let minx=w,miny=h,maxx=0,maxy=0,light=0;
  for(let j=0;j<queue.length;j++){const q=queue[j],x=q%w,y=Math.floor(q/w);minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);light+=lum(x+x0,y+y0);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,n=ny*w+nx;if(nx>=0&&nx<w&&ny>=0&&ny<h&&mask[n]&&!seen[n]){seen[n]=1;queue.push(n);}}}
  const bw=maxx-minx+1,bh=maxy-miny+1;if(queue.length<3||queue.length>180||bw>22||bh>22||bw/bh<.45||bw/bh>2.2||queue.length/(bw*bh)<.38||minx===0||miny===0||maxx===w-1||maxy===h-1)continue;
  const mx=(minx+maxx)/2+x0,my=(miny+maxy)/2+y0,ring=Math.max(bw,bh)*1.3+2;let bg=0;for(let k=0;k<12;k++){const angle=k*Math.PI/6;bg+=lum(Math.round(mx+ring*Math.cos(angle)),Math.round(my+ring*Math.sin(angle)));}const contrast=light/queue.length-bg/12;if(contrast<22)continue;
  result.push({box:{x:(minx+x0-.5)/f.width,y:(miny+y0-.5)/f.height,w:(bw+1)/f.width,h:(bh+1)/f.height},quality:Math.min(1,contrast/100)*.6+.4*queue.length/(bw*bh)});
 }
 return result;
}
export function seedBall(frame:Frame,box:Box,time:number):BallTrack{
 const c=center(box),near=ballCandidates(frame,box,Math.max(18,box.w*frame.width)).sort((a,b)=>{const x=center(a.box),y=center(b.box);return Math.hypot(x.x-c.x,x.y-c.y)-Math.hypot(y.x-c.x,y.y-c.y);})[0];
 const refined=near&&Math.hypot((center(near.box).x-c.x)*frame.width,(center(near.box).y-c.y)*frame.height)<Math.max(12,box.w*frame.width)?near.box:box;
 return {box:refined,lastConfirmed:refined,time,lastSeen:time,vx:0,vy:0,diameter:Math.sqrt(refined.w*frame.width*refined.h*frame.height)};
}
export type BallResult={track:BallTrack|undefined;reason?:string;sample?:{box:Box;score:number;evidence:'appearance'|'predicted'};recovered?:boolean};
export function advanceBall(frame:Frame,track:BallTrack,time:number,camera:CameraMotion=stillCamera,players:BallPlayer[]=[]):BallResult{
 if(camera.cut)return {track:undefined,reason:'Camera cut: confirm the ball in the new view.'};
 const dt=Math.max(.001,time-track.time),gap=time-track.lastSeen,c=camera.reliable?camera:stillCamera;
 const warped={x:track.box.x*c.scale+c.dx,y:track.box.y*c.scale+c.dy,w:track.box.w*c.scale,h:track.box.h*c.scale};
 const predicted={...warped,x:warped.x+track.vx*dt,y:warped.y+track.vy*dt},p=center(predicted);
 const lastConfirmed=track.lastConfirmed?{...track.lastConfirmed,x:track.lastConfirmed.x*c.scale+c.dx,y:track.lastConfirmed.y*c.scale+c.dy,w:track.lastConfirmed.w*c.scale,h:track.lastConfirmed.h*c.scale}:warped;
 const context=track.nearPlayer&&time-track.nearPlayer.time<3?players.find(b=>b.id===track.nearPlayer?.id):undefined;
 const foot=context?{x:context.x+context.w/2,y:context.y+context.h}:undefined;
 const regions=[track.pending||predicted,...(gap>.2?[lastConfirmed]:[]),...(gap>.2&&foot?[{...predicted,x:foot.x-predicted.w/2,y:foot.y-predicted.h/2}]:[])];
 const raw=regions.flatMap(b=>ballCandidates(frame,b,gap>.2?100:60));
 const unique=raw.filter((d,i)=>!raw.slice(0,i).some(q=>Math.hypot((center(q.box).x-center(d.box).x)*frame.width,(center(q.box).y-center(d.box).y)*frame.height)<3));
 const radius=Math.min(180,Math.max(45,frame.width*(.025+gap*.035))),candidates=unique.map(d=>{const q=center(d.box),distance=Math.hypot((q.x-p.x)*frame.width,(q.y-p.y)*frame.height),diameter=Math.sqrt(d.box.w*frame.width*d.box.h*frame.height),ratio=diameter/(track.diameter*c.scale);const contextDistance=foot?Math.hypot((q.x-foot.x)*frame.width,(q.y-foot.y)*frame.height):Infinity;const lastDistance=Math.hypot((q.x-center(lastConfirmed).x)*frame.width,(q.y-center(lastConfirmed).y)*frame.height);const effectiveDistance=gap>.2?Math.min(distance,lastDistance+12,contextDistance+8):distance;const nearPlayer=players.some(b=>q.x>b.x-.002&&q.x<b.x+b.w+.002&&q.y>b.y&&q.y<b.y+b.h+.003);return {...d,diameter,cost:(nearPlayer?.18:0)+effectiveDistance/radius*.65+Math.abs(Math.log(ratio))*.25+(1-d.quality)*.1,valid:ratio>.45&&ratio<2.1};}).filter(d=>d.valid).sort((a,b)=>a.cost-b.cost);
 const best=candidates[0];
 if(best&&best.cost<.65&&(!candidates[1]||candidates[1].cost-best.cost>.09)){
  if(gap>dt+.02&&(!track.pending||Math.hypot((center(track.pending).x-center(best.box).x)*frame.width,(center(track.pending).y-center(best.box).y)*frame.height)>40)){if(gap>3)return {track:undefined,reason:'Ball recovery remained uncertain. Confirm the ball to restart.'};return {track:{...track,box:predicted,lastConfirmed,time,pending:best.box,pendingTime:time},recovered:false};}
  const a=center(warped),b=center(best.box);const nearby=players.filter(p=>p.id).map(p=>({id:p.id!,distance:Math.hypot(b.x-p.x-p.w/2,b.y-p.y-p.h)})).sort((a,b)=>a.distance-b.distance);const nearPlayer=nearby[0]?.distance<.045?{id:nearby[0].id,time}:track.nearPlayer;const vx=(b.x-a.x)/dt,vy=(b.y-a.y)/dt;
  return {track:{...track,box:best.box,lastConfirmed:best.box,nearPlayer,time,lastSeen:time,vx:.25*track.vx+.75*vx,vy:.25*track.vy+.75*vy,diameter:track.diameter*.8+best.diameter*.2,pending:undefined,pendingTime:undefined},sample:{box:best.box,score:1-best.cost,evidence:'appearance' as const},recovered:gap>dt+.01};
 }
 if(gap>3)return {track:undefined,reason:'Ball could not be distinguished from nearby objects. Confirm it once to restart.'};
 const next={...track,box:predicted,lastConfirmed,time,vx:track.vx*.95,vy:track.vy*.95,pending:undefined,pendingTime:undefined};
 const visible=predicted.x>=0&&predicted.y>=0&&predicted.x+predicted.w<=1&&predicted.y+predicted.h<=1;
 return {track:next,sample:gap<=.2&&visible?{box:predicted,score:.2,evidence:'predicted' as const}:undefined,recovered:false};
}

// Context is a search hint, never a claim that the nearby player possesses the ball.
export function ballSearchFocus(track:BallTrack,time:number,players:BallPlayer[]):Box{
 const player=track.nearPlayer&&time-track.nearPlayer.time<3?players.find(p=>p.id===track.nearPlayer?.id):undefined;
 if(time-track.lastSeen>.2&&player)return {...track.box,x:Math.max(0,Math.min(1-track.box.w,player.x+player.w/2-track.box.w/2)),y:Math.max(0,Math.min(1-track.box.h,player.y+player.h-track.box.h/2))};
 return time-track.lastSeen>.2?track.lastConfirmed||track.box:track.box;
}

export function confirmBallDetection(frame:Frame,track:BallTrack,detection:{box:Box;score:number},time:number,camera:CameraMotion,players:BallPlayer[]):BallResult{
 const c=camera.reliable?camera:stillCamera,dt=Math.max(.001,time-track.time),gap=time-track.lastSeen;
 const warp=(b:Box)=>({...b,x:b.x*c.scale+c.dx,y:b.y*c.scale+c.dy,w:b.w*c.scale,h:b.h*c.scale});
 const old=warp(track.box),candidate=center(detection.box),pending=track.pending?center(warp(track.pending)):undefined;
 if(gap>.2&&(!pending||!track.pendingTime||time-track.pendingTime>.25||Math.hypot((candidate.x-pending.x)*frame.width,(candidate.y-pending.y)*frame.height)>40)){
  if(gap>3)return {track:undefined,reason:'Ball recovery remained uncertain. Confirm the ball to restart.'};
  return {track:{...track,box:old,lastConfirmed:warp(track.lastConfirmed||track.box),time,pending:detection.box,pendingTime:time}};
 }
 const nearby=players.filter(p=>p.id).map(p=>({id:p.id!,distance:Math.hypot(candidate.x-p.x-p.w/2,candidate.y-p.y-p.h)})).sort((a,b)=>a.distance-b.distance);
 const nearPlayer=nearby[0]?.distance<.045?{id:nearby[0].id,time}:track.nearPlayer;
 return {track:{...track,box:detection.box,lastConfirmed:detection.box,nearPlayer,time,lastSeen:time,pending:undefined,pendingTime:undefined,vx:(candidate.x-center(old).x)/dt,vy:(candidate.y-center(old).y)/dt,diameter:Math.sqrt(detection.box.w*frame.width*detection.box.h*frame.height)},sample:{box:detection.box,score:detection.score,evidence:'appearance'},recovered:gap>.11};
}
