// Invoke only inside cua_repl with its documented Tab and CDP capability.
// No independent browser connection, alternate automation or model replacement.
export function browserAudit(tab,cdp,fs,dir,records) {
  async function evaluate(expression) {
    const r=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},{timeoutMs:15000});
    if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  const persist=()=>fs.writeFile(dir+'/browser-audit.json',JSON.stringify(records,null,2)+'\n');
  async function settle() {
    return evaluate(`(async()=>{const w=document.querySelector('#world').contentWindow,d=w.document;await new Promise(r=>w.requestAnimationFrame(()=>w.requestAnimationFrame(r)));return {x:d.querySelector('#slider-x input').value,y:d.querySelector('#slider-y input').value,zoom:d.querySelector('#slider-zoom input').value,layer:d.querySelector('#planet-layer').value,quality:d.querySelector('#environment-resolution').value||'classic',sharedMoisture:d.querySelector('#water-unified').checked,clockDay:d.querySelector('#planet-time-days').value,play:d.querySelector('#planet-play').getAttribute('aria-pressed'),renderWait:'two iframe animation callbacks after change; renderer draw loop precedes observation'}})()`);
  }
  async function restore(path,label) {
    const state=await evaluate(`(async()=>{const w=document.querySelector('#world').contentWindow,d=w.document,blob=await(await fetch(${JSON.stringify(path)})).blob(),dt=new w.DataTransfer();dt.items.add(new w.File([blob],'audit-checkpoint.json',{type:'application/json'}));const input=d.querySelector('#terrain-load');input.files=dt.files;input.dispatchEvent(new w.Event('change',{bubbles:true}));await new Promise((resolve,reject)=>{const ob=new w.MutationObserver(check),timer=setTimeout(()=>{ob.disconnect();reject(Error('strict restore timeout'))},12000);function check(){const text=d.querySelector('#terrain-file-status').textContent;if(text.includes('Load failed:')||text.includes('载入失败')){ob.disconnect();clearTimeout(timer);reject(Error(text))}else if(text.includes('Complete simulation restored')||text.includes('完整模拟已恢复')){ob.disconnect();clearTimeout(timer);resolve()}}ob.observe(d.documentElement,{subtree:true,childList:true,characterData:true});check()});document.querySelector('#status').textContent=${JSON.stringify(label)};return {label:${JSON.stringify(label)},path:${JSON.stringify(path)},bytes:blob.size}})()`);
    records.push({...state,...await settle()});await persist();return records.at(-1);
  }
  async function region(file,value) {
    await tab.playwright.getByRole('combobox',{name:'视角',exact:true}).selectOption(value);
    const state=await settle(),[x,y]=value.split(',');
    if(state.x!==x||state.y!==y)throw Error('Camera control mismatch');
    await tab.getAXState({emit:false});
    await fs.writeFile(dir+'/'+file,await tab.screenshot({fullPage:false}));
    records.push({screenshot:file,...state,verifiedAfterDraw:true});await persist();return state;
  }
  async function layer(file,value) {
    await tab.playwright.frameLocator('#world').getByRole('combobox',{name:'显示图层',exact:true}).selectOption(value);
    const state=await settle();
    await tab.getAXState({emit:false});
    await fs.writeFile(dir+'/'+file,await tab.screenshot({fullPage:false}));
    records.push({screenshot:file,...state,verifiedAfterDraw:true});await persist();return state;
  }
  return {evaluate,persist,settle,restore,region,layer};
}
