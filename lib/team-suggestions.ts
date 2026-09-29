import type {TrackDetection} from './persistent-tracker';
import {appearanceDistance} from './track-vision';
import {iou} from './detection-core';
import type {Box} from './tracking';
// Requires examples of BOTH kits. Never infer actual names or jersey numbers.
export function suggestKits(candidates:TrackDetection[],examples:{team:string;appearance:number[];box:Box}[]){
 const a=examples.filter(p=>p.team==='A'&&p.appearance.length),b=examples.filter(p=>p.team==='B'&&p.appearance.length);
 if(!a.length||!b.length)return [];
 return candidates.flatMap(d=>{
  const feature=d.appearance;
  if(d.kind!=='person'||d.score<.18||!feature?.length||examples.some(p=>iou(p.box,d.box)>.15))return [];
  const da=Math.min(...a.map(p=>appearanceDistance(p.appearance,feature))),db=Math.min(...b.map(p=>appearanceDistance(p.appearance,feature)));
  if(Math.min(da,db)>.22||Math.abs(da-db)<.12)return [];
  return [{detection:d,team:da<db?'A' as const:'B' as const,distance:Math.min(da,db)}];
 }).sort((a,b)=>a.distance-b.distance);
}
