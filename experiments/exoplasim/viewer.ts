import {validateFrame,FIELDS,type ClimateFrame} from './data.ts';
import {installProbePanel,type ProbeLocation} from './probe-panel.ts';
const $=(id:string)=>document.getElementById(id)!;
const frame=$('world') as HTMLIFrameElement,status=$('status'),month=$('month') as HTMLSelectElement,field=$('field') as HTMLSelectElement;
let result:any,model='gcm',doc:Document,win:any;
let probePanel:ReturnType<typeof installProbePanel>|null=null;
const wait=async(read:()=>any)=>{const start=performance.now();while(!read()){if(performance.now()-start>60000)throw new Error('球体加载超时');await new Promise(r=>setTimeout(r,100));}};
function show(){
 const index=Number(month.value)-1,a:ClimateFrame=result.native.months[index],b:ClimateFrame=result.gcm.months[index];
 win.mapgen4Comparison.show(model==='gcm'?b:a,field.value);
 $('native').setAttribute('aria-pressed',String(model==='native'));$('gcm').setAttribute('aria-pressed',String(model==='gcm'));
 $('description').textContent=`${model==='gcm'?'ExoPlaSim · CPU/WASM FP64 · T21 / 10 层':'现有模型 · 原物理配置 · 48×24 单层'} · ${month.value} 月平均`;
 $('legend').textContent=field.value==='temperature'?'气温 −80 至 +60 °C':field.value==='precipitation'?'降水 0–20 mm/日':'风速 0–30 m/s；箭头指向流向';
 const mean=(a:ArrayLike<number>)=>Array.from(a).reduce((s,v)=>s+v,0)/a.length;
 const metrics=[['气温 °C',mean(a.temperatureK)-273.15,mean(b.temperatureK)-273.15],['降水 mm/日',mean(a.rainMmDay),mean(b.rainMmDay)],['风矢量模 m/s',mean(Array.from(a.eastMps,(u,i)=>Math.hypot(u,a.northMps[i]))),mean(Array.from(b.eastMps,(u,i)=>Math.hypot(u,b.northMps[i])))]];
 $('metrics').replaceChildren(...metrics.map(([label,a,b])=>{const row=document.createElement('tr');for(const v of [label,Number(a).toFixed(2),Number(b).toFixed(2),(Number(b)-Number(a)).toFixed(2)]){const td=document.createElement('td');td.textContent=String(v);row.append(td);}return row;}));
 (window as any).comparisonReady={model,month:Number(month.value),field:field.value,worldSha256:result.worldSha256};
 probePanel?.refresh(model,Number(month.value));
}
try{
 const response=await fetch('./result.json');if(!response.ok)throw new Error('尚无运行结果，请按复跑说明生成 result.json');result=await response.json();
 if(result.format!=='mapgen4-exoplasim-comparison'||result.version!==1||result.native.worldSha256!==result.worldSha256||result.gcm.worldSha256!==result.worldSha256)throw new Error('结果来源不匹配');
 if(!result.gcm.config.glaciers.enabled&&result.gcm.config.glaciers.initialHeightM>=0)throw new Error('旧结果含错误的冰川初始化，已撤销；请等待修正重跑结果');
 for(const m of ['native','gcm']){if(result[m].months.length!==12)throw new Error('结果缺少月份');for(let i=0;i<12;i++){const f=result[m].months[i];if(f.month!==i+1||f.width!==48||f.height!==24||!(f.seconds>0))throw new Error('月份或网格不完整');validateFrame(f);}}
 for(let i=1;i<=12;i++){const option=document.createElement('option');option.value=String(i);option.textContent=`${i}月`;month.append(option);}month.value='7';
 frame.src=`../../embed.html?mode=editor&mesh=${result.mesh.spacing<4?'high':'normal'}&comparison=1`;
 await new Promise<void>(resolve=>frame.addEventListener('load',()=>resolve(),{once:true}));doc=frame.contentDocument!;win=frame.contentWindow;
 await wait(()=>doc.querySelector('#terrain-generation')?.getAttribute('data-pending')==='false'&&win.mapgen4Comparison);
 // Verify the exact saved world before displaying a result for it.
 const source=await fetch(`../../${result.worldUrl}`);if(!source.ok)throw new Error('地形存档读取失败');const bytes=await source.arrayBuffer();
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==result.worldSha256)throw new Error('地形已改变，请重新运行对照');
 const transfer=new win.DataTransfer();transfer.items.add(new win.File([bytes],'comparison-world.json',{type:'application/json'}));const input=doc.querySelector('#terrain-load') as HTMLInputElement;input.files=transfer.files;input.dispatchEvent(new win.Event('change',{bubbles:true}));
 await wait(()=>doc.querySelector('#terrain-file-status')?.textContent?.includes('Complete simulation restored'));
 const style=doc.createElement('style');style.textContent=`html,body{margin:0!important;background:#edf1f3!important}#ui{display:block!important;padding:0!important}#ui>*:not(#map){display:none!important}#map{width:min(100vw,100vh)!important;height:min(100vw,100vh)!important;margin:auto!important}#mapgen4{width:100%!important;height:100%!important}`;doc.head.append(style);
 const navigate=doc.querySelector('#button-navigate') as HTMLButtonElement;if(navigate.getAttribute('aria-pressed')!=='true')navigate.click();
 const frames=()=>new Promise<void>(resolve=>win.requestAnimationFrame(()=>win.requestAnimationFrame(()=>resolve())));
 const selectProbe=(location:ProbeLocation)=>{
  win.mapgen4Comparison.setProbe([(location.longitude+180)/360,(90-location.latitude)/180]);
  probePanel!.select(location);probePanel!.refresh(model,Number(month.value));
 };
 probePanel=installProbePanel({root:$('location-probe'),native:result.native.months,gcm:result.gcm.months,
  onMonth:value=>{month.value=String(value);show();},onClear:()=>win.mapgen4Comparison.setProbe(null),
  onLocate:async(latitude,longitude)=>{
   if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)throw new Error('请输入有效经纬度：纬度 −90～90，经度 −180～180');
   win.mapgen4Comparison.focus([(longitude+180)/360,(90-latitude)/180]);await frames();
   const hit=win.mapgen4Comparison.pick([.5,.5]);selectProbe({latitude,longitude,elevationM:hit?.elevationM});
  }});
 const canvas=doc.querySelector('#mapgen4') as HTMLCanvasElement;
 canvas.setAttribute('aria-label','可旋转球体，点击放置地点探针');canvas.title='点击：地点探针 · 拖动：旋转 · 滚轮：缩放';
 let gesture:{id:number;x:number;y:number;distance:number}|null=null;
 canvas.addEventListener('pointerdown',event=>{if(event.button===0&&event.isPrimary)gesture={id:event.pointerId,x:event.clientX,y:event.clientY,distance:0};});
 canvas.addEventListener('pointermove',event=>{if(gesture?.id===event.pointerId)gesture.distance=Math.max(gesture.distance,Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y));});
 canvas.addEventListener('pointerup',async event=>{
  const g=gesture;if(!g||g.id!==event.pointerId)return;gesture=null;
  if(g.distance>5||Math.hypot(event.clientX-g.x,event.clientY-g.y)>5||event.altKey)return;
  const box=canvas.getBoundingClientRect(),point=[(event.clientX-box.left)/box.width,(event.clientY-box.top)/box.height];await frames();
  const location=win.mapgen4Comparison.pick(point);if(location)selectProbe(location);else probePanel!.miss();
 });
 for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{gesture=null;});
 $('view').addEventListener('change',()=>{( $('view') as HTMLSelectElement).value.split(',').forEach((v,i)=>{const slider=doc.querySelector(`#slider-${i?'y':'x'} input`) as HTMLInputElement;slider.value=v;slider.dispatchEvent(new win.Event('input',{bubbles:true}));});});
 for(const m of ['native','gcm'])$(m).addEventListener('click',()=>{model=m;show();});month.addEventListener('change',show);field.addEventListener('change',show);
 for(const id of ['native','gcm','month','field','view'])($(id) as HTMLInputElement).disabled=false;
 ($('download') as HTMLAnchorElement).href='./result.json';
 $('provenance').textContent=`地形 ${result.mesh.triangles.toLocaleString()} 三角形 · 同一物理高程；SHA-256 ${result.worldSha256.slice(0,12)}…。ExoPlaSim ${result.gcm.samples.toLocaleString()} 个连续物理步；全年逐步月平均。`;
 $('initialization').textContent='已修正上版误植的初始冰川标记。本次保持原生冷启动：未提供海温场，海洋混合层初始约 −1.9°C，并非现有模型的地球海温。需要单独检验热身与初态敏感性。';
 status.textContent='已修正初始冰川标记 · 冷启动首年';show();
}catch(error){status.textContent=String(error);status.setAttribute('data-error','true');}
