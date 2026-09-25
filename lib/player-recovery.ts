import {iou} from './detection-core';
import {appearanceDistance,type CameraMotion} from './track-vision';
import {startTrack,type PersistentTrack,type TrackDetection} from './persistent-tracker';
import type {Box,PlayerMemory} from './tracking';
export type MissingPlayer={track:PersistentTrack;lostAt:number;edge:string;expected:Box;candidate?:Box;hits:number;lastCandidateTime?:number;offscreen?:boolean;locationKnown?:boolean};
const center=(b:Box)=>({x:b.x+b.w/2,y:b.y+b.h/2});
export function edgeOf(b:Box){return b.x<.04?'left':b.x+b.w>.96?'right':b.y<.04?'top':b.y+b.h>.96?'bottom':'';}
export function rememberPlayer(track:PersistentTrack,time:number):MissingPlayer{return {track,lostAt:time,edge:edgeOf(track.box),expected:track.box,hits:0,offscreen:!!edgeOf(track.box),locationKnown:true};}
// Roster counts increase support only after motion, appearance and repeated sightings agree.
// No identity is assigned from count or entry side alone.
export function recoverPlayers(active:PersistentTrack[],missing:MissingPlayer[],detections:TrackDetection[],time:number,camera:CameraMotion,gallery:PersistentTrack[]=[]){
 const restored:PersistentTrack[]=[],events:{playerId:string;time:number;reason:string}[]=[],next:MissingPlayer[]=[];
 if(camera.cut)return {missing:missing.map(m=>({...m,locationKnown:false,hits:0,candidate:undefined})),restored,events};
 const available=detections.filter(d=>d.kind==='person'&&d.score>=.4&&d.appearance?.length&&!active.some(t=>iou(t.box,d.box)>.1));
 const candidates=missing.map(m=>{
  const b=m.expected,c=camera.reliable?camera:{scale:1,dx:0,dy:0};m={...m,expected:{x:b.x*c.scale+c.dx,y:b.y*c.scale+c.dy,w:b.w*c.scale,h:b.h*c.scale}};
  m.track={...m.track,time};
  m.offscreen=!!(m.offscreen||edgeOf(m.expected));
  const longGap=time-m.track.lastSeen>12||m.locationKnown===false;
  const supported=m.track.team&&active.filter(t=>t.team===m.track.team&&time-t.lastSeen<=.4).length===10&&missing.filter(t=>t.track.team===m.track.team).length===1;
  const opts=available.map((d,index)=>{
   const a=center(m.expected),q=center(d.box),distance=Math.hypot(a.x-q.x,a.y-q.y),appearance=appearanceDistance(m.track.appearance,d.appearance||[]),sameEdge=m.edge&&edgeOf(d.box)===m.edge,ratio=d.box.w*d.box.h/(m.track.box.w*m.track.box.h);
   const others=[...active,...missing.map(x=>x.track),...gallery].filter(t=>t.id!==m.track.id&&t.appearance.length);
   const distinctive=others.length>0&&others.every(t=>appearanceDistance(t.appearance,d.appearance||[])-appearance>.065);
   // After a long absence, shirt colors cannot distinguish same-kit teammates.
   // Only a distinctive signature (often a keeper) can recover without a new anchor.
   const plausible=longGap?distinctive:distance<.08||!!sameEdge&&distance<.25;
   return {index,d,appearance,cost:longGap?appearance:appearance*.7+Math.min(1,distance/.15)*.3,valid:plausible&&ratio>(longGap?.2:.45)&&ratio<(longGap?5:2.2)&&appearance<(longGap?.12:supported?.25:.18)};
  }).filter(o=>o.valid).sort((a,b)=>a.cost-b.cost);
  return {m,opts,supported};
 });
 const used=new Set<number>();for(const {m,opts,supported} of candidates){const best=opts[0];const contested=best&&candidates.some(other=>other.m.track.id!==m.track.id&&other.opts[0]?.index===best.index);const ambiguous=opts[1]&&opts[1].cost-best.cost<.08;
  if(!best||contested||ambiguous||used.has(best.index)){next.push({...m,hits:0,candidate:undefined});continue;}
  const stable=m.candidate&&m.lastCandidateTime!==undefined&&time-m.lastCandidateTime<=.35&&Math.hypot(center(m.candidate).x-center(best.d.box).x,center(m.candidate).y-center(best.d.box).y)<.04;
  const hits=stable?m.hits+1:1;used.add(best.index);
  if(hits>=(time-m.track.lastSeen>12||m.locationKnown===false?5:3)){restored.push({...startTrack(m.track.id,'person',best.d.box,time,m.track.appearance),team:m.track.team});events.push({playerId:m.track.id,time,reason:time-m.track.lastSeen>12||m.locationKnown===false?'Auto-recovered after repeated distinctive appearance matches. Check this identity.':supported?'Auto-recovered: ten teammates accounted for, appearance and motion agree. Check this identity.':'Auto-recovered after repeated appearance and location matches. Check this identity.'});}
  else next.push({...m,candidate:best.d.box,lastCandidateTime:time,hits});
 }
 return {missing:next,restored,events};
}
// Setup suggestion only: a single unassigned teammate must also match team appearance,
// beat the other team's appearance, and have no second plausible unassigned candidate.
export function remainingPlayerSuggestion(team:string,unlabelled:{id:string;team:string}[],labelled:{team:string;appearance:number[]}[],candidates:TrackDetection[]){
 const remaining=unlabelled.filter(p=>p.team===team),own=labelled.filter(p=>p.team===team&&p.appearance.length),other=labelled.filter(p=>p.team!==team&&p.appearance.length);
 if(remaining.length!==1||own.length!==10||other.length<3)return undefined;
 const distance=(a:number[],group:typeof labelled)=>group.map(p=>appearanceDistance(a,p.appearance)).sort((a,b)=>a-b).slice(0,3).reduce((s,d)=>s+d,0)/Math.min(3,group.length);
 const valid=candidates.filter(d=>d.kind==='person'&&d.score>=.5&&d.appearance?.length).map(d=>({d,own:distance(d.appearance!,own),other:distance(d.appearance!,other)})).filter(x=>x.own<.2&&x.other-x.own>.12);
 return valid.length===1?{playerId:remaining[0].id,detection:valid[0].d}:undefined;
}

export function savePlayerMemory(active:PersistentTrack[],missing:MissingPlayer[]):PlayerMemory[]{
 return [...active.map(t=>({playerId:t.id,box:t.box,appearance:t.appearance,time:t.time,lastSeen:t.lastSeen,edge:edgeOf(t.box),offscreen:false})),...missing.map(m=>({playerId:m.track.id,box:m.expected,appearance:m.track.appearance,time:m.track.time,lastSeen:m.track.lastSeen,edge:m.edge,offscreen:!!m.offscreen}))];
}
export function restorePlayerMemory(memory:PlayerMemory,team:string,start:number):MissingPlayer{
 const track={...startTrack(memory.playerId,'person',memory.box,start,memory.appearance),team,lastSeen:memory.lastSeen};
 return {...rememberPlayer(track,start),edge:memory.edge,offscreen:memory.offscreen,locationKnown:Math.abs(start-memory.time)<.3};
}
