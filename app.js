import {createSiteCompass} from './site-compass.js';
import {mountSiteSources} from './site-sources.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {responsiveFov} from './camera-fit.js';
import {createLighting} from './lighting.js?v=20261013-r4-final';
import {createVisualPipeline} from './visual-pipeline.js?v=20261013-r4-final';
import {applyMaterialDetail} from './material-detail.js?v=20261013-r4-final';
import {applyFurnitureRefinement} from './furniture-refinement.js?v=20261013-r4-final';
import {mountPresentationControls} from './presentation-controls.js?v=20261013-r4-final';
import {batchExterior} from './static-batching.js';
import {createContextLayer} from './context-layer.js';
import {mountRegionNav} from './region-nav.js';
import {mountRenderGallery} from './gallery.js?v=20261012-revision3';
import {createAdaptiveCutaway} from './adaptive-cutaway.js?v=revision3';
import {revealDefault} from './reveal-policy.js';
import {createFloorLabels} from './floor-labels.js';
const $=id=>document.getElementById(id);
mountSiteSources({button:$('site-sources')});
const response=await fetch('./assets/viewer.json');if(!response.ok)throw Error('Viewer configuration unavailable');
const config=await response.json();
const regionCatalog=await (await fetch('./assets/regions.json')).json();
const floorLabels=createFloorLabels(THREE,await (await fetch('./assets/floor-labels.json')).json());
let regionNav,compass;
const floors=[
 {id:'lower-ground',label:'קרקע תחתונה',base:0,cut:3.3,note:'חתך קרקע משולב: חנויות, מעליות, מדרגות וחדרי שירות לפי התוכנית. ריהוט וחומרים מוצעים; האזור האחורי הלא פתור אינו מושלם.'},
 {id:'upper-ground',label:'קרקע עליונה — מפלסים משתנים',clipBase:3.15,base:3.74,cut:6.9,note:'מפלסי מסחר 3.15+/3.26+ וגרעין 3.74+, עם חנויות, מעליות ומדרגות. ריהוט וחומרים מוצעים; המעבר בין הכניסה לגרעין נותר לא פתור.'},
 ...[7.31,11.39,15.47,19.55,23.63,27.71,31.79].map((base,i)=>({id:`office-${i+1}`,label:`משרדים ${String(i+1).padStart(2,'0')}`,base,cut:base+2.8,note:'רצפה וגרעין לפי המקורות, כולל מדרגות, מעליות, שירותים וארכיב. עמדות העבודה, חדרי הישיבות, הריהוט והגמרים הם הצעת המחשה.'})),
 {id:'roof',label:'גג — מפלסים משתנים',clipBase:35.55,base:36.79,cut:44,note:'מפלס הבטון הראשי 36.79+, הדק 37.38+ והחדרים 37.40+. הגג כולל חדר משאבות, מטבח ומדרגות; ציוד, ריהוט וגמרים מוצעים.'}
];
floors.unshift(...[[-11.56,'B04-01-A'],[-8.67,'B03-02-A'],[-5.61,'B02-03-A'],[-2.72,'B01-04-A']].map(([base,revision])=>({id:revision.slice(0,3),label:'מרתף '+revision.slice(1,3)+'',base,plan:'./assets/plans/'+revision.slice(0,3)+'_source_plan.png',revision,note:'מודל מרתף עם גרעין, מדרגות וחניה. מפלס הייחוס '+base+' מ׳; הרצפות בשיפוע. '+(revision.startsWith('B04')?'מרתף 04 חלקי.':'')})));
const guide=[
 {title:'המבנה השלם',text:'מתחילים במבט רחב: המבנה, החזית המעוקלת ויחס הקומות זו לזו.',mode:'exterior',view:'fit'},
 {title:'החזית המעוקלת',text:'מתקרבים לקצב האלמנטים הלבנים ולרצועות הזכוכית לאורך החזית.',mode:'exterior',view:0},
 {title:'החזית האחורית במלואה',text:'מבט רחב על החזית האחורית, המרפסות והקשר בין כל הקומות.',mode:'exterior',view:1},
 {title:'הבניין בתוך הסביבה',text:'הכיכר, הרחובות, החניונים ומסילות הרכבת במיקומם הממופה. את מקורות ההתאמה אפשר לפתוח מכפתור האתר והסביבה.',mode:'exterior',view:9},
 {title:'הכניסה והרחבות',text:'המפגש בין החזית, הרחבה והכניסה בקומת הקרקע.',mode:'exterior',view:8}
];
const state={tab:'building',mode:'exterior',floor:4,area:'overview',cut:'band',view:'fit',tour:0,playing:false,refFov:38,refAspect:4/3,shift:0,fit:false,fitDirection:[1,.58,-1.13]};
const cache=new Map(),pending=new Map();let renderer,scene,camera,controls,lighting,visual,presentation,active,ground,contextLayer,cutaway,sequence=0,tourTimer,failed=false,dirtyFrames=0;
const loader=new GLTFLoader(),upperPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),100),lowerPlane=new THREE.Plane(new THREE.Vector3(0,1,0),100);
const materials=(object,visit)=>object?.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])visit(m,o);});
function invalidate(){dirtyFrames=45;}
function fail(error){console.error('Viewer load failed',error);$('loading').hidden=true;$('viewer-error').hidden=false;$('error-message').textContent='התצוגה המרחבית לא נטענה. אפשר לפתוח את ההדמיות או לבחור קומה אחרת.';}
function initialize(){
 if(renderer)return;
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;renderer.localClippingEnabled=true;
 $('viewport').append(renderer.domElement);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,1,.05,1200);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=3;controls.maxDistance=300;controls.maxPolarAngle=Math.PI*.49;
 cutaway=createAdaptiveCutaway(THREE,{camera,controls,invalidate,mergeGeometries,host:document.querySelector('.stage')});
 floorLabels.bind(renderer.domElement,camera,()=>active);
 compass=createSiteCompass(THREE,document.querySelector('.stage'));
 controls.addEventListener('change',invalidate);controls.addEventListener('start',()=>{state.fit=false;state.view='free';stopTour();$('view-title').textContent='מבט חופשי';markViews();invalidate();});
 lighting=createLighting(renderer,scene,{onReady:invalidate});
 visual=createVisualPipeline(renderer,scene,camera,{onFallback:error=>console.warn('Visual quality fallback',error)});
 lighting.setQuality(visual.setQuality('auto'));
 presentation=mountPresentationControls({onLook:look=>{lighting.setLook(look);invalidate();},onQuality:quality=>{lighting.setQuality(visual.setQuality(quality));resize();},onResize:resize,onCapture:captureView});
 presentation.setTab(state.tab);
 ground=new THREE.Mesh(new THREE.PlaneGeometry(500,500),new THREE.MeshStandardMaterial({color:0xb8bea7,roughness:.93}));ground.rotation.x=-Math.PI/2;ground.position.set(20,-.365,8);ground.receiveShadow=true;scene.add(ground);
 contextLayer=createContextLayer(THREE,scene,loader,ground,{invalidate,prepareNearfield:async (object,manifest)=>{if(manifest.surfaceMaterials?.length){const surface=await import('./surface-finish.js');await surface.applySurfaceFinish(object,THREE,manifest.surfaceMaterials);}await applyMaterialDetail(object,THREE,{kind:'context'});batchExterior(object,[]);},onChange:status=>{$('context-toggle').disabled=!status.ready;$('context-toggle').checked=status.enabled;$('context-status').textContent=status.loading?'טוענים את הסביבה':status.ready?'סביבה ממופה · כבישים, כיכר ורכבת':'הסביבה עדיין בהכנה';$('context-attribution').hidden=!status.active;}});contextLayer.load();
 new ResizeObserver(resize).observe($('viewport'));
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();failed=true;stopTour();fail(Error('התצוגה נעצרה; נסו לטעון מחדש.'));});
 renderer.setAnimationLoop(()=>{if(document.hidden||failed||['gallery','walk'].includes(state.tab)||!$('plan-view').hidden)return;controls.update();if(dirtyFrames>0){compass.update(camera,controls.target,true);floorLabels.update(camera,active);if(cutaway.update())renderer.shadowMap.needsUpdate=true;lighting.update(camera,controls.target);visual.render();dirtyFrames--;}});resize();
}
function resize(){if(!renderer)return;const box=$('viewport').getBoundingClientRect();if(box.width<1||box.height<1)return;renderer.setSize(box.width,box.height,false);visual?.resize(box.width,box.height);camera.aspect=box.width/box.height;camera.fov=responsiveFov(state.refFov,state.refAspect,camera.aspect);
 if(state.shift)camera.setViewOffset(box.width,box.height,0,box.height*state.shift,box.width,box.height);else camera.clearViewOffset();camera.updateProjectionMatrix();if(state.fit&&active)fitModel(false);invalidate();}
function finishCamera(position,target,fov=38,aspect=4/3,shift=0){const damping=controls.enableDamping;controls.enableDamping=false;controls.update();state.refFov=fov;state.refAspect=aspect;state.shift=shift;state.fit=false;camera.near=state.mode==='exterior'&&state.tab!=='floors'?.5:.05;camera.position.copy(position);controls.target.copy(target);controls.update();controls.enableDamping=damping;resize();invalidate();}
function fitModel(setTitle=true,direction=state.fitDirection){state.fitDirection=[...direction];if(!active||!camera)return;const bounds=new THREE.Box3().setFromObject(active),sphere=bounds.getBoundingSphere(new THREE.Sphere());state.shift=0;camera.clearViewOffset();state.refFov=38;state.refAspect=4/3;camera.fov=responsiveFov(38,4/3,camera.aspect);
 const vertical=camera.fov*Math.PI/360,horizontal=Math.atan(Math.tan(vertical)*camera.aspect),distance=sphere.radius/Math.sin(Math.min(vertical,horizontal))*1.28;
 const damping=controls.enableDamping;controls.enableDamping=false;controls.update();camera.position.copy(sphere.center).addScaledVector(new THREE.Vector3(...state.fitDirection).normalize(),distance);controls.target.copy(sphere.center);camera.near=state.mode==='exterior'&&state.tab!=='floors'?.5:.05;camera.far=1200;camera.updateProjectionMatrix();controls.update();controls.enableDamping=damping;
 state.fit=true;if(setTitle){state.view='fit';$('view-title').textContent=state.mode==='exterior'?'הבניין השלם':'המשרד במבט מרחבי';$('view-subtitle').textContent=state.mode==='exterior'?'הבניין המרוהט בתוך הסביבה הממופה':'חלופת משרד לדוגמה · תכנון להמחשה';}markViews();invalidate();}
function captureView(){
 if(!renderer||!active||failed)return;
 lighting.update(camera,controls.target);floorLabels.update(camera,active);visual.render();
 renderer.domElement.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='beit-heller-'+(state.tab==='floors'?floors[state.floor].id:'building')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},'image/png');
}
function markViews(){document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===String(state.view))));}
function setView(index){const v=config[state.mode].views[index];if(!v||!active)return;if(v.fitBounds){fitModel(false,v.fitDirection);state.view=index;$('view-title').textContent=v.label;$('view-subtitle').textContent='המבנה השלם · סביבה לפי תוכניות, מפה ותצלום אוויר';markViews();return;}finishCamera(new THREE.Vector3(...v.position),new THREE.Vector3(...v.target),v.fov||38,state.mode==='interior'?1.6:4/3,v.offsetYFraction||0);state.view=index;$('view-title').textContent=v.label;$('view-subtitle').textContent=state.mode==='exterior'?'חומרים ותאורה להמחשה':'חלופת פנים מוצעת · אינה חלוקה מאושרת';markViews();}
function applyClip(){if(!active)return;cutaway?.restore();const floor=floors[state.floor],use=state.tab==='floors'&&state.mode==='exterior'&&!floor.plan&&!selectedRegion().region.eyeLevel;upperPlane.constant=floor.cut??44;lowerPlane.constant=-((floor.clipBase??floor.base)-.32);materials(active,m=>{m.clippingPlanes=use?(state.cut==='band'?[upperPlane,lowerPlane]:[upperPlane]):[];m.clipShadows=true;m.needsUpdate=true;});cutaway?.configure({defaultMode:revealDefault({tab:state.tab,mode:state.mode,region:state.tab==='floors'?selectedRegion().region:null,view:config[state.mode].views?.[state.tab==='floors'?(selectedRegion().region.view||0):Number(state.view)]}),root:active,active:state.mode!=='exterior'||state.tab==='floors',id:state.mode,heightHint:config[state.mode].views?.[0]?.target?.[1],base:state.tab==='floors'&&state.mode==='exterior'?floor.base:null,range:use?[state.cut==='band'?(floor.clipBase??floor.base)-.32:-Infinity,floor.cut??44]:null});if(renderer){renderer.shadowMap.needsUpdate=true;invalidate();}}
async function load(mode){if(cache.has(mode))return cache.get(mode);if(!pending.has(mode))pending.set(mode,loader.loadAsync(config[mode].model,p=>{if(p.total>0)$('load-message').textContent=p.loaded>p.total?'טוענים את המבנה ומכינים לתצוגה…':`טוענים את המבנה · ${Math.round(100*p.loaded/p.total)}%`;}).then(async gltf=>{const object=gltf.scene;
 if(mode==='exterior'){const surface=await import('./surface-finish.js').catch(()=>null);if(surface?.applySurfaceFinish)await surface.applySurfaceFinish(object,THREE);}
 applyFurnitureRefinement(object,THREE);
 await applyMaterialDetail(object,THREE,{kind:mode==='exterior'?'building':'interior'});
 materials(object,(m,o)=>{o.castShadow=!(m.transmission>.05||m.opacity<.95);o.receiveShadow=true;});if(mode==='exterior'){batchExterior(object);contextLayer.setBuilding(object);}for(const light of config[mode].lights||[]){const p=new THREE.PointLight(0xfff1db,light.intensity*(config[mode].lightScale??1),18,2);p.position.set(...light.position);object.add(p);}
 floorLabels.attach(mode,object);object.visible=false;scene.add(object);cache.set(mode,object);return object;
 }).finally(()=>pending.delete(mode)));return pending.get(mode);}
async function showModel(mode,view='fit'){const token=++sequence;$('viewer-error').hidden=true;$('loading').hidden=cache.has(mode);
 try{if(failed)throw Error('יש לטעון מחדש את התצוגה.');initialize();const object=await load(mode);if(token!==sequence)return false;cutaway?.restore();if(active)active.visible=false;active=object;active.visible=true;state.mode=mode;const lightMode=mode==='exterior'?'exterior':config[mode].lightingPreset||'interior';lighting.setMode(lightMode);visual.setMode(lightMode);contextLayer.setMode(mode);controls.minDistance=mode!=='exterior'?.15:3;controls.maxDistance=mode!=='exterior'?90:300;controls.maxPolarAngle=mode!=='exterior'?Math.PI*.95:Math.PI*.495;
 $('view-kind').textContent=mode==='exterior'?'בית הלר · רחובות':config[mode].title;$('evidence-text').textContent=config[mode].evidence;buildViews();applyClip();resize();if(view==='fit')fitModel(true,[1,.58,-1.13]);else setView(view);$('loading').hidden=true;$('viewport').focus({preventScroll:true});return true;
 }catch(error){if(token===sequence)fail(error);return false;}}
function buildViews(){const options=[['fit',state.mode==='exterior'?'הבניין השלם':'מבט מרחבי'],...config[state.mode].views.map((v,i)=>[i,v.label])];$('destinations').replaceChildren();$('thumbnail-strip').replaceChildren();
 for(const [i,[id,label]] of options.entries()){const b=document.createElement('button');b.dataset.view=id;const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');b.append(number,document.createTextNode(label));b.onclick=()=>{stopTour();id==='fit'?fitModel(true,[1,.58,-1.13]):setView(id);};$('destinations').append(b);}
 const relevant=config.renders.filter(r=>(r.mode||(r.src.includes('interior')?'interior':'exterior'))===state.mode);relevant.forEach((r,i)=>{const viewIndex=r.viewIndex??i;const b=document.createElement('button');b.dataset.view=viewIndex;const img=document.createElement('img');img.src=r.src;img.alt='';const label=document.createElement('span');label.textContent=r.title;b.append(img,label);b.onclick=()=>{stopTour();setView(viewIndex);};$('thumbnail-strip').append(b);});markViews();}
function stopTour(){state.playing=false;clearTimeout(tourTimer);$('tour-play').textContent='ניגון אוטומטי';$('tour-play').setAttribute('aria-pressed','false');$('tour-quick-play').setAttribute('aria-pressed','false');$('tour-quick-play').textContent='ניגון';}
function setPanels(tab){presentation?.setTab(tab);compass?.update(camera,controls.target,!['gallery','walk'].includes(tab));$('plan-view').hidden=true;$('floor-quickbar').hidden=tab!=='floors';document.querySelector('.workspace').classList.toggle('floor-mode',tab==='floors');$('tour-quickbar').hidden=tab!=='tour';document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));for(const id of ['building','floor','tour','gallery','walk'])$(`${id}-panel`).hidden=(id==='floor'?'floors':id)!==tab;
 $('viewport').hidden=['gallery','walk'].includes(tab);$('render-gallery').hidden=tab!=='gallery';$('walk-frame').hidden=tab!=='walk';document.querySelector('.stage').classList.toggle('walking',tab==='walk');$('thumbnail-strip').hidden=tab!=='building';$('stage-footer').hidden=['gallery','walk'].includes(tab);
 const text={building:['כל הבניין. מכל זווית.','סובבו את המבנה, התקרבו לחזית ובחרו את המקום שתרצו להכיר.'],floors:['קומה אחר קומה.','בחרו מפלס ופתחו מבט אל המבנה.'],tour:['חמש תחנות. מבנה אחד.','דרך פשוטה להכיר את המבנה, הסביבה והכניסה.'],gallery:['המבנה באור אחר.','תמונות באיכות גבוהה, מזוויות נבחרות.'],walk:['נכנסים פנימה.','סיור חופשי באזורים שכבר הוכנו להליכה.']}[tab];$('panel-title').textContent=text[0];$('panel-description').textContent=text[1];}
async function setTab(tab){stopTour();if(state.tab==='walk'&&tab!=='walk')$('walk-frame').src='about:blank';state.tab=tab;setPanels(tab);
 if(tab==='gallery'){++sequence;$('loading').hidden=true;$('viewer-error').hidden=true;$('view-title').textContent='מבטי הדמיה';$('view-kind').textContent='חוץ ופנים';$('view-subtitle').textContent='בחירת תמונה פותחת את הקובץ המלא';return;}
 if(tab==='walk'){++sequence;$('loading').hidden=true;$('viewer-error').hidden=true;$('walk-frame').src='./walk/index.html';return;}
 if(tab==='tour'){state.tour=0;await showTour();return;}
 if(tab==='floors'){await selectFloor();return;}await showModel('exterior','fit');}
function selectedRegion(){const f=regionCatalog.floors.find(f=>f.id===floors[state.floor].id);return {floor:f,region:f.regions.find(r=>r.id===state.area)||f.regions[0]};}
function syncRegionControls(){
 const {floor,region}=selectedRegion();state.area=region.id;regionNav?.setSelection(floor.id,region.id);
 $('floor-select').value=String(state.floor);$('floor-quick-select').value=String(state.floor);
 $('area-quick-select').replaceChildren(...floor.regions.map(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.label;return o;}));$('area-quick-select').value=state.area;
}
async function selectFloor(){
 ++sequence;
 const floor=floors[state.floor];const area=state.area;const {region}=selectedRegion();syncRegionControls();
 $('floor-note').textContent=region.caption;
 $('detail-render').hidden=!region.render;$('detail-source').hidden=!(region.plan||floor.plan);$('detail-source').href=region.plan||floor.plan||'#';
 $('detail-render').onclick=()=>{if(!region.render)return;$('large-render').src=region.render;$('large-render').alt=floor.label+' / '+region.label;$('render-caption').textContent=floor.label+' / '+region.label+' · '+region.caption;$('open-full-render').href=region.render;$('render-dialog').showModal();};
 const isPlan=region.kind==='plan';$('plan-view').hidden=!isPlan;$('viewport').hidden=isPlan;$('stage-footer').hidden=isPlan;
 document.querySelector('.segmented').hidden=isPlan||region.eyeLevel||['interior','detail'].includes(region.kind);
 if(isPlan){++sequence;stopTour();$('loading').hidden=true;$('viewer-error').hidden=true;
  $('plan-image').src=region.plan||floor.plan;$('plan-image').alt=floor.label+' · '+region.label;$('plan-link').href=region.plan||floor.plan;
  $('plan-caption').textContent='מהדורת מקור: '+floor.revision+' · '+floor.note;
  $('view-kind').textContent='תוכנית מקור · תלת־ממד בהשלמה';$('view-title').textContent=floor.label.replace(' · תוכנית מקור','')+' / '+region.label;$('view-subtitle').textContent=region.caption;return;
 }
 const mode=region.kind==='interior'?'interior':region.mode||'exterior';
 if(!active||state.mode!==mode||failed){if(!await showModel(mode,region.view??'fit'))return;}
 if(state.tab!=='floors'||floors[state.floor]!==floor||state.area!==area)return;
 $('viewer-error').hidden=true;$('loading').hidden=true;applyClip();resize();
 controls.minDistance=region.eyeLevel||mode!=='exterior'?.15:3;controls.maxPolarAngle=region.eyeLevel||mode!=='exterior'?Math.PI*.95:Math.PI*.495;
 if(['interior','detail'].includes(region.kind)){setView(region.view||0);}else{finishCamera(new THREE.Vector3(...region.position),new THREE.Vector3(...region.target),region.fov||42,4/3,0);state.view='floor';}
 $('view-kind').textContent=region.status==='model'?'מבט תלת־ממדי':'מודל חלקי · אזור בהשלמה';
 $('view-title').textContent=floor.label+' / '+region.label;$('view-subtitle').textContent=region.caption;
 // A selected floor hides distant context which would obscure a cutaway. Preference is kept for the building tab.
 contextLayer.setMode('floor');invalidate();
}
async function showTour(){const step=guide[state.tour];$('tour-count').textContent=`${String(state.tour+1).padStart(2,'0')} / 05`;$('tour-title').textContent=step.title;$('tour-text').textContent=step.text;$('tour-prev').disabled=state.tour===0;$('tour-quick-prev').disabled=state.tour===0;$('tour-quick-next').textContent=state.tour===4?'להתחלה ↻':'למבט הבא ←';$('tour-next').textContent=state.tour===4?'חזרה להתחלה ↻':'למבט הבא ←';return showModel(step.mode,step.view);}
async function advanceTour(){state.tour=(state.tour+1)%guide.length;const ok=await showTour();if(state.playing&&ok)tourTimer=setTimeout(advanceTour,8000);else if(!ok)stopTour();}
floors.forEach((f,i)=>{const o=document.createElement('option');o.value=i;o.textContent=f.label;$('floor-select').append(o);$('floor-quick-select').append(o.cloneNode(true));});$('floor-select').value=String(state.floor);$('floor-quick-select').value=String(state.floor);
await mountRenderGallery($('render-gallery'),config.renders);
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$('home').onclick=()=>{setTab('building');if(matchMedia('(max-width:760px)').matches)document.querySelector('.stage').scrollIntoView({block:'start',behavior:'auto'});};$('fit').onclick=()=>state.tab==='floors'?selectFloor():fitModel();$('walk').onclick=()=>setTab('walk');$('leave-walk').onclick=()=>setTab('building');
$('context-toggle').onchange=event=>contextLayer?.setEnabled(event.target.checked);
const onFloorChange=event=>{state.floor=Number(event.target.value);state.area='overview';selectFloor();};$('floor-select').onchange=onFloorChange;$('floor-quick-select').onchange=onFloorChange;
document.querySelectorAll('[data-cut]').forEach(b=>b.onclick=()=>{state.cut=b.dataset.cut;document.querySelectorAll('[data-cut]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));selectFloor();});
$('tour-next').onclick=()=>{stopTour();advanceTour();};$('tour-prev').onclick=()=>{stopTour();state.tour=Math.max(0,state.tour-1);showTour();};$('tour-play').onclick=()=>{if(state.playing){stopTour();return;}state.playing=true;$('tour-play').textContent='השהיית הסיור';$('tour-play').setAttribute('aria-pressed','true');$('tour-quick-play').setAttribute('aria-pressed','true');$('tour-quick-play').textContent='השהיה';tourTimer=setTimeout(advanceTour,8000);};$('close-render').onclick=()=>$('render-dialog').close();document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTour();else invalidate();});
$('tour-quick-prev').onclick=()=>$('tour-prev').click();$('tour-quick-next').onclick=()=>$('tour-next').click();$('tour-quick-play').onclick=()=>$('tour-play').click();
regionNav=mountRegionNav({container:$('region-navigation'),floors:regionCatalog.floors,initialFloorId:floors[state.floor].id,groupOrder:['ground','offices','roof','basements'],onFloor:id=>{state.floor=floors.findIndex(f=>f.id===id);state.area='overview';},onRegion:id=>{state.area=id;selectFloor();}});
$('area-quick-select').onchange=e=>{state.area=e.target.value;selectFloor();};
document.querySelectorAll('[data-cut]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cut===state.cut)));
await setTab('building');
