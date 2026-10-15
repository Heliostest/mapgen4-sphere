import unittest
from remap import np,latitude_edges,matrices,apply,pressure_weights

class RemapTests(unittest.TestCase):
    def test_constant_and_global_integral(self):
        lat=np.linspace(90,-90,73);lon=np.arange(144)*2.5
        edges=np.linspace(1,-1,25);weights=matrices(lat,lon,edges,np.arange(48)*7.5-176.25)
        field=np.random.default_rng(42).normal(size=(12,73,144))
        np.testing.assert_allclose(apply(np.ones_like(field),weights),1,atol=2e-14)
        source_edges=latitude_edges(lat)
        expected=np.sum(field*(source_edges[:-1]-source_edges[1:])[None,:,None],axis=(1,2))/(2*144)
        np.testing.assert_allclose(apply(field,weights).mean(axis=(1,2)),expected,atol=1e-14)
    def test_seam_and_vector_sign(self):
        lat=[45,-45];lon=np.arange(4)*90
        w=matrices(lat,lon,[1,0,-1],[-135,-45,45,135])
        # Source cells centered on 0 and 270 overlap the destination centered -45.
        a=apply(np.tile([2.,0,0,6],(2,1)),w)
        np.testing.assert_allclose(a,[[3,4,1,0],[3,4,1,0]])
        np.testing.assert_allclose(apply(np.full((2,4),-3),w),-3)
    def test_gaussian_area(self):
        nodes,w=np.polynomial.legendre.leggauss(94)
        e=latitude_edges(np.rad2deg(np.arcsin(nodes[::-1])),True)
        np.testing.assert_allclose(e[:-1]-e[1:],w[::-1],atol=2e-15)
    def test_underground_and_partial_layer(self):
        lev=[1000,925,850,700,600,500,400,300]
        dp=pressure_weights(lev,np.array([[[1050.,975.,800.,500.,250.]]]))
        np.testing.assert_allclose(dp.sum(axis=1),[[[75000,67500,50000,20000,0]]])
        self.assertEqual(dp[0,0,0,2],0)
        self.assertEqual(dp[0,2,0,2],0)
        self.assertEqual(dp[0,3,0,2],15000)
        self.assertTrue(np.all(dp[np.array(lev)[None,:,None,None]>np.array([[[1050.,975.,800.,500.,250.]]])[:,None,:,:]]==0))

if __name__=='__main__':unittest.main()
