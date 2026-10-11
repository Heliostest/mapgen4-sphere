"""Scientific plots of actual integrations, not WebGL screenshots."""
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
plt.rcParams.update({'font.family':font.get_name(),'axes.unicode_minus':False,'font.size':10,'svg.fonttype':'none'})
label=sys.argv[1] if len(sys.argv)>1 else 'coastal-deposition-v2'
def read(name):return json.loads((ROOT/name).read_text(encoding='utf-8'))
before=read('baseline-1800-continuous.json')['records'][-1]['regions']
after=read(f'{label}-1800-continuous.json')['records'][-1]['regions']
fine_run=read(f'{label}-450-continuous.json') if (ROOT/f'{label}-450-continuous.json').exists() else None
fine=fine_run['records'][-1]['regions'] if fine_run and fine_run['records'][-1]['day']==365 and fine_run.get('strictRestoreNextStepExact') else None
names=['亚马孙','刚果','印度','喜马拉雅南麓','青藏','澳洲内陆','澳洲北部','澳洲东岸','澳洲西南']
colors=['#8298ac','#146da0','#292e36','#cf7048']
def save(fig,name):
    for ext in ['png','svg']:fig.savefig(ROOT/(name+'.'+ext),dpi=150,facecolor='white')
    plt.close(fig)
fig,ax=plt.subplots(figsize=(13.2,5),layout='constrained');x=np.arange(9);w=.25
for offset,data,title,color in [(-w,before,'修复前 · 1800 s',colors[0]),(0,after,'当前候选 · 1800 s',colors[1]),(w,before,'GPCC 1991–2020',colors[2])]:
    ax.bar(x+offset,[r['observedAnnualMm'] if offset==w else r['modelCumulativeMm'] for r in data],w,label=title,color=color)
ax.set_xticks(x,names);ax.set_ylabel('降水深度（mm / 365 个实际地球日）');ax.grid(axis='y',alpha=.18);ax.set_axisbelow(True);ax.legend(frameon=False,ncols=3)
ax.set_title('同初始库存、同一 GPCC 有效陆地支持区：区域年降水验收',loc='left',fontweight='bold',pad=14)
fig.supxlabel('真实逐步积分；实际陆地降雨量 ÷ 陆地比例；GPCC 有效格 × 球面交叠 × 模型陆地比例。图表不是 WebGL 截图。',fontsize=9)
save(fig,'annual-comparison')
fig,axes=plt.subplots(3,3,figsize=(13.2,9),sharex=True,layout='constrained')
for i,ax in enumerate(axes.flat):
    obs=before[i]['observedMonthlyMm'];obs=[obs[str(k)] for k in range(12)] if isinstance(obs,dict) else obs
    data=[(before[i]['modelMonthlyMm'],'修复前',colors[0],'-'),(after[i]['modelMonthlyMm'],'当前 1800s',colors[1],'-'),(obs,'GPCC',colors[2],'-')]
    if fine:data.append((fine[i]['modelMonthlyMm'],'当前 450s',colors[3],'--'))
    for p,title,color,style in data:ax.plot(range(1,13),p,label=title,color=color,lw=1.7,ls=style)
    ax.set_title(names[i],loc='left');ax.set_xlim(1,12);ax.set_ylim(bottom=0);ax.grid(alpha=.18);ax.set_xticks([1,3,6,9,12])
    if i%3==0:ax.set_ylabel('mm / 日历月')
    if i>=6:ax.set_xlabel('月份')
axes[0,0].legend(frameon=False,fontsize=9,ncols=2)
fig.suptitle('日历月验收：季节排序与年总量分别检查',x=.01,ha='left',fontweight='bold')
fig.supxlabel('第 0 日为春分 3 月 20 日；日历月按实际轨道年缩放；累计 365 日，无年总量外推。',fontsize=9)
save(fig,'monthly-comparison')
fig,axes=plt.subplots(1,2,figsize=(13.2,5),layout='constrained')
for ax,data,title in [(axes[0],before,'修复前'),(axes[1],after,'当前候选')]:
    vals=[r['wholeArea']['netTransport'] for r in data]
    ax.barh(names,vals,color=[colors[1] if p>=0 else '#b65548' for p in vals]);ax.axvline(0,color=colors[2],lw=.7);ax.invert_yaxis();ax.grid(axis='x',alpha=.18);ax.set_xlabel('全年水汽净输运（mm；正 = 输入）');ax.set_title(title,loc='left')
fig.supxlabel('净输运采用完整区域面积以闭合水汽预算；降水与 GPCC 比较采用有效陆地支持区，面积口径明确区分。',fontsize=9)
save(fig,'supply-comparison')
fig,axes=plt.subplots(1,3,figsize=(13.2,4.3),sharex=True,layout='constrained')
for ax,i in zip(axes,[2,3,8]):
    winds=(fine or after)[i]['monthlyWindMps']
    ax.plot(range(1,13),winds['east'],color=colors[1],lw=2,label='向东 u')
    ax.plot(range(1,13),winds['north'],color=colors[3],lw=2,label='向北 v')
    ax.axhline(0,color=colors[2],lw=.7);ax.grid(alpha=.18);ax.set_title(names[i],loc='left');ax.set_xticks([1,3,6,9,12]);ax.set_xlabel('月份')
axes[0].set_ylabel('区域有效陆地面积与实际时间加权风速（m/s）');axes[0].legend(frameon=False,ncols=2)
fig.suptitle('实际低层风诊断 · '+('450s' if fine else '1800s'),x=.01,ha='left',fontweight='bold')
fig.supxlabel('正值向东 / 向北；这是模型诊断，没有用 GPCC 降水产品代替风观测。',fontsize=9)
save(fig,'monthly-winds')
if fine:
    coarse=read(f'{label}-900-continuous.json')['records'][-1]['regions']
    diff=[f['modelCumulativeMm']-c['modelCumulativeMm'] for f,c in zip(fine,coarse)]
    fig,ax=plt.subplots(figsize=(9,5),layout='constrained');ax.barh(names,diff,color=colors[1]);ax.invert_yaxis();ax.axvline(0,color=colors[2],lw=.7);ax.grid(axis='x',alpha=.18);ax.set_xlabel('450s − 900s 的全年降水差（mm）');ax.set_title('时间步收敛不能替代 GPCC 区域验收',loc='left')
    save(fig,'convergence')
print('Saved actual-integration scientific PNG/SVG plots.')
