import {z} from 'zod';
import {trackingSchema, pointAt, isActive, type TrackingDoc} from './tracking';

export const SEGMENT_SECONDS = 20;
const videoSchema = z.object({id:z.string().min(1),filename:z.string(),width:z.number().int().positive(),height:z.number().int().positive(),duration:z.number().positive()});
const segmentSchema = z.object({start:z.number().nonnegative(),end:z.number().positive()}).refine(s=>s.end>s.start&&s.end-s.start<=SEGMENT_SECONDS+.01,'Choose a segment of at most 20 seconds.');
const resultSchema = z.object({format:z.literal('pitchiq-norfair-result'),version:z.literal(1),video:videoSchema,segment:segmentSchema,setupKey:z.string(),points:trackingSchema.innerType().shape.points,issues:trackingSchema.innerType().shape.issues,summary:z.object({elapsedSeconds:z.number().nonnegative(),processedSeconds:z.number().nonnegative(),observed:z.number().int().nonnegative(),predicted:z.number().int().nonnegative(),stopReason:z.string().max(300)})});
// Exact serialized setup is echoed by the runner. Any intervening correction invalidates it.
export function setupKey(doc:TrackingDoc){return JSON.stringify({players:doc.players,substitutions:doc.substitutions,points:doc.points.filter(p=>p.reviewed||p.source!=='experimental')});}
export function makeNativeSetup(doc:TrackingDoc,video:z.infer<typeof videoSchema>,start:number,seconds:number){
 const end=Math.min(video.duration-.01,start+seconds);
 segmentSchema.parse({start,end});videoSchema.parse(video);trackingSchema.parse(doc);
 const seeds=doc.players.flatMap(p=>{const q=pointAt(doc.points,p.id,start);return q&&q.reviewed&&q.evidence!=='predicted'&&isActive(doc,p.id,start)?[{...q,time:start}]:[];});
 if(!seeds.some(p=>p.playerId!=='ball'))throw Error('Confirm at least one player box on the starting frame.');
 if(!seeds.some(p=>p.playerId==='ball'))throw Error('Confirm the ball on the starting frame.');
 return {format:'pitchiq-norfair-setup',version:1,video,segment:{start,end},setupKey:setupKey(doc),document:doc,seeds};
}
export function mergeNativeResult(doc:TrackingDoc,raw:unknown,videoId:string){
 const result=resultSchema.parse(raw);
 if(result.video.id!==videoId)throw Error('This result belongs to a different video.');
 if(result.setupKey!==setupKey(doc))throw Error('Labels or roster changed after export. Export a new setup and rerun to preserve your corrections.');
 const {start,end}=result.segment;
 if(end>result.video.duration+.01||result.summary.processedSeconds>end-start+.01)throw Error('Result has an invalid processed duration.');
 const processedEnd=start+result.summary.processedSeconds;
 if(result.points.some(p=>p.time<start-.001||p.time>processedEnd+.001||p.source!=='experimental'||p.reviewed)||result.issues.some(p=>p.time<start-.001||p.time>processedEnd+.001))throw Error('Result contains invalid segment observations.');
 const keys=result.points.map(p=>p.playerId+':'+p.time.toFixed(4));
 if(new Set(keys).size!==keys.length)throw Error('Result contains duplicate observations.');
 const confirmed=doc.points.filter(p=>p.reviewed||p.source!=='experimental');
 const points=[...doc.points.filter(p=>p.reviewed||p.source!=='experimental'||p.time<start||p.time>processedEnd),...result.points.filter(p=>!confirmed.some(q=>q.playerId===p.playerId&&Math.abs(q.time-p.time)<.05))].sort((a,b)=>a.time-b.time);
 const next=trackingSchema.parse({...doc,points,issues:[...doc.issues.filter(i=>i.time<start||i.time>processedEnd),...result.issues],checkpoint:{start,time:processedEnd}});
 if(JSON.stringify(next).length>890000)throw Error('Saved clip capacity reached. Export your tracking and clear older experimental passes before importing.');
 return {document:next,summary:result.summary};
}
