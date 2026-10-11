import sys,json
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-seaice-p1/plot-libs').resolve()))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
folder=Path('docs/evidence/earth-seaice-causal-20261011')
a=json.loads((folder/'acceptance.json').read_text());ref=json.loads((folder/'nsidc-same-grid.json').read_text())
font=FontProperties(fname='C:/Windows/Fonts/msyh.ttc');plt.rcParams['font.family']=font.get_name()
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False,'figure.facecolor':'#fafafa','axes.facecolor':'#fafafa'})
names=['导热关 / 输送关','仅导热','仅冰下输送','导热 + 输送，修复前','短波修复，1800s','短波修复，900s']
colors=['#9a9b9b','#c78641','#778ca3','#ba5850','#155b85','#67a2b8'];months=np.arange(1,13)
fig,axes=plt.subplots(2,2,figsize=(13,8),constrained_layout=True)
for row,h in enumerate(['north','south']):
 for col,q in enumerate(['extentMillionKm2','areaMillionKm2']):
  ax=axes[row,col]
  for i,r in enumerate(a['runs']):
   ax.plot(months,[m[q] for m in r['hemispheres'][h]['monthly']],label=names[i],color=colors[i],ls='--' if i==5 else '-',lw=2 if i in [0,4] else 1.25)
  ax.plot(months,[m[h][q] for m in a['monthlyObserved']],label='NSIDC 1981–2010，同网格',color='#2e7655',lw=2.5,marker='o',ms=3)
  ax.set(title=('北半球' if h=='north' else '南半球')+' · '+('15% 范围' if col==0 else '浓度积分面积'),xlabel='月份',ylabel='百万 km²',xticks=months);ax.grid(axis='y',alpha=.15)
axes[0,0].legend(fontsize=8,loc='upper left',ncol=2)
fig.suptitle('六组同库存真实积分 · NSIDC 固定有效海洋交集\n两侧先形成月平均浓度，再在 48×24 网格施加 15% 阈值；候选仍未通过',fontproperties=font,fontsize=14)
fig.savefig(folder/'same-grid-seasonality.png',dpi=180);plt.close(fig)

grid=ref['grid'];n=grid['width']*grid['height'];lat=np.rad2deg(np.arcsin(1-2*(np.arange(grid['height'])+.5)/grid['height']));weights=np.array(ref['supportM2']).reshape(grid['height'],grid['width'])
fig,axes=plt.subplots(1,3,figsize=(14,4),constrained_layout=True)
for i in [0,1,2,3,4]:
 label=a['runs'][i]['name'];raw=json.loads((folder/(label+'-seaice.json')).read_text());secs=raw['monthlyCoverageS'][7]
 for ax,name in zip(axes,['cover','airK','conductionUpWm2']):
  v=np.array(raw['monthlyFields'][name][7]).reshape(grid['height'],grid['width'])/secs
  y=np.divide((v*weights).sum(1),weights.sum(1),out=np.full(grid['height'],np.nan),where=weights.sum(1)>0)
  ax.plot(lat[12:],y[12:],color=colors[i],label=names[i],lw=2 if i in [0,4] else 1.25)
obs=np.array(ref['concentration'][7]).reshape(grid['height'],grid['width']);oy=np.divide((obs*weights).sum(1),weights.sum(1),out=np.full(grid['height'],np.nan),where=weights.sum(1)>0)
axes[0].plot(lat[12:],oy[12:],color='#2e7655',label='NSIDC 同网格',marker='o',ms=3,lw=2.5)
for ax,title,ylabel in zip(axes,['月平均覆盖代理','空气温度','冰层向上导热'],['浓度 / 覆盖比例','K','W/m²，全柱通量']):
 ax.set(title=title,xlabel='南纬（°）',ylabel=ylabel,xlim=(-80,-40));ax.grid(alpha=.15)
axes[0].legend(fontsize=8);fig.suptitle('南半球八月 · 冷空气 / 导热 / 质量到面积的反馈\n仅导热与双开组接近；冰下输送未抵消异常扩展',fontproperties=font,fontsize=13)
fig.savefig(folder/'south-winter-cause.png',dpi=180);plt.close(fig)
print('saved same-grid-seasonality.png and south-winter-cause.png')
