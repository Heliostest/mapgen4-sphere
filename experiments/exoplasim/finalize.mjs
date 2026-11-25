import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {relative,resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const [input,native,gcm]=await Promise.all(['input','baseline','gcm'].map(name=>read(`build/exoplasim/${name}.json`)));
assert.equal(native.worldSha256,input.worldSha256);assert.equal(gcm.worldSha256,input.worldSha256);
assert.ok(gcm.config.glaciers.enabled||gcm.config.glaciers.initialHeightM<0,'Refusing unintended native glacier seeding');
assert.equal(gcm.samples,11680);assert.equal(gcm.months.length,12);assert.equal(native.months.length,12);
const fields=['temperatureK','rainMmDay','eastMps','northMps'];let remapResidual=0;
for(let m=0;m<12;m++)for(const key of fields){
 const a=gcm.rawMonths[m][key],b=gcm.months[m][key];let total=0;
 for(let y=0;y<gcm.grid.weights.length;y++)for(let x=0;x<gcm.grid.longitudes;x++)total+=a[y*gcm.grid.longitudes+x]*gcm.grid.weights[y]/(2*gcm.grid.longitudes);
 const mean=b.reduce((s,v)=>s+v,0)/b.length;remapResidual=Math.max(remapResidual,Math.abs(mean-total));
 assert.ok(Math.abs(mean-total)<1e-9,`Nonconservative ${key}`);
 for(const model of [native,gcm]){assert.equal(model.months[m][key].length,1152);assert.ok(model.months[m][key].every(Number.isFinite));}
}
const worldRaw=await readFile(input.worldPath);assert.equal(createHash('sha256').update(worldRaw).digest('hex'),input.worldSha256);
let rasterArea=0,rasterLand=0,landHeight=0;
for(let y=0;y<input.terrain.height;y++){
 const area=Math.sin((90-y*180/input.terrain.height)*Math.PI/180)-Math.sin((90-(y+1)*180/input.terrain.height)*Math.PI/180);
 for(let x=0;x<input.terrain.width;x++){const k=y*input.terrain.width+x;rasterArea+=area;rasterLand+=area*input.terrain.land[k];landHeight+=area*input.terrain.land[k]*input.terrain.elevationM[k];}
}
const savedLand=JSON.parse(worldRaw.toString()).runtime.state.land;
const terrainCheck={rasterLandFraction:rasterLand/rasterArea,savedClimateLandFraction:savedLand.reduce((s,v)=>s+v,0)/savedLand.length,rasterMeanLandHeightM:landHeight/rasterLand};
let worldUrl=relative(process.cwd(),input.worldPath).replaceAll('\\','/');
if(worldUrl.startsWith('..')||isAbsolute(worldUrl)){await copyFile(input.worldPath,'build/exoplasim/input-world.json');worldUrl='build/exoplasim/input-world.json';}
const result={format:'mapgen4-exoplasim-comparison',version:1,createdAt:new Date().toISOString(),worldUrl,worldSha256:input.worldSha256,mesh:input.mesh,calendar:input.calendar,terrainNote:input.terrainNote,native,gcm,validation:{maxConservativeRemapMeanError:remapResidual,terrainCheck}};
await writeFile('experiments/exoplasim/result.json',JSON.stringify(result));
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const annual=(model,key)=>model.months.reduce((s,m)=>s+mean(m[key])*m.seconds,0)/model.months.reduce((s,m)=>s+m.seconds,0);
const rows=native.months.map((a,i)=>{const b=gcm.months[i];return `| ${i+1} | ${(mean(a.temperatureK)-273.15).toFixed(2)} | ${(mean(b.temperatureK)-273.15).toFixed(2)} | ${mean(a.rainMmDay).toFixed(2)} | ${mean(b.rainMmDay).toFixed(2)} |`;});
const report=`# 首年地形对接实跑\n\n输入完整存档 SHA-256：\`${input.worldSha256}\`。地形 ${input.mesh.triangles} 三角形，导出360×180地理栅格，不含显示高度夸张。\n\nExoPlaSim 固定 \`${gcm.upstreamCommit}\`，CPU/WASM FP64积分、FP32诊断，T21、10层、45分钟步长、4 workers，实际运行 ${gcm.samples} 连续步、365模型日，耗时 ${gcm.wallSeconds.toFixed(1)} 秒。首样本 ${JSON.stringify(gcm.firstSample)}；末样本 ${JSON.stringify(gcm.lastSample)}。每个末时刻样本计入它代表的前一个物理步；12个月均满足非闰年月长的准确样本数。\n\n当前模型保留正式存档的物理配置，从匹配的一月圆轨道相位重新生成初态并积分一个物理轨道年，耗时 ${native.wallSeconds.toFixed(1)} 秒；不足一个固定步长的年末尾部为 ${native.tailS.toFixed(1)} 秒，未虚构数据。保留完整地形、路由、冰川和原有模型耦合。两模型的热湿/雪冰初态各自生成，并非相同初态的动力核等价测试。\n\n年平均气温：现有 ${(annual(native,'temperatureK')-273.15).toFixed(2)} °C，ExoPlaSim ${(annual(gcm,'temperatureK')-273.15).toFixed(2)} °C。年平均降水：现有 ${annual(native,'rainMmDay').toFixed(2)} mm/日，ExoPlaSim ${annual(gcm,'rainMmDay').toFixed(2)} mm/日。数值为当前结果描述，不是准确度评分。\n\n| 月 | 现有气温 °C | Exo 2m气温 °C | 现有降水 mm/日 | Exo降水 mm/日 |\n|---|---:|---:|---:|---:|\n${rows.join('\n')}\n\nGaussian有效面积权重至48×24等面积网格的全球平均最大误差 ${remapResidual.toExponential(3)}；单位和经纬方向另有测试。当前模型水量残差 ${native.waterResidualMm.toExponential(3)} mm，耦合焓残差 ${native.energyResidualJm2.toExponential(3)} J/m²。尚未对ExoPlaSim独立验证水热守恒。\n\n## 解释边界\n\n- 这是首年瞬变，不是热身后多年平衡气候。气温差异包含空气变量高度和初态差异；现有模型温度不能标作2m。风为现有单层风与Exo最低sigma层风，不能标作同高度风误差。\n- 两者沿用同一原始物理地形，但求解网格、海陆阈值和栅格化近似不同；小岛和窄山脉不可能逐格相同。这里未做空间观测误差检验，也不能据画面评判准确性。\n- 按对应圆轨道季节对齐，现有轨道年为 ${input.calendar.localPhysicalYearS.toFixed(3)} 秒，Exo使用365×86400秒；比较月份按各自年长归一，均记录实际采样秒数。近地球自转按一日映射。大气成分/辐射、地表反照率和初始雪冰沿用各模型定义，详见result.json中的实际配置/namelist。\n- 原模型和正式存档未被参考结果写回；网页只是只读诊断显示。\n`;
await writeFile('experiments/exoplasim/REPORT.md',report.replace('# 首年地形对接实跑','# 首年地形对接实跑\n\n本报告已修正冰川初始化参数并重新运行全年；旧 −10.58°C 结果包含接入错误，已撤销。当前配置 `NGLACIER=0 / ICESHEETH=-1`，首步实际陆地冰川标记为0。海温仍使用原生271.25K冷启动，未注入外部SST。根因、单变量对照和实际输入检查见 [INPUT-AUDIT.md](INPUT-AUDIT.md)。').replace('\n\nExoPlaSim 固定',`\n\n导出栅格的面积加权陆地比例 ${(100*terrainCheck.rasterLandFraction).toFixed(4)}%，原存档气候网格陆地比例 ${(100*terrainCheck.savedClimateLandFraction).toFixed(4)}%；导出陆地平均物理海拔 ${terrainCheck.rasterMeanLandHeightM.toFixed(1)} 米。这检查导出近似，不保证GCM内部海陆阈值后的面积完全相同。\n\nExoPlaSim 固定`));console.log(JSON.stringify({finalized:true,remapResidual,temperatureC:{native:annual(native,'temperatureK')-273.15,gcm:annual(gcm,'temperatureK')-273.15},rainMmDay:{native:annual(native,'rainMmDay'),gcm:annual(gcm,'rainMmDay')}}));
