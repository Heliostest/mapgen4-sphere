"""Summarize frozen runs; never fit regional coefficients or overwrite old evidence."""
import sys,json,gzip
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-moisture-p0/python').resolve()))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties

ROOT=Path(__file__).parent
order=['native','wind10','thermal','both10','windColumn','bothColumn']
labels={'native':'原生风与温度','wind10':'替换地面风','thermal':'约束空气与表面温度','both10':'地面风 + 温度约束','windColumn':'替换水汽输送风','bothColumn':'输送风 + 温度约束'}
colors=dict(zip(order,['#697784','#258b9c','#db9248','#9653a0','#136a55','#c45667']))
runs={k:json.loads((ROOT/f'{k}.json').read_text()) for k in order}
grids={k:json.loads(gzip.decompress((ROOT/f'{k}-grid.json.gz').read_bytes())) for k in order}
forcing=json.loads(gzip.decompress((ROOT/'forcing.json.gz').read_bytes()))['fields']
weights=np.array(grids['native']['support']);weights/=weights.sum(axis=1)[:,None]
ref=[{'name':r['name'],'bounds':r['bounds'],'fields':{k:(np.array(a)@weights[i]).tolist() for k,a in forcing.items()}} for i,r in enumerate(runs['native']['gpcc'])]
(ROOT/'reference-regions.json').write_text(json.dumps(ref,indent=2)+'\n')
metrics={}
for key,d in runs.items():
    regions=[]
    for r in d['gpcc']:
        pred=np.array(r['monthlyMm']);obs=np.array(r['observedMonthlyMm']);diag=r['diagnostics']
        regions.append({'name':r['name'],'annualMm':float(pred.sum()),'observedAnnualMm':float(obs.sum()),
            'peakMonth':int(pred.argmax()+1),'observedPeakMonth':int(obs.argmax()+1),
            'monthlyMAEMm':float(np.abs(pred-obs).mean()),'monthlyRMSEMm':float(np.sqrt(np.mean((pred-obs)**2))),
            'JJA':{k:float(np.average(v[5:8],weights=[30,31,31])) for k,v in diag.items() if k!='seaC'},
            'componentsAnnualMm':{k:sum(a) for k,a in r['componentsMonthlyMm'].items()}})
    metrics[key]={'regions':regions,'meanRegionalMAE13':float(np.mean([r['monthlyMAEMm'] for r in regions])),
                  'meanRegionalMAEEastAsia6':float(np.mean([r['monthlyMAEMm'] for r in regions[:6]])),
                  'externalMeanWm2':d['records'][-1]['budget']['externalJm2']/(d['records'][-1]['day']*86400),
                  'externalAbsMeanWm2':d['records'][-1]['budget']['externalAbsJm2']/(d['records'][-1]['day']*86400),
                  'clippedComponentFraction':d['intervention']['clippedComponents']/max(1,d['intervention']['windComponents'])}
(ROOT/'metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
lines=['# Frozen diagnostic metrics','','Numbers are first-orbit diagnostics; regional MAE averages are unweighted across the specified regions.','','| Run | East Asia annual mm | East Asia MAE mm/month | 6-region MAE | 13-region MAE | External net W/m² | External absolute W/m² |','|---|---:|---:|---:|---:|---:|---:|']
for k in order:
    m=metrics[k];r=m['regions'][0]
    lines.append(f"| {k} | {r['annualMm']:.2f} | {r['monthlyMAEMm']:.2f} | {m['meanRegionalMAEEastAsia6']:.2f} | {m['meanRegionalMAE13']:.2f} | {m['externalMeanWm2']:.2f} | {m['externalAbsMeanWm2']:.2f} |")
for i,r in enumerate(runs['native']['gpcc']):
    lines+=['',f"## {r['name']}",'','| Run | Annual mm | Peak month | Monthly MAE mm | JJA north wind m/s | JJA north vapor flux kg/(m s) | JJA net vapor import mm/day |','|---|---:|---:|---:|---:|---:|---:|',f"| GPCC | {r['observedAnnualMm']:.2f} | {int(np.argmax(r['observedMonthlyMm']))+1} | — | — | — | — |"]
    for k in order:
        m=metrics[k]['regions'][i];j=m['JJA'];lines.append(f"| {k} | {m['annualMm']:.2f} | {m['peakMonth']} | {m['monthlyMAEMm']:.2f} | {j['windNorthMps']:.2f} | {j['vaporNorthKgMs']:.2f} | {j['netVaporImportMmDay']:.2f} |")
(ROOT/'METRICS.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')

font=FontProperties(fname='C:/Windows/Fonts/msyh.ttc')
plt.rcParams.update({'font.family':font.get_name(),'font.size':10,'axes.unicode_minus':False,'axes.spines.top':False,'axes.spines.right':False})
def save(fig,name):
    fig.savefig(ROOT/f'{name}.png',dpi=150,facecolor='white',bbox_inches='tight');plt.close(fig)
month=np.arange(1,13)
titles=['东亚统计区','华南','长江中下游','华北','东北','日韩']
fig,axes=plt.subplots(2,3,figsize=(14,8.8),sharex=True)
fig.subplots_adjust(left=.06,right=.98,bottom=.13,top=.83,hspace=.4,wspace=.26)
fig.suptitle('约束风场与温度后，东亚降雨怎样变化？',x=.06,y=.98,ha='left',fontsize=20,fontweight='bold')
for i,ax in enumerate(axes.flat):
    ax.plot(month,runs['native']['gpcc'][i]['observedMonthlyMm'],'o-',color='#1d303d',lw=2.2,ms=3,label='GPCC 1991–2020')
    for k in order:ax.plot(month,runs[k]['gpcc'][i]['monthlyMm'],color=colors[k],lw=1.5,ls='--' if 'Column' in k else '-',label=labels[k])
    ax.set(title=titles[i],xlabel='月份',ylabel='降水 mm/月',xticks=[1,3,5,7,9,11],xlim=(1,12),ylim=(0,None));ax.grid(axis='y',alpha=.16)
h,l=axes.flat[0].get_legend_handles_labels();fig.legend(h,l,loc='upper center',bbox_to_anchor=(.53,.94),ncol=4,frameon=False,fontsize=9)
fig.text(.06,.065,'完整地形 · 相同初始库存 · 第一轨道年 · 48×24 等面积气候格点 · 相同 GPCC 有效陆地支持',fontsize=10,color='#54616c')
fig.text(.06,.025,'外部强迫仅用于定位误差。月均风缺少天气尺度波动；单层空气与 2 m 温度的对应仍是近似。正式模型未切换。',fontsize=10,color='#54616c')
save(fig,'rainfall-comparison')

fig,axes=plt.subplots(2,3,figsize=(14,7.7),sharex=True)
fig.subplots_adjust(left=.06,right=.98,bottom=.18,top=.85,hspace=.34,wspace=.28)
fig.suptitle('季节性北向输送与气温：原模型和再分析的差距',x=.06,y=.98,ha='left',fontsize=19,fontweight='bold')
for col,i in enumerate([1,2,3]):
    r=runs['native']['gpcc'][i];f=ref[i]['fields'];ax=axes[0,col]
    ax.plot(month,r['diagnostics']['windNorthMps'],color=colors['native'],lw=2,label='原模型')
    ax.plot(month,f['v10'],color=colors['wind10'],lw=2,label='NCEP 10 m 风')
    ax.plot(month,f['vColumn'],color=colors['windColumn'],ls='--',lw=2,label='NCEP 水汽输送风')
    ax.axhline(0,color='#acb3b8',lw=.8);ax.set(title=titles[i],ylabel='北向风 m/s（向北为正）');ax.grid(alpha=.12)
    ax=axes[1,col];ax.plot(month,r['diagnostics']['airC'],color=colors['native'],lw=2,label='原模型空气')
    ax.plot(month,np.array(f['airK'])-273.15,color=colors['wind10'],lw=2,label='NCEP 2 m 空气')
    ax.plot(month,r['diagnostics']['landC'],color='#aa9479',lw=1.5,ls='--',label='原模型陆地表面')
    ax.set(ylabel='温度 °C',xlabel='月份',xticks=[1,3,5,7,9,11]);ax.grid(alpha=.12)
axes[0,0].legend(frameon=False,fontsize=9);axes[1,0].legend(frameon=False,fontsize=9)
fig.text(.06,.055,'NCEP–NCAR Reanalysis 1，1991–2020；源资料月均值经球面面积重映射与有效陆地加权。',color='#54616c')
fig.text(.06,.015,'输送风 = 月均 q 与风的乘积积分 / 月均水汽积分（300 hPa 至地表）；不是含天气协方差的完整 IVT。',color='#54616c')
save(fig,'seasonal-state')

fig,axes=plt.subplots(1,3,figsize=(15,5.6))
fig.subplots_adjust(left=.06,right=.96,bottom=.2,top=.82,wspace=.28)
lon=np.arange(48)*7.5-176.25;lat=np.rad2deg(np.arcsin(1-2*(np.arange(24)+.5)/24));x,y=np.meshgrid(lon,lat)
land=np.array(grids['native']['land']).reshape(24,48)
for ax,k in zip(axes,['native','wind10','windColumn']):
    f=grids[k]['fields'];u=np.average(np.array(f['vaporEastKgMs'])[5:8],axis=0,weights=[30,31,31]).reshape(24,48);v=np.average(np.array(f['vaporNorthKgMs'])[5:8],axis=0,weights=[30,31,31]).reshape(24,48)
    net=np.average(np.array(f['netVaporImportMmDay'])[5:8],axis=0,weights=[30,31,31]).reshape(24,48)
    c=ax.pcolormesh(np.linspace(-180,180,49),np.rad2deg(np.arcsin(np.linspace(1,-1,25))),net,cmap='BrBG',vmin=-6,vmax=6,shading='flat')
    ax.contour(x,y,land,levels=[.5],colors='#37454c',linewidths=.6)
    q=ax.quiver(x,y,u,v,scale=700,color='#243744',width=.005)
    ax.set(xlim=(95,155),ylim=(10,55),title=labels[k],xlabel='经度 °E',ylabel='纬度 °N');ax.quiverkey(q,.7,-.14,50,'50 kg/(m s)',labelpos='E')
fig.colorbar(c,ax=axes,shrink=.8,label='净水汽输入 mm/日')
fig.suptitle('夏季水汽输送路径：风向变化是否带来净输入？',x=.06,y=.97,ha='left',fontsize=19,fontweight='bold')
fig.text(.06,.06,'箭头为模型柱水汽 × 风的 6–8 月平均；底色为求解器实际净水汽输送（含扩散）。',color='#54616c')
fig.text(.06,.02,'海岸线按粗网格 50% 陆地率绘制；此图用于大尺度诊断，不代表梅雨锋位置或观测完整 IVT。',color='#54616c')
save(fig,'moisture-pathways')
print('\n'.join(lines[:12]))
