"""Native inference for the same Apache-2.0 YOLOX export used by PitchIQ."""
import cv2
import numpy as np
import onnxruntime as ort


def overlap(a, b):
    lo, hi = np.maximum(a[:2], b[:2]), np.minimum(a[2:], b[2:])
    inter = float(np.prod(np.maximum(0, hi-lo)))
    return inter / max(1e-6, np.prod(a[2:]-a[:2])+np.prod(b[2:]-b[:2])-inter)


def suppress(items):
    kept = []
    for item in sorted(items, key=lambda d: -d['score']):
        if not any(d['kind'] == item['kind'] and overlap(d['box'], item['box']) > .45 for d in kept):
            kept.append(item)
    return kept[:80]


class Detector:
    def __init__(self, model, threads=4, provider='CPUExecutionProvider'):
        if provider not in ort.get_available_providers():
            raise ValueError(f'{provider} is not available. Installed providers: {ort.get_available_providers()}')
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = threads
        self.session = ort.InferenceSession(str(model), opts, providers=[provider, 'CPUExecutionProvider'] if provider != 'CPUExecutionProvider' else [provider])
        self.name = self.session.get_inputs()[0].name
        self.calls = 0
        grids, strides = [], []
        for stride in (8, 16, 32):
            yy, xx = np.mgrid[:416//stride, :416//stride]
            grids.append(np.stack((xx, yy), -1).reshape(-1, 2))
            strides.extend([stride]*xx.size)
        self.grid, self.strides = np.concatenate(grids), np.array(strides)[:, None]

    def crop(self, frame, rect):
        height, width = frame.shape[:2]
        x, y, w, h = map(int, rect)
        crop = frame[y:y+h, x:x+w]
        if crop.size == 0:
            return []
        ratio = min(416/w, 416/h)
        image = np.full((416, 416, 3), 114, dtype=np.uint8)
        image[:int(h*ratio), :int(w*ratio)] = cv2.resize(crop, (int(w*ratio), int(h*ratio)))
        tensor = image.transpose(2, 0, 1)[None].astype(np.float32)
        raw = self.session.run(None, {self.name: tensor})[0]
        self.calls += 1
        if raw.shape != (1, 3549, 85):
            raise ValueError('Expected the bundled raw YOLOX-Tiny 416 model (1,3549,85).')
        raw = raw[0]
        centers = (raw[:, :2]+self.grid)*self.strides/ratio
        sizes = np.exp(np.clip(raw[:, 2:4], -20, 20))*self.strides/ratio
        result = []
        for cls, kind, threshold in ((0, 'person', .22), (32, 'ball', .12)):
            scores = raw[:, 4]*raw[:, 5+cls]
            for i in np.flatnonzero(scores >= threshold):
                if not (0 <= centers[i, 0] <= w and 0 <= centers[i, 1] <= h):
                    continue
                box = np.r_[np.maximum(centers[i]-sizes[i]/2, 0), np.minimum(centers[i]+sizes[i]/2, [w, h])]+[x,y,x,y]
                if min(box[2:]-box[:2]) >= 1 and np.isfinite(box).all():
                    result.append({'box':box, 'score':float(scores[i]), 'kind':kind})
        return suppress(result)

    def scan(self, frame, detailed=True):
        h, w = frame.shape[:2]
        rects = [(0, 0, w, h)]
        if detailed and max(w,h)>640:
            size = min(640, h, w)
            xs = sorted(set(list(range(0, w-size+1, int(size*.8)))+[w-size]))
            ys = sorted(set(list(range(0, h-size+1, int(size*.8)))+[h-size]))
            rects += [(x,y,size,size) for y in ys for x in xs]
        return suppress([d for rect in rects for d in self.crop(frame, rect)])


def appearance(frame, box):
    x1,y1,x2,y2 = box.astype(int)
    h,w = frame.shape[:2]
    crop = frame[max(0,y1):min(h,y1+max(1,(y2-y1)//2)), max(0,x1):min(w,x2)]
    if crop.size == 0:
        return np.zeros(64, np.float32)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0,1], None, [16,4], [0,180,0,256]).flatten()
    return hist/max(1, hist.sum())


def appearance_distance(a, b):
    return float(np.sqrt(max(0, 1-np.sqrt(a*b).sum()))) if a.sum() and b.sum() else .5
