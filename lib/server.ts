import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export async function identity(){const u=await getChatGPTUser();if(!u)throw new Error('Unauthorized');return u.userId;}
export const db=()=> (env as unknown as {DB:D1Database}).DB;
export const bucket=()=> (env as unknown as {BUCKET:R2Bucket}).BUCKET;
export function failure(e:unknown){console.error('PitchIQ request failed', e instanceof Error?e.message:'unknown');return Response.json({error:e instanceof Error&&e.message==='Unauthorized'?'Sign in to save your workspace.':'Unable to save right now. Please retry.'},{status:e instanceof Error&&e.message==='Unauthorized'?401:503});}
