"""Norfair motion filtering for browser detections; no user Python setup.

PitchIQ's appearance and ambiguity checks choose identities before measurements
reach this filter. Norfair smooths observations and estimates short gaps. It
does not invent identities for unlabelled detections.
"""
import json
import numpy as np
from norfair import Tracker, Detection
from norfair.camera_motion import CoordinatesTransformation

tracker = None
scale = 1.0
offset = np.zeros(2)
dimensions = np.ones(2)

class FrameTransform(CoordinatesTransformation):
    def rel_to_abs(self, points):
        return (points - offset) / scale

    def abs_to_rel(self, points):
        return points * scale + offset

def process(payload):
    global tracker, scale, offset, dimensions
    data = json.loads(payload)
    if data.get('reset') or tracker is None:
        tracker = Tracker(distance_function='euclidean', distance_threshold=10000,
                          initialization_delay=0, hit_counter_max=8)
        scale = 1.0
        offset = np.zeros(2)
        dimensions = np.array([data.get('width',1920),data.get('height',1080)])
    camera = data.get('camera', {})
    if camera.get('reliable'):
        factor = camera.get('scale',1)
        scale *= factor
        offset = offset * factor + np.array([camera.get('dx',0),camera.get('dy',0)]) * dimensions
    allowed = set(data.get('active', []))
    clear = set(data.get('clear', []))
    tracker.tracked_objects = [obj for obj in tracker.tracked_objects
                               if obj.label in allowed and obj.label not in clear]
    detections = []
    for sample in data.get('samples', []):
        if sample['id'] not in allowed or sample.get('evidence') == 'predicted':
            continue
        b = sample['box']
        points = np.array([[b['x'],b['y']],[b['x']+b['w'],b['y']+b['h']]]) * dimensions
        detections.append(Detection(points=points,label=sample['id']))
    result = []
    for obj in tracker.update(detections,coord_transformations=FrameTransform()):
        points = obj.estimate / dimensions
        x,y = points[0]; right,bottom = points[1]
        if not np.isfinite(points).all() or right<=x or bottom<=y:
            continue
        result.append({'id':obj.label,'box':{'x':float(x),'y':float(y),'w':float(right-x),'h':float(bottom-y)}})
    return json.dumps(result)
