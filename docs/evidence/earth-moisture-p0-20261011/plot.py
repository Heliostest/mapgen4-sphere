"""Publication artifacts from measured integration outputs; no image editing."""
import sys,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parents[2]/'build/earth-moisture-p0/python'))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
font=FontProperties(fname='C:/Windows/Fonts/msyh.ttc')
plt.rcParams.update({'font.family':font.get_name(),'axes.unicode_minus':False,'font.size':11,'svg.fonttype':'none'})
read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
before=read('before-1800-continuous.json')['records'][-1]['regions']
after=read('continuous-front-1800-continuous.json')['records'][-1]['regions']
fine=read('continuous-front-450-continuous.json')['records'][-1]['regions']
comparison=read('comparison.json')
names=['亚马孙','刚果','印度','喜马拉雅南麓','青藏','澳洲内陆','澳洲北部','澳洲东部','澳洲西南']
colors={'before':'#8298ac','after':'#146da0','obs':'#292e36','fine':'#cf7048'}
def save(fig,name):
    fig.savefig(ROOT/(name+'.png'),dpi=160,facecolor='white')
    fig.savefig(ROOT/(name+'.svg'),facecolor='white')
    plt.close(fig)
fig,ax=plt.subplots(figsize=(13.5,5.5),layout='constrained')
x=np.arange(9);w=.25
ax.bar(x-w,[r['modelCumulativeMm'] for r in before],w,label='修复前 · 1800 s',color=colors['before'])
ax.bar(x,[r['modelCumulativeMm'] for r in after],w,label='当前候选 · 1800 s',color=colors['after'])
ax.bar(x+w,[r['observedAnnualMm'] for r in before],w,label='GPCC 1991–2020',color=colors['obs'])
ax.set_xticks(x,names);ax.set_ylabel('降水深度（mm / 365 个实际地球日）');ax.set_ylim(0,3200)
ax.grid(axis='y',alpha=.18);ax.set_axisbelow(True);ax.legend(ncols=3,frameon=False)
ax.set_title('P0 区域验收未通过：全年真实积分与同一陆地支持区的观测',loc='left',fontweight='bold',pad=18)
fig.supxlabel('48×24 物理气柱；GPCC 有效格 × 球面交叠 × 模型陆地比例。通量来自逐步积分，未使用季节跳转。',fontsize=10)
save(fig,'annual-comparison')
for data,label,key,name in [(before,'修复前 · 1800s','before','before-assessment'),(after,'当前候选 · 1800s','after','after-assessment')]:
    fig,axes=plt.subplots(1,2,figsize=(13.5,5),layout='constrained')
    axes[0].barh(x-.18,[r['modelCumulativeMm'] for r in data],.36,label=label,color=colors[key])
    axes[0].barh(x+.18,[r['observedAnnualMm'] for r in data],.36,label='GPCC 1991–2020',color=colors['obs'])
    axes[0].set_yticks(x,names);axes[0].invert_yaxis();axes[0].set_xlim(0,3200);axes[0].grid(axis='x',alpha=.18);axes[0].set_xlabel('累计降水（mm / 365 日）');axes[0].legend(frameon=False,fontsize=10)
    for i,ls in [(2,'-'),(3,'--'),(4,':'),(8,'-.')]:
        axes[1].plot(range(1,13),data[i]['modelMonthlyMm'],label=names[i],lw=2,ls=ls)
    axes[1].set_xlim(1,12);axes[1].set_ylim(0,500);axes[1].set_xticks([1,3,6,9,12]);axes[1].grid(alpha=.18);axes[1].set_ylabel('月降水（mm）');axes[1].set_xlabel('月份');axes[1].legend(frameon=False)
    fig.suptitle(label+'：相同视域、尺度、起始库存与观测支持区',x=.01,ha='left',fontweight='bold')
    save(fig,name)
fig,axes=plt.subplots(3,3,figsize=(13.5,9),sharex=True,sharey=True,layout='constrained')
for i,ax in enumerate(axes.flat):
    obs=before[i]['observedMonthlyMm'];obs=[obs[str(k)] for k in range(12)] if isinstance(obs,dict) else obs
    for y,label,key in [(before[i]['modelMonthlyMm'],'前 · 1800s','before'),(after[i]['modelMonthlyMm'],'候选 · 1800s','after'),(fine[i]['modelMonthlyMm'],'候选 · 450s','fine'),(obs,'GPCC','obs')]:
        ax.plot(range(1,13),y,label=label,color=colors[key],lw=1.8,ls='--' if key=='fine' else '-')
    ax.set_title(names[i],loc='left');ax.set_xlim(1,12);ax.set_ylim(0,500);ax.grid(alpha=.18);ax.set_xticks([1,3,6,9,12])
    if i%3==0:ax.set_ylabel('mm / 日历月')
    if i>=6:ax.set_xlabel('月份')
axes[0,0].legend(frameon=False,fontsize=9,ncols=2)
fig.suptitle('同口径月降水：步长收敛不能消除区域闭合错误',x=.01,ha='left',fontweight='bold')
fig.supxlabel('第 0 日 = 春分 3 月 20 日；日历月按实际轨道年缩放；积分 365 日，无年总量外推。',fontsize=10)
save(fig,'monthly-comparison')
fig,axes=plt.subplots(1,2,figsize=(13.5,5),layout='constrained')
for ax,key,label in [(axes[0],'P450minus900','450s − 900s 累计 P（mm）'),(axes[1],'netTransport','全年水汽净输运（mm；正 = 输入）')]:
    vals=[r[key] for r in comparison['regions']] if key=='P450minus900' else [r['wholeArea']['netTransport'] for r in after]
    ax.barh(names,vals,color=[colors['after'] if v>=0 else '#b65548' for v in vals]);ax.axvline(0,color='#292e36',lw=.7);ax.invert_yaxis();ax.grid(axis='x',alpha=.18);ax.set_xlabel(label)
axes[0].set_title('数值收敛：最大片区相对差 0.21%',loc='left')
axes[1].set_title('物理验收：印度仍输出，青藏与内陆输入过多',loc='left')
fig.supxlabel('降水采用 GPCC 有效陆地支持区；输运采用整个矩形面积，以保持气柱预算闭合。两种面积不混用。',fontsize=10)
save(fig,'convergence-supply')
print('Saved annual-comparison, monthly-comparison, convergence-supply as PNG and SVG.')
