import {probeYear,probeCSV,type ProbeYear,type MonthlyFrame} from './probe.ts';
export interface ProbeLocation {latitude:number;longitude:number;elevationM?:number;}
type Options={root:HTMLElement;native:MonthlyFrame[];gcm:MonthlyFrame[];onMonth:(month:number)=>void;onLocate:(latitude:number,longitude:number)=>Promise<void>;onClear:()=>void;};
const nativeColor='#647f93',gcmColor='#159783';
const fixed=(v:number,d=1)=>v.toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
const latLabel=(v:number)=>`${v<0?'南纬':'北纬'} ${Math.abs(v).toFixed(2)}°`;
const lonLabel=(v:number)=>`${v<0?'西经':'东经'} ${Math.abs(v).toFixed(2)}°`;
const axis=(v:number)=>new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1}).format(v);

function chart(kind:'rain'|'temperature',a:ProbeYear,b:ProbeYear,selected:number,model:string){
 const w=360,h=166,left=42,right=10,top=16,bottom=27,pw=w-left-right,ph=h-top-bottom;
 const av=a.months.map(m=>kind==='rain'?m.precipitationMm:m.temperatureC),bv=b.months.map(m=>kind==='rain'?m.precipitationMm:m.temperatureC);
 let min=0,max=Math.max(...av,...bv,1);
 if(kind==='rain'){const power=10**Math.floor(Math.log10(max));max=[1,2,5,10].map(x=>x*power).find(x=>x>=max)!;}
 else {min=Math.floor(Math.min(...av,...bv)/10)*10;max=Math.ceil(Math.max(...av,...bv)/10)*10;if(max===min)max=min+10;}
 const y=(v:number)=>top+ph*(1-(v-min)/(max-min)),step=pw/12,x=(i:number)=>left+step*(i+.5);
 let svg=`<svg viewBox="0 0 ${w} ${h}" data-chart="${kind}" role="group" aria-label="${kind==='rain'?'逐月降水量，毫米':'逐月平均气温，摄氏度'}">`;
 for(let i=0;i<=4;i++){const v=min+(max-min)*i/4;svg+=`<line x1="${left}" y1="${y(v)}" x2="${w-right}" y2="${y(v)}" class="chart-grid"/><text x="${left-6}" y="${y(v)+3}" text-anchor="end">${axis(v)}</text>`;}
 if(kind==='rain')for(let i=0;i<12;i++){
  svg+=`<rect x="${x(i)-step*.32}" y="${y(av[i])}" width="${step*.28}" height="${y(0)-y(av[i])}" fill="${nativeColor}" opacity="${model==='native'?1:.65}"/><rect x="${x(i)+step*.04}" y="${y(bv[i])}" width="${step*.28}" height="${y(0)-y(bv[i])}" fill="${gcmColor}" opacity="${model==='gcm'?1:.65}"/>`;
 }
 else for(const [values,color] of [[av,nativeColor],[bv,gcmColor]] as const){
  svg+=`<polyline points="${values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`;
  svg+=values.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="${color}"/>`).join('');
 }
 for(let i=0;i<12;i++)svg+=`<g class="chart-month ${selected===i+1?'selected':''}" data-month="${i+1}" tabindex="0" role="button" aria-label="查看${i+1}月，现有${fixed(av[i])}${kind==='rain'?'毫米':'摄氏度'}，ExoPlaSim ${fixed(bv[i])}${kind==='rain'?'毫米':'摄氏度'}" aria-pressed="${selected===i+1}"><title>${i+1}月 · 现有 ${fixed(av[i])} / Exo ${fixed(bv[i])}${kind==='rain'?' mm':' °C'}</title><rect x="${left+i*step}" y="${top-3}" width="${step}" height="${ph+bottom}" class="month-hit"/><text x="${x(i)}" y="${h-8}" text-anchor="middle">${i+1}</text></g>`;
 return svg+'</svg>';
}

export function installProbePanel({root,native,gcm,onMonth,onLocate,onClear}:Options){
 root.innerHTML=`<div class="probe-heading"><h2><span class="probe-dot"></span>地点探针</h2><button type="button" id="probe-clear" disabled>清除</button></div>
 <p id="probe-message" class="muted" role="status">点击球体放置探针，拖动仍然旋转。</p>
 <form id="probe-coordinates"><label>纬度 °<input id="probe-latitude" aria-label="探针纬度，北正南负" type="number" min="-90" max="90" step="any" value="39.9" required></label><label>经度 °<input id="probe-longitude" aria-label="探针经度，东正西负" type="number" min="-180" max="180" step="any" value="116.4" required></label><button type="submit">定位</button></form>
 <div id="probe-body" class="probe-body" hidden>
 <p id="probe-location"></p><p id="probe-grid" class="muted"></p>
 <div class="series-legend"><span><i style="background:${nativeColor}"></i>现有模型</span><span><i style="background:${gcmColor}"></i>ExoPlaSim</span></div>
 <h3 id="probe-current-heading"></h3><table class="probe-readings"><thead><tr><th>所选月 · 所在格</th><th>现有</th><th>Exo</th></tr></thead><tbody id="probe-current"></tbody></table>
 <h3>逐月降水量 <small>mm / 月</small></h3><div id="probe-rain-chart" class="probe-chart"></div>
 <p id="probe-month-caption" class="chart-caption"></p>
 <h3>逐月平均气温 <small>°C</small></h3><div id="probe-temperature-chart" class="probe-chart"></div>
 <h3>全年统计</h3><table class="probe-readings"><thead><tr><th>指标</th><th>现有</th><th>Exo</th></tr></thead><tbody id="probe-annual"></tbody></table>
 <details><summary>查看12个月数值</summary><table id="probe-monthly"><thead><tr><th>月</th><th>现有 mm</th><th>Exo mm</th><th>现有 °C</th><th>Exo °C</th></tr></thead><tbody></tbody></table></details>
 <p class="muted probe-note">气温、降水率和风为所选月份的平均值，不含逐时天气；降水量是该月总量，按实际采样秒数积分。年温按时间加权。风速为月均矢量的模，东、北分量正值分别向东、向北。两套模型的变量高度和初态仍有差别。</p>
 <a id="probe-download">下载该点全年 CSV</a></div>`;
 const get=(id:string)=>root.querySelector<HTMLElement>('#'+id)!;
 let selection:{location:ProbeLocation;native:ProbeYear;gcm:ProbeYear}|null=null,selectedMonth=7,selectedModel='gcm',csvURL:string|null=null;
 const body=get('probe-body'),message=get('probe-message'),clear=get('probe-clear') as HTMLButtonElement;
 const lat=get('probe-latitude') as HTMLInputElement,lon=get('probe-longitude') as HTMLInputElement;
 const rows=(id:string,data:(string|number)[][])=>{get(id).replaceChildren(...data.map(row=>{const tr=document.createElement('tr');for(const value of row){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}return tr;}));};
 function refresh(model=selectedModel,month=selectedMonth){
  selectedModel=model;selectedMonth=month;if(!selection)return;
  const a=selection.native,b=selection.gcm,c=a.months[month-1],d=b.months[month-1];
  get('probe-current-heading').textContent=`${month}月 · 当前选月`;
  rows('probe-current',[
   ['气温 °C',fixed(c.temperatureC),fixed(d.temperatureC)],['降水量 mm',fixed(c.precipitationMm),fixed(d.precipitationMm)],['降水率 mm/日',fixed(c.rainMmDay,2),fixed(d.rainMmDay,2)],
   ['风矢量模 m/s',fixed(c.windVectorMps),fixed(d.windVectorMps)],['东向风 m/s',fixed(c.eastMps),fixed(d.eastMps)],['北向风 m/s',fixed(c.northMps),fixed(d.northMps)],
  ]);
  rows('probe-annual',[
   ['年降水量 mm',fixed(a.annualPrecipitationMm,0),fixed(b.annualPrecipitationMm,0)],['年平均气温 °C',fixed(a.annualMeanTemperatureC),fixed(b.annualMeanTemperatureC)],
   ['月均温范围 °C',`${fixed(a.coldestMonthTemperatureC)}～${fixed(a.warmestMonthTemperatureC)}`,`${fixed(b.coldestMonthTemperatureC)}～${fixed(b.warmestMonthTemperatureC)}`],
   ['最湿月',a.wettestMonth?`${a.wettestMonth}月`:'无降水',b.wettestMonth?`${b.wettestMonth}月`:'无降水'],
  ]);
  const active=root.ownerDocument.activeElement as HTMLElement|null,activeMonth=active?.dataset.month,activeChart=active?.closest('svg')?.getAttribute('data-chart');
  get('probe-rain-chart').innerHTML=chart('rain',a,b,month,model);get('probe-temperature-chart').innerHTML=chart('temperature',a,b,month,model);
  if(activeMonth&&activeChart)(root.querySelector(`svg[data-chart="${activeChart}"] [data-month="${activeMonth}"]`) as HTMLElement)?.focus();
  get('probe-month-caption').textContent=`${month}月：现有 ${fixed(c.precipitationMm)} mm · Exo ${fixed(d.precipitationMm)} mm。点选图中月份可切换。`;
  rows('probe-monthly-body',a.months.map((m,i)=>[m.month,fixed(m.precipitationMm),fixed(b.months[i].precipitationMm),fixed(m.temperatureC),fixed(b.months[i].temperatureC)]));
  (window as any).comparisonProbe={...selection.location,month,model,cell:a.cell,native:a,gcm:b};
 }
 get('probe-monthly').querySelector('tbody')!.id='probe-monthly-body';
 root.addEventListener('click',event=>{const target=(event.target as Element).closest('[data-month]') as HTMLElement|null;if(target)onMonth(Number(target.dataset.month));});
 root.addEventListener('keydown',event=>{const target=event.target as HTMLElement;if(target.dataset.month&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onMonth(Number(target.dataset.month));}});
 get('probe-coordinates').addEventListener('submit',async event=>{event.preventDefault();try{await onLocate(Number(lat.value),Number(lon.value));}catch(error){message.textContent=String(error);}});
 clear.addEventListener('click',()=>{selection=null;body.hidden=true;clear.disabled=true;onClear();message.textContent='探针已清除。点击球体或输入经纬度重新放置。';if(csvURL)URL.revokeObjectURL(csvURL);csvURL=null;(window as any).comparisonProbe=null;});
 return {
  refresh,
  select(location:ProbeLocation){
   selection={location,native:probeYear(native,location.latitude,location.longitude),gcm:probeYear(gcm,location.latitude,location.longitude)};
   body.hidden=false;clear.disabled=false;lat.value=location.latitude.toFixed(5);lon.value=location.longitude.toFixed(5);
   message.textContent='探针已固定；旋转、切换模型和月份会保留此地点。';
   get('probe-location').textContent=`${latLabel(location.latitude)} · ${lonLabel(location.longitude)}${location.elevationM===undefined?'':` · ${location.elevationM<0?'海床':'海拔'} ${fixed(location.elevationM,0)} m`}`;
   const cell=selection.native.cell;
   get('probe-grid').textContent=`同一气候格 #${cell.index} · 中心 ${latLabel(cell.latitude)} / ${lonLabel(cell.longitude)}。南北 ${cell.bounds.south.toFixed(2)}～${cell.bounds.north.toFixed(2)}°，东西 ${cell.bounds.west.toFixed(2)}～${cell.bounds.east.toFixed(2)}°；细地形不代表点位气候精度。`;
   if(csvURL)URL.revokeObjectURL(csvURL);csvURL=URL.createObjectURL(new Blob(['\uFEFF'+probeCSV(location.latitude,location.longitude,selection.native,selection.gcm)],{type:'text/csv;charset=utf-8'}));
   const link=get('probe-download') as HTMLAnchorElement;link.href=csvURL;link.download=`climate-${location.latitude.toFixed(2)}-${location.longitude.toFixed(2)}.csv`;refresh();
  },
  miss(){message.textContent='没有点中球体；原探针位置已保留。';},
 };
}
