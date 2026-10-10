import {translate} from './sidebar-zh.js';

/** Scene presentation only: retain the original controls, IDs and listeners. */
export function installSidebar(doc) {
  const root=doc.querySelector('#planet-controls'),sliders=doc.querySelector('#sliders');
  if(root.dataset.organized)return;
  root.dataset.organized='true';doc.documentElement.lang='zh-CN';
  const css=doc.createElement('link');css.rel='stylesheet';css.href=new URL('./sidebar.css',import.meta.url).href;doc.head.append(css);
  const makeGroup=(title,id,open=false)=>{
    const group=doc.createElement('details');group.id=id;group.className='scene-group';group.open=open;
    const summary=doc.createElement('summary');summary.textContent=title;group.append(summary);return group;
  };
  const groups={display:makeGroup('显示与播放','scene-display',true),
    climate:makeGroup('行星与气候','scene-climate'),terrain:makeGroup('地形编辑','scene-terrain'),
    rendering:makeGroup('画面设置','scene-rendering')};
  const controls=Array.from(root.children),session=doc.querySelector('#terrain-session');
  root.querySelector('h3').textContent='地球控制台';
  for(const group of Object.values(groups))root.append(group);
  const displayIDs=['planet-layer','planet-camera','planet-live','planet-generate-climate','planet-play','planet-speed','planet-time-days','planet-compare-environment'];
  const seasons=makeGroup('时间与季节','scene-time');
  const legend=makeGroup('地表图例','scene-legend');legend.append(doc.querySelector('#planet-biome-key'));
  for(const node of controls) {
    if(node.tagName==='H3'||node===session||node.id==='planet-biome-key')continue;
    if(displayIDs.some(id=>node.id===id||node.querySelector('#'+id)))groups.display.append(node);
    else if(['planet-spin-phase','planet-orbit-phase','planet-phases','planet-reset-time'].some(id=>node.id===id||node.querySelector('#'+id)))seasons.append(node);
    else if(node.id==='planet-inspect'||node.id==='planet-probe')groups.display.append(node);
    else if(node.id==='geomorph-panel')groups.terrain.append(node);
    else groups.climate.append(node);
  }
  groups.display.append(legend);groups.climate.firstElementChild.after(seasons);
  // Native details preserve keyboard access and independent open/closed state.
  for(const details of root.querySelectorAll('details'))if(details!==groups.display)details.open=false;
  const paint=makeGroup('画笔与手工编辑','scene-paint'),brushes=doc.createElement('div');brushes.className='scene-brushes';
  for(const id of ['tiny','small','medium','large','ocean','shallow','valley','mountain'])brushes.append(doc.getElementById(id));
  paint.append(brushes,doc.querySelector('#button-navigate'),doc.querySelector('#button-reset'));
  groups.terrain.firstElementChild.after(paint);
  for(const group of Array.from(sliders.children)) {
    if(group===root)continue;
    const heading=group.querySelector('h3');if(!heading)continue;
    const phase=heading.textContent,section=makeGroup(translate(phase),'scene-parameters-'+phase);
    heading.remove();section.append(...group.childNodes);group.remove();
    (phase==='render'?groups.rendering:groups.terrain).append(section);
  }
  session.classList.add('scene-group');session.open=false;root.append(session);
  for(const [id,label] of Object.entries({tiny:'极细画笔',small:'细画笔',medium:'中等画笔',large:'粗画笔'})) {
    const button=doc.getElementById(id);button.setAttribute('aria-label',label);button.title=label;
  }
  const updateLegend=()=>{legend.hidden=doc.querySelector('#planet-biome-key').hidden;};updateLegend();
  new doc.defaultView.MutationObserver(updateLegend).observe(doc.querySelector('#planet-biome-key'),{attributes:true,attributeFilter:['hidden']});
  // Translate presentation text only, including refreshed readouts and help.
  // Never touch values, identifiers, model snapshots or machine-readable data.
  function localize(node) {
    if(node.nodeType===3) {
      if(node.parentElement?.closest('script,style'))return;
      const next=translate(node.data);if(next!==node.data)node.data=next;
    } else if(node.nodeType===1) {
      if(node.matches('script,style'))return;
      for(const attr of ['title','aria-label','placeholder'])if(node.hasAttribute(attr)) {
        const value=node.getAttribute(attr),next=translate(value);if(next!==value)node.setAttribute(attr,next);
      }
      for(const child of node.childNodes)localize(child);
    }
  }
  const targets=[sliders,doc.querySelector('#environment-comparison'),doc.querySelector('#mapgen4')].filter(Boolean);
  for(const target of targets)localize(target);
  const observer=new doc.defaultView.MutationObserver(records=>{
    for(const record of records) {
      if(record.type==='childList')for(const node of record.addedNodes)localize(node);
      else localize(record.target);
    }
  });
  for(const target of targets)observer.observe(target,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});
}
