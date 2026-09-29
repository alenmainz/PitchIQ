import unittest
import numpy as np
import cv2
from detector import overlap, suppress
from track_segment import Ball, Players, active, normalized, scene_cut, validate_setup


def doc():
    return {'players':[{'id':'A1','starter':True},{'id':'A2','starter':True},{'id':'sub','starter':False},{'id':'ball','starter':True}], 'substitutions':[]}


def frame():
    f=np.full((180,320,3),(30,110,40),np.uint8)
    f[50:100,80:100]=(210,30,20)
    return f


def seed(player='A1',x=.25):
    return {'playerId':player,'box':{'x':x,'y':50/180,'w':20/320,'h':50/180}}


class TrackingTests(unittest.TestCase):
    def test_detection_is_unique_and_ball_separate(self):
        a={'kind':'person','box':np.array([1,1,10,10]),'score':.9}
        self.assertEqual(len(suppress([a,a,{**a,'kind':'ball'}])),2)
        self.assertEqual(overlap(a['box'],a['box']),1)

    def test_player_miss_prediction_is_bounded_and_recovery_retains_identity(self):
        p=Players();f=frame();d=doc()
        samples,_=p.step(f,[],[seed()],0,None,d)
        self.assertEqual(samples[0]['playerId'],'A1')
        for i in range(1,4):
            samples,_=p.step(f,[{'box':np.array([80,50,100,100]),'score':.9}],[],i/10,None,d)
        samples,_=p.step(f,[],[],.4,None,d)
        self.assertEqual(samples[0]['evidence'],'predicted')
        samples,_=p.step(f,[],[],.7,None,d)
        self.assertFalse(samples)
        samples,_=p.step(f,[{'box':np.array([81,50,101,100]),'score':.9}],[],.8,None,d)
        self.assertEqual(samples[0]['playerId'],'A1')
        self.assertEqual(samples[0]['evidence'],'detection')

    def test_new_people_do_not_gain_roster_names(self):
        p=Players()
        samples,_=p.step(frame(),[{'box':np.array([80,50,100,100]),'score':.9}],[],0,None,doc())
        self.assertEqual(samples,[])

    def test_ambiguous_crossing_does_not_confirm_either_identity(self):
        p=Players();f=frame()
        p.step(f,[],[seed('A1'),seed('A2',.255)],0,None,doc())
        samples,_=p.step(f,[{'box':np.array([81,50,101,100]),'score':.9}],[],.1,None,doc())
        self.assertTrue(all(s['evidence']=='predicted' for s in samples))

    def test_later_label_and_substitution(self):
        p=Players();d=doc();f=frame()
        p.step(f,[],[seed()],0,None,d)
        d['substitutions']=[{'time':1,'off':'A1','on':'sub'}]
        self.assertFalse(active(d,'A1',1))
        self.assertTrue(active(d,'sub',1))
        samples,_=p.step(f,[],[seed('sub')],1,None,d)
        self.assertEqual([s['playerId'] for s in samples],['sub'])

    def test_ball_follows_white_circle_and_rejects_long_line(self):
        f=frame();cv2.circle(f,(150,130),3,(245,245,245),-1)
        cv2.line(f,(180,100),(180,160),(255,255,255),2)
        ball=Ball();ball.seed([144,127,151,134],0)
        sample=ball.step(f,[],.1)
        self.assertIsNotNone(sample)
        self.assertEqual(sample['evidence'],'appearance')
        self.assertLess(sample['box']['x']*320,160)

    def test_ball_cannot_snap_to_distant_object_after_gap(self):
        ball=Ball();ball.seed([100,100,107,107],0)
        d={'kind':'ball','box':np.array([200,100,207,107]),'score':.99}
        self.assertIsNone(ball.step(frame(),[d],2))

    def test_ball_recovery_requires_repeated_evidence(self):
        ball=Ball();ball.seed([100,100,107,107],0)
        d={'kind':'ball','box':np.array([101,100,108,107]),'score':.9}
        self.assertIsNone(ball.step(frame(),[d],.5))
        self.assertIsNotNone(ball.step(frame(),[d],.6))

    def test_output_boxes_are_clipped_or_rejected(self):
        self.assertIsNone(normalized([-20,10,-1,20],320,180))
        self.assertIsNone(normalized([float('nan'),0,1,1],320,180))
        self.assertEqual(normalized([-2,10,20,30],320,180)['x'],0)

    def test_scene_cut(self):
        self.assertFalse(scene_cut(frame(),frame()))
        self.assertTrue(scene_cut(frame(),np.full_like(frame(),255)))

    def test_invalid_setup(self):
        with self.assertRaises(ValueError):validate_setup({})
        with self.assertRaises(ValueError):validate_setup({'format':'pitchiq-norfair-setup','version':1,'segment':{'start':0,'end':90}})

    def test_distinctive_reentry_needs_three_scans(self):
        p=Players();f=frame();d=doc();p.step(f,[],[seed()],0,None,d)
        p.tracker.tracked_objects=[]
        detection={'box':np.array([80,50,100,100]),'score':.9}
        self.assertEqual(p.recover(f,[detection],4,d),[])
        self.assertEqual(p.recover(f,[detection],4.2,d),[])
        recovered=p.recover(f,[detection],4.4,d)
        self.assertEqual(recovered[0]['playerId'],'A1')
        samples,_=p.step(f,[detection],recovered,4.4,None,d)
        self.assertEqual(samples[0]['evidence'],'reidentified')

    def test_same_kit_players_cannot_be_reidentified_by_color(self):
        p=Players();f=frame();d=doc();p.step(f,[],[seed()],0,None,d)
        p.profiles['A2']=p.profiles['A1'].copy();p.last_seen['A2']=0
        p.tracker.tracked_objects=[]
        detection={'box':np.array([80,50,100,100]),'score':.9}
        for t in (4,4.2,4.4,4.6):self.assertEqual(p.recover(f,[detection],t,d),[])


if __name__=='__main__':unittest.main()
