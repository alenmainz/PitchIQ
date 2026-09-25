import type {Box} from './tracking';
export type Frame={width:number;height:number;data:Uint8ClampedArray};
export type PatchTrack={box:Box;template:number[];id:string;ball:boolean};
const COLS=8,ROWS=12;
export function patch(frame:Frame,b:Box){const out:number[]=[];for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const px=Math.max(0,Math.min(frame.width-1,Math.round((b.x+b.w*(x+.5)/COLS)*frame.width))),py=Math.max(0,Math.min(frame.height-1,Math.round((b.y+b.h*(y+.5)/ROWS)*frame.height)));const i=(py*frame.width+px)*4;out.push(frame.data[i],frame.data[i+1],frame.data[i+2]);}return out;}
export function seedTrack(frame:Frame,box:Box,id:string,ball=false):PatchTrack{return {box,template:patch(frame,box),id,ball};}
function similarity(a:number[],b:number[]){let error=0;for(let i=0;i<a.length;i++)error+=Math.abs(a[i]-b[i]);return Math.max(0,1-error/a.length/90);}
export function advanceTrack(frame:Frame,track:PatchTrack):{track?:PatchTrack;score:number;reason?:string}{
 const {box}=track;const radius=Math.min(34,Math.max(track.ball?18:10,Math.ceil(box.h*frame.height*1.6)));let best=-1;let found=box;const candidates:{score:number;box:Box}[]=[];
 const at=(dx:number,dy:number)=>{const b={...box,x:box.x+dx/frame.width,y:box.y+dy/frame.height};if(b.x<0||b.y<0||b.x+b.w>1||b.y+b.h>1)return;const score=similarity(track.template,patch(frame,b));candidates.push({score,box:b});if(score>best){best=score;found=b;}};
 for(let y=-radius;y<=radius;y+=2)for(let x=-radius;x<=radius;x+=2)at(x,y);
 const coarse=found;for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)at(Math.round((coarse.x-box.x)*frame.width)+x,Math.round((coarse.y-box.y)*frame.height)+y);
 const second=Math.max(0,...candidates.filter(c=>Math.hypot((c.box.x-found.x)*frame.width,(c.box.y-found.y)*frame.height)>Math.max(4,box.w*frame.width)).map(c=>c.score));
 if(best<.72)return {score:Math.max(0,best),reason:'Appearance changed or target left view. Place a new box.'};
 if(best-second<.015)return {score:best,reason:'Multiple similar areas. Confirm the player with a new box.'};
 if(Math.abs(found.x-box.x)*frame.width>=radius-1||Math.abs(found.y-box.y)*frame.height>=radius-1)return {score:best,reason:'Movement exceeded the search area. Place a new box.'};
 return {track:{...track,box:found},score:best};
}
export function overlap(a:Box,b:Box){const area=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));return area/(a.w*a.h+b.w*b.h-area);}
