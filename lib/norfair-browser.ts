import type {Box} from './tracking';
import type {CameraMotion} from './track-vision';
type Sample={id:string;box:Box;evidence?:string};
export class BrowserNorfair {
  private worker:Worker;
  private serial=0;
  private pending=new Map<number,{resolve:(value:Sample[])=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  constructor(){
    this.worker=new Worker('/norfair/worker.js');
    this.worker.onmessage=({data})=>{const entry=this.pending.get(data.id);if(!entry)return;clearTimeout(entry.timer);this.pending.delete(data.id);data.error?entry.reject(Error(data.error)):entry.resolve(data.result);};
    this.worker.onerror=()=>this.close();
  }
  private request(payload:unknown):Promise<Sample[]>{return new Promise((resolve,reject)=>{const id=++this.serial;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Enhanced tracking took too long to initialize.'));},180000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,payload});});}
  async start(samples:Sample[],width:number,height:number){await this.request({reset:true,samples,active:samples.map(p=>p.id),width,height});}
  async step(samples:Sample[],active:string[],camera:CameraMotion,clear:string[]=[]){return this.request({samples,active,camera,clear});}
  close(){this.worker.terminate();for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(Error('Enhanced tracker stopped.'));}this.pending.clear();}
}
