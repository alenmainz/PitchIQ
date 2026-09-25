export type Provenance='measured'|'estimated'|'manual'|'simulation';
export interface Evidence {matchId:string;startSeconds:number;endSeconds:number;playerIds:string[];confidence:number|null;provenance:Provenance;modelVersion:string|null}
export interface TrajectoryPoint {timestamp:number;xMeters:number;yMeters:number;confidence:number;occluded:boolean}
export interface AnalysisArtifact {organizationId:string;teamId:string;matchId:string;version:number;videoAssetId:string;provenance:Provenance;tracks:{playerId:string|null;trackId:string;points:TrajectoryPoint[]}[];insights:{id:string;text:string;evidence:Evidence[];review:'pending'|'accepted'|'dismissed'}[]}
export interface QueueAdapter {enqueue(input:{organizationId:string;matchId:string;videoAssetId:string;idempotencyKey:string}):Promise<{jobId:string}>}
