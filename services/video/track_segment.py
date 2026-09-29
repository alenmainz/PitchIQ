"""Norfair segment runner: python services/video/track_segment.py --help.

Observations are in source-video time; no roster identity is invented for a new
detection. Short predictions and appearance-only ball matches are explicit.
"""
import argparse
import json
import math
import time
from pathlib import Path

import cv2
import numpy as np
from norfair import Detection, Tracker
from norfair.camera_motion import MotionEstimator, HomographyTransformationGetter

from detector import Detector, appearance, appearance_distance, overlap

HZ = 10


def active(doc, player, t):
    found = next((p for p in doc['players'] if p['id'] == player), None)
    state = bool(found and found['starter'])
    for sub in sorted(doc['substitutions'], key=lambda s: s['time']):
        if sub['time'] > t+.001:
            break
        if sub['off'] == player:
            state = False
        if sub['on'] == player:
            state = True
    return state


def pixels(box, width, height):
    return np.array([box['x']*width, box['y']*height, (box['x']+box['w'])*width, (box['y']+box['h'])*height])


def normalized(box, width, height):
    box = np.clip(np.asarray(box).reshape(4), [0,0,0,0], [width,height,width,height])
    if not np.isfinite(box).all() or min(box[2:]-box[:2]) < max(width,height)*.001:
        return None
    return dict(zip(('x','y','w','h'), np.round(np.r_[box[:2]/[width,height], (box[2:]-box[:2])/[width,height]], 6).tolist()))


def observation(player, t, box, score, evidence, width, height):
    b = normalized(box, width, height)
    if b is None:
        return None
    return {'playerId':player,'time':round(t,4),'box':b,'score':round(float(np.clip(score,0,1)),3),'source':'experimental','reviewed':False,'evidence':evidence}


def scene_cut(previous, frame):
    if previous is None:
        return False
    # A histogram change AND poor feature agreement: pans alone should not stop.
    a,b = [cv2.resize(f,(320,180)) for f in (previous,frame)]
    hist = lambda f: cv2.normalize(cv2.calcHist([cv2.cvtColor(f,cv2.COLOR_BGR2HSV)],[0,1],None,[24,16],[0,180,0,256]),None).flatten()
    delta = cv2.compareHist(hist(a),hist(b),cv2.HISTCMP_BHATTACHARYYA)
    diff = np.mean(cv2.absdiff(a,b))/255
    return delta > .48 and diff > .18


class Players:
    def __init__(self):
        self.detections = []
        self.tracker = Tracker(distance_function=self.distance, distance_threshold=.95, initialization_delay=0, hit_counter_max=30, pointwise_hit_counter_max=30)
        self.identities = {}
        self.last_seen = {}
        self.missing_reported = set()
        self.costs = {}
        self.profiles = {}
        self.reentry = {}

    def recover(self, frame, detections, t, doc):
        """Only distinctive appearances may revive expired identities, after 3 scans.

        Matching jersey colors shared by teammates are intentionally insufficient.
        This is a conservative color descriptor, not learned person re-identification.
        """
        live={self.identities.get(o.id) for o in self.tracker.tracked_objects if o.hit_counter_is_positive}
        h,w=frame.shape[:2]
        proposed=[];used=set()
        for player,profile in self.profiles.items():
            if player in live or not active(doc,player,t) or t-self.last_seen.get(player,t)<3:
                continue
            ranked=sorted([(appearance_distance(profile,appearance(frame,d['box'])),i,d) for i,d in enumerate(detections)],key=lambda q:q[0])
            if not ranked or ranked[0][0]>.25 or (len(ranked)>1 and ranked[1][0]-ranked[0][0]<.12):
                self.reentry.pop(player,None);continue
            distance,index,d=ranked[0];feature=appearance(frame,d['box'])
            if index in used or any(appearance_distance(other,feature)<distance+.15 for pid,other in self.profiles.items() if pid!=player):
                self.reentry.pop(player,None);continue
            center=d['box'].reshape(2,2).mean(0)
            old=self.reentry.get(player)
            count=old[1]+1 if old and t-old[2]<.5 and np.linalg.norm(center-old[0])<w*.06 else 1
            self.reentry[player]=(center,count,t)
            if count>=3:
                box=normalized(d['box'],w,h)
                if box:
                    proposed.append({'playerId':player,'box':box,'reidentified':True})
                    used.add(index);self.reentry.pop(player,None)
        return proposed

    @staticmethod
    def cost(d, obj):
        if d.data.get('seed'):
            return 10.0  # keyframes create a fresh track, never bind another identity
        a,b = d.absolute_points, obj.get_estimate(absolute=obj.abs_to_rel is not None)
        height = max(8, np.linalg.norm(b[1]-b[0]))
        dist = np.linalg.norm(a.mean(0)-b.mean(0))
        shape = np.linalg.norm(a[1]-a[0])/height
        color = appearance_distance(d.embedding,obj.last_detection.embedding)
        if dist>max(18,height*.9) or not .45<shape<2.2 or color>.65:
            return 10.0
        return float(.7*dist/max(18,height*.9)+.3*color)

    def distance(self, d, obj):
        def cached(q,o):
            key=(id(q),id(o))
            if key not in self.costs:self.costs[key]=self.cost(q,o)
            return self.costs[key]
        cost = cached(d,obj)
        if cost >= .95:
            return cost
        # Reject close alternatives in either direction before Norfair's matching.
        other_objects = [cached(d,o) for o in self.tracker.tracked_objects if o is not obj]
        other_detections = [cached(q,obj) for q in self.detections if q is not d]
        if any(c < cost+.10 for c in other_objects+other_detections):
            return 10.0
        return cost

    def step(self, frame, detections, seeds, t, transform, doc):
        seed_ids = {s['playerId'] for s in seeds}
        self.costs = {}
        self.tracker.tracked_objects = [o for o in self.tracker.tracked_objects if self.identities.get(o.id) not in seed_ids and (o.id not in self.identities or active(doc,self.identities[o.id],t))]
        h,w=frame.shape[:2]
        seed_boxes = [pixels(s['box'],w,h) for s in seeds]
        self.detections = [Detection(d['box'].reshape(2,2), scores=np.ones(2)*d['score'], embedding=appearance(frame,d['box']), data={'time':t,'score':d['score']}) for d in detections if not any(overlap(d['box'],b)>.2 for b in seed_boxes)]
        for s,b in zip(seeds,seed_boxes):
            # Remove anonymous tracks overlapping a confirmed identity as well.
            self.tracker.tracked_objects = [o for o in self.tracker.tracked_objects if o.id in self.identities or overlap(o.estimate.reshape(4),b)<.35]
            feature=appearance(frame,b)
            if not s.get('reidentified'):
                self.profiles[s['playerId']]=feature
            self.detections.append(Detection(b.reshape(2,2),scores=np.ones(2),embedding=feature,data={'time':t,'score':.7 if s.get('reidentified') else 1.,'seed':s['playerId'],'reidentified':s.get('reidentified',False)}))
        objects = self.tracker.update(self.detections, period=2, coord_transformations=transform)
        samples,issues=[],[]
        for obj in objects:
            data=obj.last_detection.data
            if data.get('seed'):
                self.identities[obj.id]=data['seed']
                if abs(data['time']-t)<.001:
                    obj.hit_counter=30  # confirmed seeds survive the initial detection gap
            player=self.identities.get(obj.id)
            if not player:
                continue
            observed=abs(data['time']-t)<.001
            if observed:
                self.last_seen[player]=t
                self.missing_reported.discard(player)
            age=t-self.last_seen.get(player,t)
            # Retain internal track through a miss, but do not draw a long hallucinated path.
            if observed or age<=.3:
                evidence=('reidentified' if data.get('reidentified') else 'detection') if observed else 'predicted'
                sample=observation(player,t,obj.estimate,data['score'] if observed else .2,evidence,w,h)
                if sample:
                    samples.append(sample)
        # Unassigned people must not create duplicate competitors that steal a known
        # player's next detection. They are labeled through the app's existing scan UI.
        self.tracker.tracked_objects=[o for o in self.tracker.tracked_objects if o.id in self.identities]
        for player,last in self.last_seen.items():
            if t-last>3 and player not in self.missing_reported and active(doc,player,t):
                issues.append({'playerId':player,'time':round(t,4),'reason':'Player unavailable for 3 seconds. May be off-screen; confirm their identity when visible again.'})
                self.missing_reported.add(player)
        return samples,issues


class Ball:
    def __init__(self):
        self.box=None
        self.velocity=np.zeros(2)
        self.time=0.
        self.last_seen=0.
        self.pending=None
        self.hits=0

    def seed(self, box, t):
        self.box=np.array(box,dtype=float)
        self.velocity=np.zeros(2)
        self.time=self.last_seen=t
        self.pending=None
        self.hits=0

    def predict(self,t):
        return self.box+np.tile(self.velocity*min(.3,max(0,t-self.time)),2)

    def candidates(self,frame,t):
        if self.box is None or t-self.last_seen>1.5:
            return []
        h,w=frame.shape[:2]
        predicted=self.predict(t)
        center=(predicted[:2]+predicted[2:])/2
        radius=min(130,30+100*(t-self.last_seen))
        x1,y1=np.maximum(0,center-radius).astype(int)
        x2,y2=np.minimum([w,h],center+radius).astype(int)
        if x2<=x1 or y2<=y1:
            return []
        hsv=cv2.cvtColor(frame[y1:y2,x1:x2],cv2.COLOR_BGR2HSV)
        mask=cv2.inRange(hsv,np.array([0,0,165]),np.array([180,105,255]))
        contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        area=max(3,float(np.prod(self.box[2:]-self.box[:2])))
        result=[]
        for c in contours:
            x,y,bw,bh=cv2.boundingRect(c)
            a=cv2.contourArea(c)
            perimeter=cv2.arcLength(c,True)
            circularity=4*math.pi*a/max(1,perimeter**2)
            if a<2 or not .25<bw*bh/area<3 or not .5<bw/max(1,bh)<2 or circularity<.48:
                continue
            result.append({'box':np.array([x+x1,y+y1,x+x1+bw,y+y1+bh],float),'score':min(.7,circularity*.7),'kind':'ball','appearance':True})
        return result

    def step(self,frame,detections,t):
        if self.box is None:
            return None
        h,w=frame.shape[:2]
        predicted=self.predict(t)
        center=predicted.reshape(2,2).mean(0)
        age=t-self.last_seen
        gate=min(w*.12, max(20,w*.018)+age*w*.12)
        options=[]
        for d in detections+self.candidates(frame,t):
            b=d['box'];dist=np.linalg.norm(b.reshape(2,2).mean(0)-center)
            ratio=np.prod(b[2:]-b[:2])/max(1,np.prod(self.box[2:]-self.box[:2]))
            if dist<=gate and .18<ratio<5:
                cost=dist/gate*.8+(1-d['score'])*.2
                options.append((cost,d))
        options.sort(key=lambda x:x[0])
        # Collapse neural/visual evidence for the same object before ambiguity check.
        unique=[]
        for cost,d in options:
            if not any(overlap(d['box'],q['box'])>.2 for _,q in unique):
                unique.append((cost,d))
        chosen=unique[0][1] if unique and (len(unique)==1 or unique[1][0]-unique[0][0]>.12) else None
        if chosen and age>1.5:
            chosen=None  # do not attach to a distant white mark after a long disappearance
        if chosen and age>.25:
            c=chosen['box'].reshape(2,2).mean(0)
            self.hits=self.hits+1 if self.pending is not None and np.linalg.norm(c-self.pending)<gate else 1
            self.pending=c
            if self.hits<2:
                chosen=None
        elif not chosen:
            self.pending=None;self.hits=0
        if chosen:
            b=chosen['box'];dt=max(.05,t-self.time)
            velocity=(b.reshape(2,2).mean(0)-self.box.reshape(2,2).mean(0))/dt
            self.velocity=.6*velocity+.4*self.velocity
            self.box=b;self.time=self.last_seen=t
            return observation('ball',t,b,chosen['score'],'appearance' if chosen.get('appearance') else 'detection',w,h)
        if age<=.3:
            return observation('ball',t,predicted,.15,'predicted',w,h)
        return None


def validate_setup(setup):
    if setup.get('format')!='pitchiq-norfair-setup' or setup.get('version')!=1:
        raise ValueError('Export a native setup from PitchIQ first.')
    start,end=setup['segment']['start'],setup['segment']['end']
    if not all(math.isfinite(v) for v in (start,end)) or not 0<=start<end or end-start>20.01:
        raise ValueError('Segments must be between 0 and 20 seconds long.')
    doc=setup['document'];ids={p['id'] for p in doc['players']}
    if len(ids)!=len(doc['players']) or 'ball' not in ids:
        raise ValueError('Invalid roster.')
    if not any(s['playerId']=='ball' for s in setup['seeds']) or not any(s['playerId']!='ball' for s in setup['seeds']):
        raise ValueError('Confirm the ball and at least one player at the start.')
    for p in setup['seeds']+doc['points']:
        b=p['box'];v=[b[k] for k in ('x','y','w','h')]
        if p['playerId'] not in ids or not all(math.isfinite(n) for n in v+[p['time']]) or min(v)<0 or min(v[2:])<=0 or v[0]+v[2]>1.001 or v[1]+v[3]>1.001:
            raise ValueError('Invalid label box or identity.')
    return setup


def run(args):
    started=time.perf_counter()
    setup=validate_setup(json.loads(Path(args.setup).read_text()))
    cap=cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        raise ValueError('Cannot open the original video.')
    fps=cap.get(cv2.CAP_PROP_FPS);total=cap.get(cv2.CAP_PROP_FRAME_COUNT)
    width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH));height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if fps<=0 or total<=0:
        raise ValueError('Video must have a readable frame rate and duration.')
    metadata=setup['video']
    if (width,height)!=(metadata['width'],metadata['height']) or abs(total/fps-metadata['duration'])>.5:
        raise ValueError('This is not the same resolution/duration as the exported setup. Use the original MP4.')
    if Path(args.video).name!=metadata['filename'] and not args.allow_renamed_video:
        raise ValueError('Video filename differs from the setup. Use the original file or --allow-renamed-video after checking it.')
    detector=Detector(args.model,args.threads,args.provider)
    start,end=setup['segment']['start'],min(setup['segment']['end'],total/fps-1/fps)
    if end<=start:
        raise ValueError('Segment starts after the final decodable frame.')
    doc=setup['document'];players=Players();ball=Ball()
    estimator=MotionEstimator(transformations_getter=HomographyTransformationGetter())
    points=[];issues=[];previous=None;stop='Segment complete; review playback and crossings.'
    future=sorted([p for p in doc['points'] if p['time']>start+.05 and p['time']<=end and p['reviewed'] and p.get('evidence')!='predicted'],key=lambda p:p['time'])
    last_key=start
    # Include exact keyframe times in sampling. Video decoding remains sequential.
    times=sorted(set([round(start+i/HZ,4) for i in range(int((end-start)*HZ)+1)]+[p['time'] for p in future]))
    cap.set(cv2.CAP_PROP_POS_FRAMES,max(0,round(start*fps)))
    frame_index=max(0,round(start*fps))-1
    frame=None;t=start;last_detection=-1.;writer=None;ball_issue=False
    try:
        for n,t in enumerate(times):
            target=round(t*fps)
            while frame_index<target:
                ok,frame=cap.read();frame_index+=1
                if not ok:
                    raise ValueError(f'Video decode failed at {t:.2f}s. No partial result was imported.')
            if frame is None:
                raise ValueError('No frame at segment start.')
            # Native detector uses original pixels (up to 1920 wide). Tracker coordinates
            # use the same image; output coordinates are normalized for the browser.
            scale=min(1,1920/width)
            image=cv2.resize(frame,(round(width*scale),round(height*scale))) if scale<1 else frame.copy()
            h,w=image.shape[:2]
            if scene_cut(previous,image):
                stop='Stopped at a possible camera cut. Label the new view and export another segment.'
                issues.append({'playerId':'ball','time':round(t,4),'reason':stop})
                break
            previous=image.copy()
            seeds=setup['seeds'] if n==0 else [p for p in future if last_key<p['time']<=t+.00001]
            seeds=[s for s in seeds if active(doc,s['playerId'],t)]
            last_key=t
            scanned=n==0 or t-last_detection>=.199
            if scanned:
                detections=detector.scan(image,not args.fast)
                last_detection=t
                people=[d for d in detections if d['kind']=='person']
                balls=[d for d in detections if d['kind']=='ball']
            else:
                people=[];balls=[]
            mask=np.full((h,w),255,np.uint8)
            for obj in players.tracker.tracked_objects:
                b=np.clip(obj.estimate.reshape(4),[0,0,0,0],[w-1,h-1,w-1,h-1]).astype(int)
                cv2.rectangle(mask,tuple(b[:2]),tuple(b[2:]),0,-1)
            transform=estimator.update(image,mask=mask)
            if scanned:
                manual_ids={s['playerId'] for s in seeds}
                seeds += [s for s in players.recover(image,people,t,doc) if s['playerId'] not in manual_ids]
            samples,new_issues=players.step(image,people,[s for s in seeds if s['playerId']!='ball'],t,transform,doc)
            points+=samples;issues+=new_issues
            ball_seed=next((s for s in seeds if s['playerId']=='ball'),None)
            if ball_seed:
                ball.seed(pixels(ball_seed['box'],w,h),t);ball_issue=False
                sample=observation('ball',t,ball.box,1,'detection',w,h)
            else:
                if ball.box is not None and t-ball.last_seen<1.5:
                    center=ball.predict(t).reshape(2,2).mean(0)
                    size=min(256,w,h);x,y=np.clip(center-size/2,[0,0],[w-size,h-size]).astype(int)
                    balls += [d for d in detector.crop(image,(x,y,size,size)) if d['kind']=='ball']
                sample=ball.step(image,balls,t)
            if sample:
                points.append(sample)
            if t-ball.last_seen>1.5 and not ball_issue:
                issues.append({'playerId':'ball','time':round(t,4),'reason':'Ball unresolved. Add a confirmed ball box here and rerun; player tracking continues.'})
                ball_issue=True
            if args.preview:
                if writer is None:
                    writer=cv2.VideoWriter(str(args.preview),cv2.VideoWriter_fourcc(*'mp4v'),HZ,(w,h))
                    if not writer.isOpened():
                        raise ValueError('Could not create preview video.')
                for p in samples+([sample] if sample else []):
                    b=pixels(p['box'],w,h).astype(int)
                    color=(0,210,255) if p['playerId']=='ball' else (100,230,120)
                    if p['evidence']=='predicted':color=(180,180,180)
                    cv2.rectangle(image,tuple(b[:2]),tuple(b[2:]),color,1)
                    cv2.putText(image,p['playerId']+(' ?' if p['evidence']=='predicted' else ''),tuple(b[:2]),cv2.FONT_HERSHEY_SIMPLEX,.4,color,1)
                writer.write(image)
            if n%10==0:
                print(f'{t-start:.1f}/{end-start:.1f}s processed | {time.perf_counter()-started:.1f}s elapsed',flush=True)
    finally:
        cap.release()
        if writer is not None:writer.release()
    # Original keyframes remain authoritative during import.
    result={'format':'pitchiq-norfair-result','version':1,'video':metadata,'segment':setup['segment'],'setupKey':setup['setupKey'],'points':points,'issues':issues[:500],
            'summary':{'elapsedSeconds':round(time.perf_counter()-started,3),'processedSeconds':round(t-start,4),'observed':sum(p['evidence']!='predicted' for p in points),'predicted':sum(p['evidence']=='predicted' for p in points),'stopReason':stop},
            'engine':{'tracker':'norfair-2.3.0','detector':'bundled-yolox-tiny','provider':args.provider,'inferenceCalls':detector.calls,'sampleHz':HZ,'fast':args.fast}}
    if len(points)>6000:
        raise ValueError('Result exceeds clip capacity. Export a shorter segment.')
    output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
    temporary=output.with_suffix(output.suffix+'.tmp')
    temporary.write_text(json.dumps(result,separators=(',',':'),allow_nan=False));temporary.replace(output)
    print(json.dumps(result['summary'],indent=2))
    print(f'Import {output} into PitchIQ, review, then Save changes.')
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video',required=True,type=Path)
    parser.add_argument('--setup',required=True,type=Path)
    parser.add_argument('--output',type=Path,default=Path('pitchiq-result.json'))
    parser.add_argument('--preview',type=Path,help='Optional annotated MP4 (10fps diagnostic preview).')
    parser.add_argument('--model',type=Path,default=Path(__file__).resolve().parents[2]/'public/models/yolox-tiny.onnx')
    parser.add_argument('--threads',type=int,default=4)
    parser.add_argument('--provider',default='CPUExecutionProvider')
    parser.add_argument('--fast',action='store_true',help='Disable player tiles; faster but misses small players.')
    parser.add_argument('--allow-renamed-video',action='store_true')
    args=parser.parse_args()
    if not 1<=args.threads<=32:parser.error('--threads must be 1–32')
    inputs={p.resolve() for p in (args.video,args.setup,args.model)}
    if args.output.resolve() in inputs:parser.error('Output must not overwrite input files.')
    if args.preview and args.preview.resolve() in inputs|{args.output.resolve()}:parser.error('Preview must have a separate output path.')
    try:run(args)
    except (ValueError,KeyError,OSError) as exc:parser.exit(1,f'Could not process segment: {exc}\n')


if __name__=='__main__':main()
