/* Beit Heller R6. UI owns selection presentation; app owns scene and camera. */
const NS='http://www.w3.org/2000/svg';
const GROUPS={
 offices:[['work','אזורי עבודה',['curved-front','west-wing','meeting-full']],['core','ליבה ותנועה',['elevators','west-stair','east-stair','core-full']],['service','שירות',['services']],['outdoor','מרפסות',['north-balcony','south-balcony']]],
 lower:[['arrival','כניסה ולובי',['entrance','lobby']],['retail','מסחר',['retail']],['core','ליבה ותנועה',['elevators','west-stair','east-stair']],['service','שירות',['refuse']]],
 upper:[['retail','מסחר',['west-shop','east-shop']],['core','ליבה ותנועה',['elevators','west-stair','east-stair']]],
 basement:[['parking','חניה ותנועה',['parking','ramp','south-services']],['core','גרעין',['elevators','west-stair','east-stair']]],
 B04:[['parking','חניה',['parking']],['core','גישה',['west-stair']],['service','שירות ומאגרים',['storage','plant','reservoirs']]],
 roof:[['outdoor','חוץ ופנאי',['deck','crown']],['service','שירות ומערכות',['kitchen','pump-room','systems-full']],['core','ליבה וגגות',['west-stair','upper-core','elevators']]]
};
const MODES=[['overview','מבט מרחבי','מבט מרחבי באזור שנבחר'],['stack','כל המרתפים','הצגת ארבעת מפלסי המרתף יחד'],['plan','מבט על','מבט מלמעלה על המודל'],['inside','בתוך החלל','מבט מתוך האזור שנבחר'],['compare','מקור מול מודל','השוואת תוכנית המקור לצד המודל'],['source','מקור','פתיחת תוכנית המקור']];
function el(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
function button(className,text,label){const b=el('button',className,text);b.type='button';if(label)b.setAttribute('aria-label',label);return b;}
function elevation(value){return Number.isFinite(Number(value))?`${Number(value)>0?'+':Number(value)<0?'−':'±'}${Math.abs(Number(value)).toFixed(2)}`:'—';}
function floorName(f,compact=false){if(!f)return '';if(f.id==='upper-ground')return 'קרקע עליונה';if(f.id==='lower-ground')return 'קרקע תחתונה';if(f.id==='roof')return 'גג';const office=f.id.match(/^office-(\d+)$/);if(office)return compact?office[1].padStart(2,'0'):`משרדים ${office[1].padStart(2,'0')}`;return compact?f.shortLabel||f.label:f.label;}
function floorFamily(f){return f.id==='roof'?'roof':f.id==='B04'?'B04':/^B\d/i.test(f.id)?'basement':f.id==='lower-ground'?'lower':f.id==='upper-ground'?'upper':'offices';}
function groupsFor(f){const regions=f.regions||[],used=new Set(['overview']);const groups=(GROUPS[floorFamily(f)]||[]).map(([id,label,ids])=>{const items=ids.map(id=>regions.find(r=>r.id===id)).filter(Boolean);items.forEach(r=>used.add(r.id));return {id,label,regions:items};}).filter(g=>g.regions.length);const other=regions.filter(r=>!used.has(r.id));if(other.length)groups.push({id:'other',label:'אזורים נוספים',regions:other});return groups;}
function safeHref(href){if(typeof href!=='string'||!href)return null;try{const u=new URL(href,document.baseURI);return ['http:','https:','file:'].includes(u.protocol)?u.href:null;}catch{return null;}}

export function mountFloorStudio({host,floors=[],onFloor,onRegion,onMode,onReset,onOpposite}={}){
 if(!host)throw new Error('Floor studio requires a stage host.');
 const catalog=floors.filter(f=>f&&f.id).slice(),ordered=catalog.slice().sort((a,b)=>Number(b.base)-Number(a.base));
 let floor=catalog.find(f=>f.id==='lower-ground')||catalog[0],region=floor?.regions?.find(r=>r.id==='overview')||floor?.regions?.[0];
 let visible=false,mode='overview',busy=false,evidence=null,selectedGroup=null,sheetExpanded=false,destroyed=false,sourceOverride=null,insideAvailable=false,sourceAvailable=null;
 const hotspots=new Map(),floorButtons=new Map(),modeButtons=new Map(),levelLines=new Map();
 const root=el('section','floor-studio');root.dataset.floorExperience='studio';root.hidden=true;root.dir='rtl';root.setAttribute('aria-label','אטלס הקומות של בית הלר');
 const heading=el('header','fs-heading'),headingCopy=el('div','fs-heading-copy'),eyebrow=el('span','fs-eyebrow','אטלס הקומות'),title=el('h2','fs-title'),subtitle=el('p','fs-subtitle');
 headingCopy.append(eyebrow,title,subtitle);
 const pickerButton=button('fs-picker-open','בחירת קומה','פתיחת בורר הקומות'),stepUp=button('fs-step','↑','קומה למעלה'),stepDown=button('fs-step','↓','קומה למטה'),steps=el('div','fs-steps');steps.append(stepUp,stepDown);heading.append(headingCopy,pickerButton,steps);
 const rail=el('nav','fs-floor-rail');rail.setAttribute('aria-label','מפלסי הבניין');
 const railHead=el('div','fs-rail-head');railHead.append(el('span','fs-eyebrow','גובה · מטרים'),el('strong','','14 מפלסים'));
 const railMap=el('div','fs-rail-map'),graphic=document.createElementNS(NS,'svg');graphic.classList.add('fs-elevation-graphic');graphic.setAttribute('viewBox','0 0 42 100');graphic.setAttribute('preserveAspectRatio','none');graphic.setAttribute('aria-hidden','true');
 const railList=el('div','fs-level-list');railList.setAttribute('role','group');railList.setAttribute('aria-label','קומות לפי סדר הגובה');
 const values=ordered.map(f=>Number(f.base)).filter(Number.isFinite),min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min),toY=v=>4+(max-v)/span*92;
 const spine=document.createElementNS(NS,'path');spine.setAttribute('d','M8 3 V97');spine.setAttribute('class','fs-elevation-spine');graphic.append(spine);
 const groundLine=document.createElementNS(NS,'path');groundLine.setAttribute('d',`M2 ${toY(0)} H36`);groundLine.setAttribute('class','fs-ground-line');graphic.append(groundLine);
 ordered.forEach((f,i)=>{
  const b=button('fs-level',undefined,`${f.label}, מפלס ${elevation(f.base)} מטר`);b.dataset.floorId=f.id;b.dataset.family=floorFamily(f);const label=el('span','fs-level-name',floorName(f,true)),level=el('bdi','fs-level-value',elevation(f.base));level.dir='ltr';b.append(label,level);b.onclick=()=>chooseFloor(f.id);b.addEventListener('keydown',event=>{const delta=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0;if(delta){event.preventDefault();floorButtons.get(ordered[(i+delta+ordered.length)%ordered.length].id)?.focus();}if(event.key==='Home'){event.preventDefault();floorButtons.get(ordered[0].id)?.focus();}if(event.key==='End'){event.preventDefault();floorButtons.get(ordered.at(-1).id)?.focus();}});railList.append(b);floorButtons.set(f.id,b);
  const line=document.createElementNS(NS,'path'),y=toY(Number(f.base));line.setAttribute('d',`M8 ${y} H${f.id==='lower-ground'?36:25}`);line.dataset.floorId=f.id;line.setAttribute('class','fs-elevation-level');graphic.append(line);levelLines.set(f.id,line);
  const previewLevel=()=>line.classList.toggle('is-previewed',b.matches(':hover')||document.activeElement===b);for(const event of ['pointerenter','pointerleave','focus','blur'])b.addEventListener(event,previewLevel);
 });
 const activeLevel=document.createElementNS(NS,'path');activeLevel.setAttribute('d','M2 0 H38');activeLevel.setAttribute('class','fs-elevation-active');graphic.append(activeLevel);
 railHead.lastChild.textContent=`${catalog.length} מפלסים`;railMap.append(graphic,railList);const railFoot=el('p','fs-rail-foot','מפלסי ייחוס · בית הלר');rail.append(railHead,railMap,railFoot);
 const inspector=el('aside','fs-inspector');inspector.setAttribute('aria-label','אזורי הקומה והמקורות');
 const inspectorHead=el('div','fs-inspector-head'),inspectorCopy=el('div'),inspectorEyebrow=el('span','fs-eyebrow','בתוך הקומה'),regionTitle=el('h3','fs-region-title'),status=el('span','fs-availability');inspectorCopy.append(inspectorEyebrow,regionTitle,status);
 const sheetToggle=button('fs-sheet-toggle','אזורים ומקור','פתיחת אזורים ומקורות');sheetToggle.setAttribute('aria-expanded','false');sheetToggle.setAttribute('aria-controls','fs-inspector-body');inspectorHead.append(inspectorCopy,sheetToggle);
 const inspectorBody=el('div','fs-inspector-body');inspectorBody.id='fs-inspector-body';
 const backButton=button('fs-back','חזרה לכל הקומה ←');backButton.onclick=()=>chooseRegion('overview');
 const browser=el('div','fs-browser'),groupHeading=el('div','fs-section-heading'),groupTitle=el('span','','מה יש בקומה'),allRegions=button('fs-text-button','כל האזורים');groupHeading.append(groupTitle,allRegions);allRegions.onclick=()=>{selectedGroup=selectedGroup==='all'?null:'all';renderRegions();};
 const groupList=el('div','fs-region-groups'),roomList=el('div','fs-room-list');roomList.setAttribute('role','group');roomList.setAttribute('aria-label','אזורים בקומה');browser.append(groupHeading,groupList,roomList);
 const evidenceBox=el('section','fs-evidence'),evidenceHead=el('h4','','המודל והמקור'),evidenceDetails=el('details','fs-evidence-details'),evidenceSummary=el('summary','','מקור, השלמות וחוסרים'),caption=el('p','fs-caption'),evidenceRows=el('div','fs-evidence-rows'),sourceActions=el('div','fs-source-actions');evidenceDetails.append(evidenceSummary,caption,evidenceRows);evidenceBox.append(evidenceHead,evidenceDetails,sourceActions);
 const note=el('p','fs-scope-note','ריהוט, חומרים ותאורה מוצגים להמחשה.');inspectorBody.append(backButton,browser,evidenceBox,note);inspector.append(inspectorHead,inspectorBody);
 const toolbar=el('div','fs-view-toolbar');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','אופן הצגת הקומה');
 const modeGroup=el('div','fs-view-modes');for(const [key,label,description]of MODES){const b=button('fs-view-mode',label,description);b.dataset.mode=key;b.setAttribute('aria-pressed','false');b.onclick=()=>{if(!b.disabled){closeSheet();onMode?.(key);}};modeGroup.append(b);modeButtons.set(key,b);}
 const reset=button('fs-reset','⤢','חזרה לכל הקומה');reset.title='חזרה לכל הקומה';reset.onclick=()=>{closeSheet();onReset?.();};
 const opposite=button('fs-opposite',undefined,'מבט מרחבי מהכיוון הנגדי');opposite.append(el('span','fs-opposite-icon','↶'),el('span','fs-opposite-label','מבט נגדי'));opposite.title='מבט מרחבי מהכיוון הנגדי';opposite.disabled=typeof onOpposite!=='function';opposite.onclick=()=>{closeSheet();onOpposite?.();};toolbar.append(modeGroup,opposite,reset);
 const viewportNote=el('div','fs-viewport-note'),floorStamp=el('span','fs-floor-stamp'),interaction=el('span','fs-interaction','גרירה לסיבוב · צביטה לקירוב');viewportNote.append(floorStamp,interaction);
 const hotspotLayer=el('div','fs-hotspots');hotspotLayer.setAttribute('aria-label','בחירת אזור במרחב');
 const loading=el('div','fs-pending');loading.hidden=true;loading.setAttribute('role','status');loading.append(el('span','fs-loading-mark'),el('span','','מכינים את האזור שנבחר…'));
 const live=el('span','fs-sr-only');live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');
 const picker=el('dialog','fs-floor-picker');picker.dir='rtl';picker.setAttribute('aria-label','בחירת קומה בבית הלר');const pickerHeader=el('div','fs-picker-header'),pickerClose=button('fs-picker-close','סגירה ×','סגירת בורר הקומות');pickerHeader.append(el('div','','מפלסי בית הלר'),pickerClose);const pickerList=el('div','fs-picker-list');
 ordered.forEach(f=>{const b=button('fs-picker-floor');b.dataset.floorId=f.id;const name=el('span','',f.label),value=el('bdi','',`${elevation(f.base)} מ׳`);value.dir='ltr';b.append(name,value);b.onclick=()=>{picker.close();chooseFloor(f.id);};pickerList.append(b);});picker.append(pickerHeader,pickerList);pickerClose.onclick=()=>picker.close();picker.addEventListener('click',event=>{if(event.target===picker){const r=picker.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)picker.close();}});
 pickerButton.onclick=()=>{picker.showModal();picker.querySelector(`[data-floor-id="${CSS.escape(floor?.id||'')}"]`)?.focus({preventScroll:true});};
 picker.addEventListener('close',()=>{if(visible)pickerButton.focus({preventScroll:true});});
 root.append(heading,rail,inspector,toolbar,viewportNote,hotspotLayer,loading,live,picker);host.append(root);
 const onEscape=event=>{if(event.key==='Escape'&&visible&&sheetExpanded){closeSheet();sheetToggle.focus({preventScroll:true});}};document.addEventListener('keydown',onEscape);
 sheetToggle.onclick=()=>setSheet(!sheetExpanded);stepUp.onclick=()=>stepFloor(-1);stepDown.onclick=()=>stepFloor(1);
 function setSheet(expanded){sheetExpanded=!!expanded;root.dataset.sheet=sheetExpanded?'expanded':'peek';sheetToggle.setAttribute('aria-expanded',String(sheetExpanded));sheetToggle.textContent=sheetExpanded?'סגירה ×':'אזורים ומקור';sheetToggle.setAttribute('aria-label',sheetExpanded?'סגירת אזורים ומקורות':'פתיחת אזורים ומקורות');}
 function closeSheet(){setSheet(false);}
 function stepFloor(delta){const at=ordered.findIndex(f=>f.id===floor?.id),f=ordered[at+delta];if(f)chooseFloor(f.id);}
 function chooseFloor(id){if(id===floor?.id){closeSheet();return;}selectedGroup=null;closeSheet();onFloor?.(id);}
 function chooseRegion(id){const returnFocus=sheetExpanded;closeSheet();if(returnFocus)sheetToggle.focus({preventScroll:true});onRegion?.(id);}
 function sources(){const values=sourceOverride||(Array.isArray(evidence?.sources)?evidence.sources:[]);const fallback=region?.plan?{href:region.plan,label:'תוכנית האזור',scope:'region'}:floor?.plan?{href:floor.plan,label:'תוכנית הקומה',scope:'floor'}:null;return (values.length?values:fallback?[fallback]:[]).filter(s=>safeHref(s.href));}
 function renderRegions(){
  const focused=document.activeElement,focusGroup=focused?.dataset?.groupId,focusRegion=focused?.dataset?.regionId;
  groupList.replaceChildren();roomList.replaceChildren();const groups=groupsFor(floor||{id:'',regions:[]});
  const selected=groups.find(g=>g.id===selectedGroup);const listing=selectedGroup==='all'?(floor?.regions||[]).filter(r=>r.id!=='overview'):selected?.regions||[];
  allRegions.textContent=selectedGroup==='all'?'לפי שימוש':'כל האזורים';allRegions.setAttribute('aria-pressed',String(selectedGroup==='all'));
  for(const g of groups){const b=button('fs-region-group');b.dataset.groupId=g.id;b.setAttribute('aria-pressed',String(g.id===selectedGroup));b.append(el('span','',g.label),el('span','fs-group-count',String(g.regions.length)));b.onclick=()=>{selectedGroup=selectedGroup===g.id?null:g.id;renderRegions();};groupList.append(b);}
  roomList.hidden=!listing.length;
  for(const r of listing){const b=button('fs-room');b.dataset.regionId=r.id;b.setAttribute('aria-pressed',String(region?.id===r.id));b.append(el('span','fs-room-label',r.label));if(r.status==='partial'){b.append(el('span','fs-room-status','חלקי'));}b.onclick=()=>chooseRegion(r.id);roomList.append(b);}
  if(focusGroup)groupList.querySelector(`[data-group-id="${CSS.escape(focusGroup)}"]`)?.focus({preventScroll:true});
  if(focusRegion&&roomList.contains(focused)===false)roomList.querySelector(`[data-region-id="${CSS.escape(focusRegion)}"]`)?.focus({preventScroll:true});
 }
 function renderEvidence(){
  evidenceRows.replaceChildren();sourceActions.replaceChildren();const hasStructured=['sourceBased','illustrative','unresolved'].some(k=>Array.isArray(evidence?.[k])&&evidence[k].length);
  caption.textContent=evidence?.caption||region?.caption||'תיאור האזור עדיין לא קושר.';caption.hidden=hasStructured;
  const sections=[['sourceBased','לפי המקור'],['illustrative','להמחשה'],['unresolved','נותר פתוח']];
  for(const [key,label]of sections){const items=evidence?.[key];if(!Array.isArray(items)||!items.length)continue;const row=el('div','fs-evidence-row');row.dataset.kind=key;row.append(el('strong','',label));const list=el('ul');items.forEach(value=>list.append(el('li','',String(value))));row.append(list);evidenceRows.append(row);}
  const links=sources();if(sourceAvailable??links.length>0){const source=button('fs-source-button','פתיחת תוכנית מקור ↗');source.onclick=()=>{closeSheet();onMode?.('source');};sourceActions.append(source);for(const s of links){const a=el('a','fs-source-link',`${s.label||'תוכנית מקור'} · פתיחה בנפרד ↗`);a.href=safeHref(s.href);a.target='_blank';a.rel='noopener';sourceActions.append(a);}}else sourceActions.append(el('p','fs-source-missing','תוכנית האזור טרם קושרה.'));
  if(region?.render){const a=el('a','fs-source-link','הדמיה שמורה ↗');a.href=safeHref(region.render);a.target='_blank';a.rel='noopener';sourceActions.append(a);}
 }
 function renderHeading(){
  if(!floor||!region)return;const stack=mode==='stack';title.textContent=stack?'מערכת המרתפים':floorName(floor);
  subtitle.replaceChildren(el('bdi','',stack?'B01–B04':`${elevation(floor.base)} מ׳`),el('span','',stack?'ארבעה מפלסים':`${floor.regions.length} אזורים`));subtitle.firstChild.dir='ltr';
  floorStamp.textContent=stack?'ארבעת המרתפים':`${floor.label} / ${region.id==='overview'?'כל הקומה':region.label}`;
 }
 function render(){
  if(!floor||!region)return;
  renderHeading();const index=ordered.findIndex(f=>f.id===floor.id);stepUp.disabled=index<=0;stepDown.disabled=index<0||index>=ordered.length-1;
  pickerButton.textContent='החלפת קומה';
  const availability=evidence?.availability||region.status;status.textContent=availability==='partial'?'מודל חלקי':availability==='source-only'||availability==='source'?'תוכנית מקור':'מודל להמחשה';status.dataset.status=availability||'model';
  regionTitle.textContent=region.id==='overview'?'כל הקומה':region.label;backButton.hidden=region.id==='overview';
  for(const [id,b]of floorButtons){const selected=id===floor.id;b.setAttribute('aria-current',selected?'true':'false');b.setAttribute('aria-pressed',String(selected));levelLines.get(id)?.classList.toggle('is-selected',selected);}
  activeLevel.style.transform=`translateY(${toY(Number(floor.base))}px)`;
  pickerList.querySelectorAll('[data-floor-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.floorId===floor.id)));
  const hasStack=/^B0[1-4]$/.test(floor.id);root.dataset.hasStack=String(hasStack);
  for(const [key,b]of modeButtons){b.hidden=key==='stack'&&!hasStack;b.setAttribute('aria-pressed',String(key===mode));b.disabled=(key==='inside'&&!insideAvailable)||(['source','compare'].includes(key)&&!(sourceAvailable??sources().length>0));if(key==='inside')b.title=insideAvailable?'מבט מתוך האזור':region.id==='overview'?'בחרו אזור כדי להיכנס לחלל':'מבט מתוך החלל אינו זמין באזור זה';if(['source','compare'].includes(key))b.title=(sourceAvailable??sources().length>0)?key==='compare'?'השוואת מקור לצד המודל':'פתיחת תוכנית המקור':'תוכנית האזור טרם קושרה';}
  root.dataset.mode=mode;root.dataset.busy=String(busy);root.setAttribute('aria-busy',String(busy));loading.hidden=!busy;
  renderRegions();renderEvidence();
  if(!busy)live.textContent=mode==='stack'?'מערכת המרתפים, B01 עד B04, ארבעה מפלסים.':`${floor.label}, ${region.id==='overview'?'כל הקומה':region.label}. ${status.textContent}.`;
 }
 function clearHotspots(){for(const n of hotspots.values())n.remove();hotspots.clear();}
 function updateHotspots(points=[]){
  if(destroyed)return;if(!points.length){clearHotspots();return;}const hostRect=host.getBoundingClientRect(),viewportRect=(document.getElementById('viewport')||host).getBoundingClientRect(),leftBound=viewportRect.left-hostRect.left,rightBound=viewportRect.right-hostRect.left,seen=new Set(),depths=points.filter(p=>p?.visible!==false&&Number.isFinite(p?.depth)).map(p=>p.depth),near=depths.length?Math.min(...depths):0,far=depths.length?Math.max(...depths):0;
  for(const point of points){if(!point||!point.id)continue;const key=String(point.id);seen.add(key);let node=hotspots.get(key);if(!node){node=button('fs-hotspot');node.dataset.regionId=key;node.append(el('span','fs-hotspot-dot'),el('span','fs-hotspot-label'));node.onclick=()=>chooseRegion(key);hotspots.set(key,node);hotspotLayer.append(node);}const label=String(point.label||floor?.regions?.find(r=>r.id===key)?.label||key);if(node.lastChild.textContent!==label)node.lastChild.textContent=label;node.setAttribute('aria-label',`בחירת אזור: ${label}`);node.setAttribute('aria-pressed',String(!!point.selected));const shown=visible&&point.visible!==false&&Number.isFinite(point.x)&&Number.isFinite(point.y);node.hidden=!shown;if(shown){const roomLeft=point.x-leftBound,roomRight=rightBound-point.x,side=roomRight<170&&roomLeft>roomRight?'left':'right',room=`${Math.floor(Math.max(40,(side==='left'?roomLeft:roomRight)+4))}px`;if(node.dataset.side!==side)node.dataset.side=side;if(node.style.getPropertyValue('--fs-anchor-room')!==room)node.style.setProperty('--fs-anchor-room',room);const transform=`translate3d(${Math.round(point.x)}px,${Math.round(point.y)}px,0)`;if(node.style.transform!==transform)node.style.transform=transform;const attenuation=Number.isFinite(point.depth)&&far>near?Math.min(1,Math.max(0,(point.depth-near)/(far-near))):0;const opacity=(.94-attenuation*.2).toFixed(2);if(node.style.getPropertyValue('--fs-anchor-opacity')!==opacity)node.style.setProperty('--fs-anchor-opacity',opacity);}}
  for(const [key,node]of hotspots)if(!seen.has(key)){node.remove();hotspots.delete(key);}
 }
 setSheet(false);render();
 return {
  setVisible(value){visible=!!value;root.hidden=!visible;document.body.classList.toggle('floor-studio-active',visible);if(!visible){closeSheet();clearHotspots();if(picker.open)picker.close();}else render();},
  setSelection(floorId,regionId,{mode:nextMode='overview',busy:nextBusy=false,evidence:nextEvidence=null,insideAvailable:nextInside=false,sourceAvailable:nextSource=null}={}){const next=catalog.find(f=>f.id===floorId);if(!next)return;const nextRegion=next.regions?.find(r=>r.id===regionId)||next.regions?.find(r=>r.id==='overview')||next.regions?.[0];if(!nextRegion)return;if(floor?.id!==next.id){selectedGroup=null;clearHotspots();}floor=next;region=nextRegion;mode=nextMode;busy=!!nextBusy;evidence=nextEvidence;insideAvailable=!!nextInside;sourceAvailable=typeof nextSource==='boolean'?nextSource:null;sourceOverride=null;if(region.id!=='overview'&&selectedGroup!=='all')selectedGroup=groupsFor(floor).find(g=>g.regions.some(r=>r.id===region.id))?.id||null;render();},
  setMode(value){if(!MODES.some(m=>m[0]===value))return;mode=value;root.dataset.mode=mode;renderHeading();for(const [key,b]of modeButtons)b.setAttribute('aria-pressed',String(key===mode));},
  setSources(value){sourceOverride=Array.isArray(value)?value:[];render();},
  setBusy(value){busy=!!value;root.dataset.busy=String(busy);root.setAttribute('aria-busy',String(busy));loading.hidden=!busy;},
  updateHotspots,
  snapshot(){const box=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};return {visible,floorId:floor?.id,regionId:region?.id,mode,busy,sheet:sheetExpanded?'expanded':'peek',floors:catalog.length,regions:catalog.reduce((n,f)=>n+(f.regions?.length||0),0),selectedGroup,visibleHotspots:[...hotspots].filter(([,n])=>!n.hidden).map(([id])=>id),sources:sources().map(s=>s.href),bounds:{host:box(host),heading:box(heading),rail:box(rail),inspector:box(inspector),viewport:box(document.getElementById('viewport')||host)}};},
  destroy(){destroyed=true;clearHotspots();document.removeEventListener('keydown',onEscape);if(picker.open)picker.close();root.remove();document.body.classList.remove('floor-studio-active');}
 };
}
