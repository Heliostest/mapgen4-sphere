"""Plot saved full-terrain integrations; no fitted or synthetic series."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[2] / 'build/earth-moisture-p0/python'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties

font = FontProperties(fname='C:/Windows/Fonts/msyh.ttc')
plt.rcParams.update({'font.family': font.get_name(), 'font.size': 10,
                    'axes.unicode_minus': False, 'axes.spines.top': False,
                    'axes.spines.right': False, 'svg.fonttype': 'none'})
labels = {'control': '正式默认', 'transport-only': '仅共享水汽',
          'radiation-only': '仅空气散热调整', 'shared-core': '共享水汽 + 散热调整',
          'buoyancy-old': '再开启原浮力实验', 'buoyancy': '浮力实验修复后',
          'boundary': '边界层热压风（未采用）'}
colors = {'control': '#939da7', 'transport-only': '#699eca', 'radiation-only': '#cdac74',
          'shared-core': '#13868c', 'buoyancy-old': '#b9a2cc', 'buoyancy': '#835aa8',
          'boundary': '#d17b47', 'observed': '#233e49'}
runs = {k: json.loads((ROOT / f'{k}.json').read_text(encoding='utf-8')) for k in labels}
metrics = json.loads((ROOT / 'metrics.json').read_text(encoding='utf-8'))
months = list(range(1, 13))

def save(fig, name):
    for ext in ['png', 'svg']:
        fig.savefig(ROOT / f'{name}.{ext}', dpi=155, facecolor='white', bbox_inches='tight')
    plt.close(fig)

east = {k: d['gpcc'][0] for k, d in runs.items()}
fig, (ax, bars) = plt.subplots(1, 2, figsize=(14, 5.8), gridspec_kw={'width_ratios': [1.5, 1]})
fig.subplots_adjust(left=.07, right=.96, bottom=.21, top=.79, wspace=.49)
fig.suptitle('东亚降水：先拆开因果，再判断改动', x=.07, ha='left', y=.97, fontsize=20, fontweight='bold')
fig.text(.07, .89, '30–45°N / 110–135°E · 同一第零天库存 · 完整地形第一轨道年 · GPCC 1991–2020 正常值', color='#5b6771', fontsize=11)
ax.plot(months, east['control']['observedMonthlyMm'], color=colors['observed'], lw=2.4, marker='o', ms=4, label='GPCC 观测')
for k in ['control', 'transport-only', 'radiation-only', 'shared-core', 'buoyancy']:
    ax.plot(months, east[k]['monthlyMm'], color=colors[k], lw=1.9, label=labels[k], ls='--' if k == 'control' else '-')
ax.set(xticks=months, xlim=(.8, 12.2), ylim=(0, None), xlabel='月份', ylabel='月降水（mm，含雪水当量）')
ax.grid(axis='y', alpha=.16)
ax.legend(ncol=2, frameon=False, fontsize=9, loc='upper left')
order = ['control', 'radiation-only', 'transport-only', 'shared-core', 'buoyancy-old', 'buoyancy']
vals = [sum(east['control']['observedMonthlyMm'])] + [east[k]['modelAnnualMm'] for k in order]
bars.barh(range(len(vals)), vals, color=[colors['observed']] + [colors[k] for k in order], height=.55)
bars.set(yticks=range(len(vals)), yticklabels=['GPCC 观测'] + [labels[k] for k in order], xlabel='年降水（mm）', xlim=(0, 850))
bars.invert_yaxis()
bars.grid(axis='x', alpha=.12)
for i, v in enumerate(vals):
    bars.text(v + 12, i, f'{v:.1f}', va='center', fontsize=10)
delta = east['buoyancy']['modelAnnualMm'] - east['buoyancy-old']['modelAnnualMm']
fig.text(.07, .075, f'本次触发修复的独立影响：{delta:+.2f} mm/年；几百毫米的恢复主要来自已有求解与散热选项配合。', color='#3e525d', fontsize=11)
fig.text(.07, .03, '散热比例 0.5 是因果对照参数，尚未校准；第一年瞬变不代表平衡气候，正式默认未切换。', color='#5b6771', fontsize=10)
save(fig, 'causal-comparison')

titles = ['东亚统计区', '华南示意区', '长江中下游示意区', '华北示意区', '东北示意区', '日韩示意区']
fig, axes = plt.subplots(2, 3, figsize=(14, 8.4), sharex=True)
fig.subplots_adjust(left=.06, right=.98, bottom=.12, top=.84, wspace=.24, hspace=.43)
fig.suptitle('东亚成雨机制：总量恢复，季节偏差仍在', x=.06, ha='left', y=.98, fontsize=19, fontweight='bold')
for i, (ax, title) in enumerate(zip(axes.flat, titles)):
    ref = runs['control']['gpcc'][i]
    b = ref['bounds']
    ax.plot(months, ref['observedMonthlyMm'], color=colors['observed'], lw=2.2, marker='o', ms=3, label='GPCC 观测')
    for k in ['shared-core', 'buoyancy', 'boundary']:
        ax.plot(months, runs[k]['gpcc'][i]['monthlyMm'], color=colors[k], lw=1.8, label=labels[k], ls='--' if k == 'boundary' else '-')
    ax.set_title(f"{title} · {b['south']}–{b['north']}°N / {b['west']}–{b['east']}°E", fontsize=10, loc='left', pad=10)
    ax.set(xticks=[1, 3, 5, 7, 9, 11], xlim=(1, 12), ylim=(0, None), ylabel='mm/月')
    ax.grid(axis='y', alpha=.15)
handles, legend = axes.flat[0].get_legend_handles_labels()
fig.legend(handles, legend, loc='upper center', bbox_to_anchor=(.52, .93), ncol=4, frameon=False)
fig.text(.06, .06, '华南、长江的修复后雨峰仍是 8 月、7 月（观测均为 6 月）。热压风能提前南方雨峰，却使华北雨峰跑到 4 月。', color='#3e525d', fontsize=11)
fig.text(.06, .02, '矩形仅作诊断，并非行政区。48×24 等面积气候网格无法验证梅雨锋、台风与局地暴雨；所有方案仍为第一年瞬变。', color='#5b6771', fontsize=10)
save(fig, 'regional-monthly')
