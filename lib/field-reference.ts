import type {FieldMark,FieldCamera} from './tracking';
import type {CameraMotion} from './track-vision';
export const fieldOptions=[{value:'far-left',label:'Far left corner'},{value:'far-right',label:'Far right corner'},{value:'near-right',label:'Near right corner'},{value:'near-left',label:'Near left corner'},{value:'far-touchline',label:'Far touchline'},{value:'near-touchline',label:'Near touchline'},{value:'left-goal-line',label:'Left goal line'},{value:'right-goal-line',label:'Right goal line'}];
// Image-plane similarity only: these references do not provide metric pitch calibration.
export function advanceFieldCamera(previous:FieldCamera,time:number,motion:CameraMotion):FieldCamera|undefined{
 if(motion.cut||!motion.reliable)return undefined;
 const scale=previous.scale*motion.scale,dx=previous.dx*motion.scale+motion.dx,dy=previous.dy*motion.scale+motion.dy;
 return scale>.01&&scale<100?{time,segment:previous.segment,scale,dx,dy}:undefined;
}
export function projectFieldMark(mark:FieldMark,time:number,cameras:FieldCamera[]){
 if(Math.abs(time-mark.time)<.13)return {points:mark.points,estimated:false};
 const closest=(t:number)=>cameras.filter(c=>Math.abs(c.time-t)<.13).sort((a,b)=>Math.abs(a.time-t)-Math.abs(b.time-t))[0];
 const a=closest(mark.time),b=closest(time);if(!a||!b||a.segment!==b.segment)return undefined;
 return {points:mark.points.map(p=>({x:(p.x-a.dx)/a.scale*b.scale+b.dx,y:(p.y-a.dy)/a.scale*b.scale+b.dy})),estimated:true};
}
