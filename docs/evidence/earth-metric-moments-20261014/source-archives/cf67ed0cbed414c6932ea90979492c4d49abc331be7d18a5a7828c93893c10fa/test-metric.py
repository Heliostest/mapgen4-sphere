# bind: metric-fit.py
import json,sys,importlib.util,copy,unittest,os
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-polar-pressure/python-libs').resolve()))
import numpy as np
spec=importlib.util.spec_from_file_location('metric',Path(__file__).with_name('metric-fit.py'));metric=importlib.util.module_from_spec(spec);spec.loader.exec_module(metric)
graph=json.loads(Path('docs/evidence/earth-native-graph-wind-20261014/raw/c4-graphs-v1-24-graph.json').read_text())
def cubic_norm(g):
    A=np.array(g['area']);la=np.array(g['lat']);lo=np.array(g['lon']);x=np.c_[np.cos(la)*np.cos(lo),np.cos(la)*np.sin(lo),np.sin(la)];e=np.c_[-np.sin(lo),np.cos(lo),np.zeros(len(A))];nn=np.cross(x,e)
    a=np.array(g['from'])-1;b=np.array(g['to'])-1;w=np.array(g['conductance']);C=np.zeros((len(A),4))
    for i,j in ((a,b),(b,a)):
        u=np.sum(x[j]*e[i],axis=1)/np.sqrt(A[i]);v=np.sum(x[j]*nn[i],axis=1)/np.sqrt(A[i])
        for k,z in enumerate((u**3,np.sqrt(3)*u*u*v,np.sqrt(3)*u*v*v,v**3)):np.add.at(C[:,k],i,w*z)
    return np.linalg.norm(C)
class MetricTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.new,cls.report=metric.fit_metric(graph)
    def test_cubic_defect_reduced(self):self.assertLess(cubic_norm(self.new),.8*cubic_norm(graph))
    def test_positive_floor_and_fixed_geometry(self):
        self.assertTrue(np.all(np.array(self.new['conductance'])>=.01*np.array(graph['conductance'])))
        for k in ('area','lat','lon','from','to','distance'):self.assertEqual(self.new[k],graph[k])
    def test_deterministic(self):self.assertEqual(metric.fit_metric(graph)[0],self.new)
    def test_invalid_options(self):
        for kw in ({'penalty':0},{'penalty':float('nan')},{'floor':0},{'floor':1},{'maxiter':0},{'maxiter':1.5}):
            with self.subTest(kw=kw),self.assertRaises(ValueError):metric.fit_metric(graph,**kw)
    def test_invalid_geometry(self):
        for key,value in [('area',0),('conductance',float('nan')),('distance',-1),('from',0),('to',len(graph['area'])+1)]:
            g=copy.deepcopy(graph);g[key][0]=value
            with self.subTest(key=key),self.assertRaises(ValueError):metric.fit_metric(g)
    def test_exhaustion(self):
        with self.assertRaises(RuntimeError):metric.fit_metric(graph,maxiter=1)
if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(MetricTests))
    Path('build/earth-metric-moments/'+os.environ['VC_RUN_NAME']+'.json').write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors)}))
    sys.exit(0 if result.wasSuccessful() else 1)
