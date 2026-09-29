import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const directory=new URL('../public/norfair/runtime/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('./norfair-assets.json',import.meta.url),'utf8'));
await mkdir(directory,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const asset of manifest){
 const path=new URL(asset.name,directory);
 try{if(sha(await readFile(path))===asset.sha256)continue;}catch{}
 console.log('Preparing browser tracking: '+asset.name);
 const response=await fetch(asset.url,{signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error(`Runtime download failed (${response.status}): ${asset.name}`);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(sha(bytes)!==asset.sha256)throw Error('Runtime checksum mismatch: '+asset.name);
 const temporary=new URL(asset.name+'.tmp',directory);await writeFile(temporary,bytes);await rename(temporary,path);
}
