import sys, json
from pathlib import Path
sys.path.insert(0, str(Path('build/earth-seaice-p1/plot-libs').resolve()))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
folder=Path('docs/evidence/earth-speedyweather-20261012')
out=Path('build/earth-speedyweather')
a=json.loads((folder/'acceptance.json').read_text(encoding='utf-8'))
j=json.loads((out/'annual-statistics.json').read_text(encoding='utf-8'))
z=json.loads((out/'zonal-circulation.json').read_text(encoding='utf-8'))
font=FontProperties(fname='C:/Windows/Fonts/msyh.ttc')
plt.rcParams.update({'font.family':font.get_name(),'font.size':10,'axes.spines.top':False,'axes.spines.right':False,'figure.facecolor':'#fafafa','axes.facecolor':'#fafafa'})
regions=a['gpcc']['regions'];months=np.arange(1,13)
fig,axs=plt.subplots(2,2,figsize=(13,8),layout='constrained')
names=[v['name'] for v in regions];yy=np.arange(len(regions))
ax=axs[0,0];ax.barh(yy-.18,[v['observedAnnualMm'] for v in regions],.36,label='GPCC 1991—2020');ax.barh(yy+.18,[v['modelAnnualMm'] for v in regions],.36,label='Speedy 2006');ax.set_yticks(yy,names);ax.invert_yaxis();ax.set_xlabel('降水 mm/年');ax.legend();ax.set_title('固定共有有效陆地支持 · 不是同库存因果对照')
for h,ax,title in [('north',axs[0,1],'北半球'),('south',axs[1,1],'南半球')]:
    row=a['nsidc']['hemispheres'][h]['monthly']
    ax.plot(months,[v['observed']['extentMillionKm2'] for v in row],'-o',label='NSIDC 1981—2010');ax.plot(months,[v['extentMillionKm2'] for v in row],'-o',label='Speedy 2006');ax.set_xticks(months);ax.set_xlabel('月份');ax.set_ylabel('范围 百万 km²');ax.set_title(title+' · 固定支持 / 月均浓度≥15%');ax.legend();ax.set_ylim(bottom=0)
ax=axs[1,0]
for name in ['India','Himalaya foreland','Australia southwest','Australia north']:
    r=next(v for v in regions if v['name']==name)
    line=ax.plot(months,r['monthlyMm'],label=name)[0];ax.plot(months,r['observedMonthlyMm'],'--',color=line.get_color(),alpha=.65)
ax.set_xticks(months);ax.set_xlabel('月份');ax.set_ylabel('降水 mm/月');ax.set_title('实线：Speedy · 虚线：GPCC');ax.legend(fontsize=8)
fig.suptitle('T32 / 8 层湿大气 · 五年预热后的一年试验 · 尚未通过区域气候验收',fontsize=14)
fig.savefig(folder/'observation-comparison.png',dpi=160);fig.savefig(folder/'observation-comparison.svg');plt.close(fig)
fig,axs=plt.subplots(1,2,figsize=(13,4.8),layout='constrained')
lat=np.array(z['latitudeDegrees']);sigma=np.array(z['sigmaFull']);half=np.array(z['sigmaHalf']);u=np.array(z['annualZonalWindMps']).T;psi=np.array(z['annualSigmaMassStreamfunctionKgS']).T/1e9
ax=axs[0];maxu=max(1,float(abs(u).max()));cs=ax.contourf(lat,sigma,u,levels=np.linspace(-maxu,maxu,21),cmap='RdBu_r');ax.contour(lat,sigma,u,levels=[0],colors='k',linewidths=.8);fig.colorbar(cs,ax=ax,label='东向风 m/s');ax.set_title('真实年平均纬向风 · 高空急流/信风')
ax=axs[1];maxp=max(1,float(abs(psi).max()));cs=ax.contourf(lat,half,psi,levels=np.linspace(-maxp,maxp,21),cmap='RdBu_r');ax.contour(lat,half,psi,levels=np.linspace(-maxp,maxp,11),colors='k',linewidths=.5);fig.colorbar(cs,ax=ax,label='sigma 质量流函数 10^9 kg/s');ax.set_title('实际 ps×v 积分 · 未强行闭合底边界')
for ax in axs:ax.set_xlabel('纬度 °（南负北正）');ax.set_ylabel('sigma（地表气压比例）');ax.set_ylim(1,0);ax.set_xlim(-90,90);ax.set_xticks(np.arange(-90,91,30))
fig.suptitle('2006 年 · Native Gaussian 网格的真实环流诊断',fontsize=14)
fig.savefig(folder/'zonal-circulation.png',dpi=170);fig.savefig(folder/'zonal-circulation.svg');plt.close(fig)
audits=j['audits'];days=[(np.datetime64(v['time'])-np.datetime64(j['start']))/np.timedelta64(1,'D') for v in audits]
fig,axs=plt.subplots(1,3,figsize=(13,3.8),layout='constrained')
axs[0].plot(days,[v['airMassRelative']*1e6 for v in audits]);axs[0].set_ylabel('相对初始质量 ppm');axs[0].set_title('气压面积积分 / g')
axs[1].plot(days,[v['airWaterResidualMm'] for v in audits]);axs[1].set_ylabel('Δ水柱 − 蒸发 + 降水 mm');axs[1].set_title('大气水预算残差')
axs[2].plot(days,[v['landWaterResidualMm'] for v in audits]);axs[2].set_ylabel('陆地水预算残差 mm');axs[2].set_title('土壤/雪/降水/蒸发/径流')
for ax in axs:ax.axvline(1826,ls='--',color='#888');ax.set_xlabel('真实积分天数');ax.grid(alpha=.2)
fig.suptitle('六年全程逐日预算 · 虚线后为统计年 · 未补偿残差',fontsize=13)
fig.savefig(folder/'budget-audit.png',dpi=160);plt.close(fig)
