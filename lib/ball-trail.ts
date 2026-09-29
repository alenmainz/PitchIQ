import type {Point,FieldCamera} from './tracking';
/** Recent observations projected into the current camera frame, never future points. */
export function ballTrail(points:Point[],time:number,cameras:FieldCamera[]){
 const samples=points.filter(p=>p.playerId==='ball'&&p.time<=time+.001&&p.time>=time-2).sort((a,b)=>a.time-b.time);
 const cameraAt=(t:number)=>cameras.filter(c=>Math.abs(c.time-t)<=.125).sort((a,b)=>Math.abs(a.time-t)-Math.abs(b.time-t))[0];
 const current=cameraAt(time),segments:{x:number;y:number}[][]=[];let segment:{x:number;y:number}[]=[],previous=-Infinity;
 const flush=()=>{if(segment.length>1)segments.push(segment);segment=[];};
 // A stale trail can misleadingly suggest the ball is still tracked.
 if(!samples.length||time-samples[samples.length-1].time>.25)return segments;
 for(const p of samples){
  const camera=cameraAt(p.time);
  if(p.evidence==='predicted'||(!p.reviewed&&p.score<.5)||!current||!camera||camera.segment!==current.segment){flush();previous=-Infinity;continue;}
  const x=(p.box.x+p.box.w/2-camera.dx)/camera.scale*current.scale+current.dx;
  const y=(p.box.y+p.box.h/2-camera.dy)/camera.scale*current.scale+current.dy;
  if(p.time-previous>.25)flush();
  if(x<0||x>1||y<0||y>1){flush();previous=-Infinity;continue;}
  segment.push({x,y});previous=p.time;
 }
 flush();return segments;
}
