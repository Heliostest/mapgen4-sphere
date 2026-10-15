"""Plots from completed full-terrain integrations; no fitted or synthetic series."""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parents[2]/'build/earth-moisture-p0/python'))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
font=FontProperties(fname='C:/Windows/Fonts/msyh.ttc')
plt.rcParams.update({'font.family':font.get_name(),'font.size':10,'axes.unicode_minus':False,'axes.spines.top':False,'axes.spines.right':False,'svg.fonttype':'none'})
labels={'control':'默认方案','bulk':'仅加风驱动蒸发','transport':'共享水汽组合','transport-bulk':'组合 + 风驱动蒸发'}
colors={'observed':'#253d48','control':'#98a2ad','bulk':'#d5643c','transport':'#148b8b','transport-bulk':'#8366ac'}
runs={k:json.loads((ROOT/f'{k}.json').read_text(encoding='utf-8')) for k in labels}
east={k:next(r for r in d['gpcc'] if r['name']=='East Asia') for k,d in runs.items()}
obs=np.array(east['control']['observedMonthlyMm']);months=np.arange(1,13)
def save(fig,name):
 for ext in ['png','svg']:fig.savefig(ROOT/f'{name}.{ext}',dpi=155,facecolor='white',bbox_inches='tight')
 plt.close(fig)
fig,(ax,bars)=plt.subplots(1,2,figsize=(13.5,5.5),gridspec_kw={'width_ratios':[2.2,1.1]})
fig.subplots_adjust(left=.07,right=.98,bottom=.19,top=.80,wspace=.42)
fig.suptitle('东亚降水：当前方案几乎没有夏雨',x=.07,ha='left',y=.98,fontweight='bold',fontsize=19)
fig.text(.07,.905,'30–45°N，110–135°E 的有效陆地平均 · 完整地形第一轨道年 · GPCC 1991–2020 正常值',color='#5b6771',fontsize=11)
ax.plot(months,obs,color=colors['observed'],lw=2.6,marker='o',ms=4,label='GPCC 观测')
for key in labels:
 ax.plot(months,east[key]['monthlyMm'],color=colors[key],lw=1.9,ls='--' if key=='control' else '-',label=labels[key])
ax.set(xticks=months,xlim=(.7,12.3),ylim=(0,None),xlabel='月份',ylabel='月降水（mm，含雪水当量）')
ax.grid(axis='y',alpha=.16);ax.legend(ncol=2,fontsize=9,frameon=False,loc='upper left')
names=['GPCC 观测']+list(labels.values());vals=[sum(obs)]+[east[k]['modelAnnualMm'] for k in labels]
bars.barh(range(5),vals,color=[colors['observed']]+[colors[k] for k in labels],height=.54)
bars.set(yticks=range(5),yticklabels=names,xlabel='年降水（mm）',xlim=(0,max(vals)*1.2));bars.invert_yaxis();bars.grid(axis='x',alpha=.13)
for i,v in enumerate(vals):bars.text(v+max(vals)*.025,i,f'{v:.1f}',va='center',fontsize=10)
fig.text(.07,.06,'共享组合还改变辐射分配、海冰传热和表面反照率，不能把差异归因于单个开关。\n第一年瞬变并非平衡气候；默认与仅加蒸发方案的总量和夏季规律都未通过。',color='#5b6771',fontsize=10)
save(fig,'east-asia-monthly')

titles={'East Asia':'东亚统计区','South China':'华南示意区','Yangtze':'长江中下游示意区','North China':'华北示意区','Northeast China':'东北示意区','Korea Japan':'日韩示意区'}
fig,axes=plt.subplots(2,3,figsize=(14,8),sharex=True)
fig.subplots_adjust(left=.06,right=.98,bottom=.11,top=.87,wspace=.24,hspace=.38)
fig.suptitle('区域差异：雨量接近不等于雨带位置、季节都正确',x=.06,ha='left',y=.98,fontweight='bold',fontsize=18)
for ax,(name,title) in zip(axes.flat,titles.items()):
 rr={k:next(r for r in d['gpcc'] if r['name']==name) for k,d in runs.items()}
 ref=rr['bulk'];b=ref['bounds']
 ax.plot(months,ref['observedMonthlyMm'],color=colors['observed'],lw=2.1,marker='o',ms=3,label='GPCC 观测')
 for key in ['bulk','transport','transport-bulk']:ax.plot(months,rr[key]['monthlyMm'],color=colors[key],lw=1.6,label=labels[key])
 ax.set_title(f"{title} · {b['south']}–{b['north']}°N / {b['west']}–{b['east']}°E",fontsize=10,loc='left')
 ax.set(xticks=[1,3,5,7,9,11],xlim=(1,12),ylim=(0,None),ylabel='mm/月');ax.grid(axis='y',alpha=.15)
handles,legend=axes.flat[0].get_legend_handles_labels();fig.legend(handles,legend,loc='upper center',bbox_to_anchor=(.52,.945),ncol=4,frameon=False)
fig.text(.06,.025,'矩形区仅用于诊断，不是行政区或真实流域边界。气候网格只有 48×24，不能据此验证梅雨锋、台风或局地暴雨。',color='#5b6771',fontsize=10)
save(fig,'regional-monthly')
