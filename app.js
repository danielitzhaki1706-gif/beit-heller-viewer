import {SCENES,composeArchitecture,createCameraMotion,mountExperience} from './experience.js';
import {createSiteCompass} from './site-compass.js';
import {mountSiteSources} from './site-sources.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {configureModelLoader} from './model-loader.js?v=20261022-r7';
import {skipTransmissionPass,isFoliageMaterial} from './render-passes.js?v=20261022-r7';
import {responsiveFov} from './camera-fit.js';
import {createLighting} from './lighting.js?v=20261021-r6';
import {createVisualPipeline} from './visual-pipeline.js?v=20261021-r6';
import {applyMaterialDetail} from './material-detail.js?v=20261018-r5';
import {applyFurnitureRefinement} from './furniture-refinement.js?v=20261018-r5';
import {mountPresentationControls} from './presentation-controls.js?v=20261018-r5';
import {batchExterior} from './static-batching.js';
import {createContextLayer} from './context-layer.js';
import {mountRegionNav} from './region-nav.js';
import {mountRenderGallery} from './gallery.js?v=20261018-r5';
import {createAdaptiveCutaway} from './adaptive-cutaway.js?v=20261021-r6';
import {revealDefault} from './reveal-policy.js';
import {mountFloorStudio} from './floor-studio.js?v=20261021-r6';
import {createFloorRendering} from './floor-rendering.js?v=20261021-r6';
import {mountBasementControls} from './basement-controls.js?v=20261021-r6';
import {mountFloorCompare} from './floor-compare.js?v=20261021-r6';
import {mountFloorSource} from './floor-source.js?v=20261021-r6';
import {floorBounds,regionBounds,composeFloor,createFloorAnchors,projectFloorAnchors} from './floor-camera.js?v=20261021-r6';
import {createFloorLabels} from './floor-labels.js?v=20261021-r6';
import {thumbImage,displayImage} from './image-derivatives.js?v=20261022-r7';
const $=id=>document.getElementById(id);
mountSiteSources({button:$('site-sources')});
// Independent startup data is fetched in parallel; the building model is already preloading (index.html).
const json=(url,fallback)=>fetch(url).then(r=>{if(r.ok)return r.json();if(fallback!==undefined)return fallback;throw Error('Unavailable: '+url);},error=>{if(fallback!==undefined)return fallback;throw error;});
const [config,regionCatalogData,floorLabelData,modelIndex,sourceIndex,completionManifests]=await Promise.all([
 json('./assets/viewer.json'),json('./assets/regions.json?v=20261021-r6'),json('./assets/floor-labels.json'),json('./assets/floor-model-index.json'),
 json('./assets/floor-sources/floor-source-index.json',{}),json('./assets/floor-completions/index.json',[])
]);
config['basement-stack']={title:'מערכת המרתפים',evidence:'ארבע קומות במערכת צירים משותפת; הפרדה אנכית לצפייה בלבד.',lightingPreset:'floor-overview',views:[{label:'מערכת המרתפים',position:[83,64,82],target:[20,3,10],fov:38}]};
const regionCatalog=regionCatalogData;
const floorLabels=createFloorLabels(THREE,floorLabelData);
let regionNav,compass,floorStudio,floorRendering,floorFraming=null,floorAnchors=[],floorRequest=0;
const floorSource=mountFloorSource();
let floorDirection=null,basementStack=null,basementLayout='exploded',basementGap=6,basementFocus=null;
const floorCompare=mountFloorCompare({host:document.querySelector('.stage'),onClose:()=>{syncRegionControls();resize();}});
const basementControls=mountBasementControls({host:document.querySelector('.stage'),onLayout:value=>{basementLayout=value;updateBasementLayout();},onGap:value=>{basementGap=value;updateBasementLayout(true);},onFocus:setBasementFocus});
basementControls.setGap(basementGap);basementControls.setSelection(null);
const cacheTouched=new Map();
const floors=[
 {id:'lower-ground',label:'קרקע תחתונה',base:0,cut:3.3,note:'חתך קרקע משולב: חנויות, מעליות, מדרגות וחדרי שירות לפי התוכנית. ריהוט וחומרים מוצעים; האזור האחורי הלא פתור אינו מושלם.'},
 {id:'upper-ground',label:'קרקע עליונה — מפלסים משתנים',clipBase:3.15,base:3.74,cut:6.9,note:'מפלסי מסחר 3.15+/3.26+ וגרעין 3.74+, עם חנויות, מעליות ומדרגות. ריהוט וחומרים מוצעים; המעבר בין הכניסה לגרעין נותר לא פתור.'},
 ...[7.31,11.39,15.47,19.55,23.63,27.71,31.79].map((base,i)=>({id:`office-${i+1}`,label:`משרדים ${String(i+1).padStart(2,'0')}`,base,cut:base+2.8,note:'רצפה וגרעין לפי המקורות, כולל מדרגות, מעליות, שירותים וארכיב. עמדות העבודה, חדרי הישיבות, הריהוט והגמרים הם הצעת המחשה.'})),
 {id:'roof',label:'גג — מפלסים משתנים',clipBase:35.55,base:36.79,cut:44,note:'מפלס הבטון הראשי 36.79+, הדק 37.38+ והחדרים 37.40+. הגג כולל חדר משאבות, מטבח ומדרגות; ציוד, ריהוט וגמרים מוצעים.'}
];
floors.unshift(...[[-11.56,'B04-01-A'],[-8.67,'B03-02-A'],[-5.61,'B02-03-A'],[-2.72,'B01-04-A']].map(([base,revision])=>({id:revision.slice(0,3),label:'מרתף '+revision.slice(1,3)+'',base,plan:'./assets/plans/'+revision.slice(0,3)+'-overview-source.png',revision,note:'מודל מרתף עם גרעין, מדרגות וחניה. מפלס הייחוס '+base+' מ׳; הרצפות בשיפוע. '+(revision.startsWith('B04')?'מרתף 04 חלקי.':'')})));
const guide=[
 {title:'המבנה השלם',text:'מתחילים במבט רחב: המבנה, החזית המעוקלת ויחס הקומות זו לזו.',mode:'exterior',view:'fit'},
 {title:'החזית המעוקלת',text:'מתקרבים לקצב האלמנטים הלבנים ולרצועות הזכוכית לאורך החזית.',mode:'exterior',view:0},
 {title:'החזית האחורית במלואה',text:'מבט רחב על החזית האחורית, המרפסות והקשר בין כל הקומות.',mode:'exterior',view:1},
 {title:'הבניין בתוך הסביבה',text:'הכיכר, הרחובות, החניונים ומסילות הרכבת במיקומם הממופה. את מקורות ההתאמה אפשר לפתוח מכפתור האתר והסביבה.',mode:'exterior',view:9},
 {title:'הכניסה והרחבות',text:'המפגש בין החזית, הרחבה והכניסה בקומת הקרקע.',mode:'exterior',view:8}
];
const state={tab:'building',mode:'exterior',floor:4,area:'overview',floorPresentation:'overview',cut:'band',view:'fit',tour:0,playing:false,refFov:38,refAspect:4/3,shift:0,shiftX:0,fit:false,fitDirection:[1,.58,-1.13]};
const cache=new Map(),pending=new Map();let renderer,scene,camera,controls,lighting,visual,presentation,active,ground,contextLayer,cutaway,sequence=0,tourTimer,failed=false,dirtyFrames=0,motion,experience,currentScene='signature',currentLook='daylight',firstComposition=true;
const loader=configureModelLoader(THREE,new GLTFLoader()),upperPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),100),lowerPlane=new THREE.Plane(new THREE.Vector3(0,1,0),100);
const materials=(object,visit)=>object?.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])visit(m,o);});
function invalidate(){dirtyFrames=45;}
function fail(error){console.error('Viewer load failed',error);$('loading').hidden=true;$('viewer-error').hidden=false;$('error-message').textContent=error?.userMessage||'התצוגה המרחבית לא נטענה. אפשר לפתוח את ההדמיות או לבחור קומה אחרת.';}
function initialize(){
 if(renderer)return;
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;renderer.localClippingEnabled=true;
 $('viewport').append(renderer.domElement);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,1,.05,1200);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=3;controls.maxDistance=300;controls.maxPolarAngle=Math.PI*.49;
 cutaway=createAdaptiveCutaway(THREE,{camera,controls,invalidate,mergeGeometries,host:document.querySelector('.stage')});
 floorLabels.bind(renderer.domElement,camera,()=>active);
 compass=createSiteCompass(THREE,document.querySelector('.stage'));
 motion=createCameraMotion(camera,controls,invalidate);
 // A touch that turns into a page scroll never moves the camera, so taking over
 // the view (stopping tour, orbit and framing) waits for the first real change.
 let gesture=false;controls.addEventListener('start',()=>{gesture=true;});controls.addEventListener('end',()=>{gesture=false;});
 controls.addEventListener('change',()=>{invalidate();if(!gesture)return;gesture=false;motion?.stop();experience?.setPlaying(false);experience?.setScene(null);currentScene=null;state.fit=false;floorFraming=null;state.view='free';stopTour();if(state.tab!=='floors')$('view-title').textContent='מבט חופשי';markViews();});
 lighting=createLighting(renderer,scene,{onReady:invalidate});
 visual=createVisualPipeline(renderer,scene,camera,{onFallback:error=>console.warn('Visual quality fallback',error)});
 lighting.setQuality(visual.setQuality('auto'));
 floorRendering=createFloorRendering(THREE,{scene,renderer,lighting,invalidate});
 presentation=mountPresentationControls({onLook:setAtmosphere,onQuality:quality=>{lighting.setQuality(visual.setQuality(quality));resize();},onResize:resize,onCapture:captureView});
 presentation.setTab(state.tab);lighting.setLook(currentLook);
 experience=mountExperience({onScene:showArchitecturalScene,onLook:setAtmosphere,onPlay:()=>{const playing=motion.setOrbit(!motion.orbit);experience.setPlaying(playing);if(playing){state.fit=false;currentScene=null;experience.setScene(null);stopTour();}},onPanel:()=>experience.setPanel(document.body.dataset.panel!=='open')});
 experience?.setLook(currentLook);experience?.setTab(state.tab);experience?.setPanel(false);
 ground=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshStandardMaterial({color:0xb8bea7,roughness:.93}));ground.rotation.x=-Math.PI/2;ground.position.set(20,-.365,8);ground.receiveShadow=true;scene.add(ground);
 contextLayer=createContextLayer(THREE,scene,loader,ground,{invalidate,prepareNearfield:async (object,manifest)=>{if(manifest.surfaceMaterials?.length){const surface=await import('./surface-finish.js');await surface.applySurfaceFinish(object,THREE,manifest.surfaceMaterials);}await applyMaterialDetail(object,THREE,{kind:'context'});batchExterior(object,[]);object.traverse(o=>{if(o.isMesh&&o.userData.presentationBatch&&isFoliageMaterial(o.material))skipTransmissionPass(o,()=>renderer.getRenderTarget()===visual.target);});},onChange:status=>{renderer.shadowMap.needsUpdate=true;$('context-toggle').disabled=!status.ready;$('context-toggle').checked=status.enabled;$('context-status').textContent=status.loading?'טוענים את הסביבה':status.ready?'סביבה ממופה · כבישים, כיכר ורכבת':'הסביבה עדיין בהכנה';$('context-attribution').hidden=!status.active;}});
 new ResizeObserver(resize).observe($('viewport'));
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();failed=true;stopTour();fail(Object.assign(Error('WebGL context lost'),{userMessage:'הדפדפן עצר את התצוגה התלת־ממדית כדי לפנות זיכרון גרפי. לחצו ״ניסיון נוסף״ לטעינה מחדש.'}));});
 renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
 renderer.setAnimationLoop(time=>{if(document.hidden||failed||['gallery','walk'].includes(state.tab)||!$('plan-view').hidden)return;motion?.tick(time);const moving=String(!!motion?.active);if(document.body.dataset.cameraMoving!==moving)document.body.dataset.cameraMoving=moving;controls.update();if(dirtyFrames>0){compass.update(camera,controls.target,true);floorLabels.update(camera,active);updateFloorHotspots();if(cutaway.update())renderer.shadowMap.needsUpdate=true;floorRendering.setCutawayMode?.(cutaway.snapshot().mode);lighting.update(camera,controls.target);visual.render();dirtyFrames--;}});resize();
}
function resize(recompose=true){if(!renderer)return;const box=$('viewport').getBoundingClientRect();if(box.width<1||box.height<1)return;renderer.setSize(box.width,box.height,false);visual?.resize(box.width,box.height);camera.aspect=box.width/box.height;camera.fov=state.tab==='floors'&&state.floorPresentation!=='inside'?38:responsiveFov(state.refFov,state.refAspect,camera.aspect);
 if(currentScene&&state.tab==='building')state.shiftX=box.width>=900?.075:0;
 if(state.shift||state.shiftX)camera.setViewOffset(box.width,box.height,box.width*state.shiftX,box.height*state.shift,box.width,box.height);else camera.clearViewOffset();camera.updateProjectionMatrix();if(state.tab==='floors'&&floorFraming&&!motion?.active){const pose=composeFloor(floorFraming,camera,{presentation:state.floorPresentation,direction:state.floorPresentation==='plan'?null:floorDirection||(state.floorPresentation==='stack'?[.85,.65,1.22]:null)});camera.position.copy(pose.position);controls.target.copy(pose.target);controls.update();}else if(state.fit&&active)fitModel(false);else if(recompose!==false&&currentScene&&active&&state.tab==='building'&&!motion?.active){const preset=SCENES.find(p=>p.id===currentScene);if(preset){const pose=composeArchitecture(active,camera,preset);camera.position.copy(pose.position);controls.target.copy(pose.target);controls.update();}}invalidate();}
function finishCamera(position,target,fov=38,aspect=4/3,shift=0){const damping=controls.enableDamping;controls.enableDamping=false;controls.update();state.refFov=fov;state.refAspect=aspect;state.shift=shift;state.shiftX=0;state.fit=false;camera.near=state.mode==='exterior'&&state.tab!=='floors'?.5:.05;if(['building','tour'].includes(state.tab)&&!firstComposition)motion.move(position,target);else{camera.position.copy(position);controls.target.copy(target);controls.update();}controls.enableDamping=damping;resize();invalidate();}
function fitModel(setTitle=true,direction=state.fitDirection){if(setTitle){currentScene=null;experience?.setScene(null);}state.fitDirection=[...direction];if(!active||!camera)return;const bounds=new THREE.Box3().setFromObject(active),sphere=bounds.getBoundingSphere(new THREE.Sphere());state.shift=0;state.shiftX=0;camera.clearViewOffset();state.refFov=38;state.refAspect=4/3;camera.fov=responsiveFov(38,4/3,camera.aspect);
 const vertical=camera.fov*Math.PI/360,horizontal=Math.atan(Math.tan(vertical)*camera.aspect),distance=sphere.radius/Math.sin(Math.min(vertical,horizontal))*1.28;
 const damping=controls.enableDamping;controls.enableDamping=false;controls.update();const destination=sphere.center.clone().addScaledVector(new THREE.Vector3(...state.fitDirection).normalize(),distance);if(['building','tour'].includes(state.tab)&&!firstComposition)motion.move(destination,sphere.center);else{camera.position.copy(destination);controls.target.copy(sphere.center);}camera.near=state.mode==='exterior'&&state.tab!=='floors'?.5:.05;camera.far=1200;camera.updateProjectionMatrix();controls.update();controls.enableDamping=damping;
 state.fit=true;if(setTitle){state.view='fit';$('view-title').textContent=state.mode==='exterior'?'הבניין השלם':'המשרד במבט מרחבי';$('view-subtitle').textContent=state.mode==='exterior'?'הבניין המרוהט בתוך הסביבה הממופה':'חלופת משרד לדוגמה · תכנון להמחשה';}markViews();invalidate();}
function captureView(){
 if(!renderer||!active||failed)return;
 lighting.update(camera,controls.target);floorLabels.update(camera,active);visual.render();
 renderer.domElement.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='beit-heller-'+(state.tab==='floors'?floors[state.floor].id:'building')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},'image/png');
}
function markViews(){document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===String(state.view))));}
function setView(index){motion?.stop();experience?.setPlaying(false);experience?.setScene(null);currentScene=null;const v=config[state.mode].views[index];if(!v||!active)return;if(v.fitBounds){fitModel(false,v.fitDirection);state.view=index;$('view-title').textContent=v.label;$('view-subtitle').textContent='המבנה השלם · סביבה לפי תוכניות, מפה ותצלום אוויר';markViews();return;}finishCamera(new THREE.Vector3(...v.position),new THREE.Vector3(...v.target),v.fov||38,state.mode==='interior'?1.6:4/3,v.offsetYFraction||0);state.view=index;$('view-title').textContent=v.label;$('view-subtitle').textContent=state.mode==='exterior'?'חומרים ותאורה להמחשה':'חלופת פנים מוצעת · אינה חלוקה מאושרת';markViews();}
function applyClip(){if(!active)return;cutaway?.restore();if(state.mode==='basement-stack'){cutaway.configure({root:null,active:false});return;}const floor=floors[state.floor],use=state.tab==='floors'&&state.mode==='exterior'&&!floor.plan&&!selectedRegion().region.eyeLevel;upperPlane.constant=floor.cut??44;lowerPlane.constant=-((floor.clipBase??floor.base)-.32);materials(active,m=>{m.clippingPlanes=use?(state.cut==='band'?[upperPlane,lowerPlane]:[upperPlane]):[];m.clipShadows=true;m.needsUpdate=true;});cutaway?.configure({defaultMode:state.tab==='floors'?(state.floorPresentation==='plan'?'open':state.area==='overview'?'solid':selectedRegion().region.revealDefault||'auto'):revealDefault({tab:state.tab,mode:state.mode,region:null,view:config[state.mode].views?.[Number(state.view)]}),root:active,active:state.mode!=='exterior'||state.tab==='floors',id:state.mode,heightHint:config[state.mode].views?.[0]?.target?.[1],base:state.tab==='floors'?floor.base:null,range:use?[state.cut==='band'?(floor.clipBase??floor.base)-.32:-Infinity,floor.cut??44]:null});if(renderer){renderer.shadowMap.needsUpdate=true;invalidate();}}
async function load(mode){cacheTouched.set(mode,performance.now());if(cache.has(mode))return cache.get(mode);if(!pending.has(mode))pending.set(mode,(mode==='basement-stack'?loadBasementStack():loader.loadAsync(config[mode].model,p=>{if(p.total>0)$('load-message').textContent=p.loaded>p.total?'טוענים את המבנה ומכינים לתצוגה…':`טוענים את המבנה · ${Math.round(100*p.loaded/p.total)}%`;})).then(async gltf=>{const object=gltf.scene;
 for(const completion of completionManifests.filter(c=>c.recommendedModes.includes(mode))){const addition=await loader.loadAsync(completion.asset);addition.scene.name='R6 source-based '+completion.id;addition.scene.userData.completionId=completion.id;object.add(addition.scene);}
 if(mode!=='exterior')object.traverse(mesh=>{if(/source.plan.*underlay/i.test(mesh.name.replace(/_/g,' '))){mesh.visible=false;mesh.userData.floorSourceUnderlay=true;}});
 if(mode==='exterior'){const surface=await import('./surface-finish.js').catch(()=>null);if(surface?.applySurfaceFinish)await surface.applySurfaceFinish(object,THREE);}
 applyFurnitureRefinement(object,THREE);
 await applyMaterialDetail(object,THREE,{kind:mode==='exterior'?'building':'interior'});
 materials(object,(m,o)=>{o.castShadow=!(m.transmission>.05||m.opacity<.95);o.receiveShadow=true;});if(mode==='exterior'){batchExterior(object);contextLayer.setBuilding(object);lighting.setModel?.(object);}for(const light of config[mode].lights||[]){const p=new THREE.PointLight(0xfff1db,light.intensity*(config[mode].lightScale??1),18,2);p.position.set(...light.position);object.add(p);}
 floorLabels.attach(mode,object);object.visible=false;scene.add(object);cache.set(mode,object);return object;
 }).finally(()=>pending.delete(mode)));return pending.get(mode);}
async function showModel(mode,view='fit'){const token=++sequence;$('viewer-error').hidden=true;$('loading').hidden=cache.has(mode);
 try{if(failed)throw Error('יש לטעון מחדש את התצוגה.');initialize();const object=await load(mode);if(token!==sequence){evictFloorModels();return false;}cutaway?.restore();if(active)active.visible=false;active=object;active.visible=true;state.mode=mode;if(state.tab==='floors')floorRendering.prepare(object,{floor:floors[state.floor],mode,region:selectedRegion().region});const lightMode=mode==='exterior'?'exterior':config[mode].lightingPreset||'interior';lighting.setMode(lightMode);visual.setMode(lightMode);contextLayer.setMode(mode);if(mode==='exterior'&&state.tab!=='floors')contextLayer.load(); // surroundings follow the building, never compete with itcontrols.minDistance=mode!=='exterior'?.15:3;controls.maxDistance=mode!=='exterior'?90:300;controls.maxPolarAngle=mode!=='exterior'?Math.PI*.95:Math.PI*.495;
 $('view-kind').textContent=mode==='exterior'?'בית הלר · רחובות':config[mode].title;$('evidence-text').textContent=config[mode].evidence;buildViews();if(state.tab!=='floors'){applyClip();resize();if(view==='fit')fitModel(true,[1,.58,-1.13]);else setView(view);}$('loading').hidden=true;document.body.dataset.viewerReady='true';return true;
 }catch(error){if(token===sequence)fail(error);return false;}}
function buildViews(){const options=[['fit',state.mode==='exterior'?'הבניין השלם':'מבט מרחבי'],...config[state.mode].views.map((v,i)=>[i,v.label])];$('destinations').replaceChildren();$('thumbnail-strip').replaceChildren();
 for(const [i,[id,label]] of options.entries()){const b=document.createElement('button');b.dataset.view=id;const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');b.append(number,document.createTextNode(label));b.onclick=()=>{stopTour();id==='fit'?fitModel(true,[1,.58,-1.13]):setView(id);};$('destinations').append(b);}
 const relevant=config.renders.filter(r=>(r.mode||(r.src.includes('interior')?'interior':'exterior'))===state.mode);relevant.forEach((r,i)=>{const viewIndex=r.viewIndex??i;const b=document.createElement('button');b.dataset.view=viewIndex;const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.alt='';img.src=thumbImage(r.src);const label=document.createElement('span');label.textContent=r.title;b.append(img,label);b.onclick=()=>{stopTour();setView(viewIndex);};$('thumbnail-strip').append(b);});markViews();}
function stopTour(){state.playing=false;clearTimeout(tourTimer);$('tour-play').textContent='ניגון אוטומטי';$('tour-play').setAttribute('aria-pressed','false');$('tour-quick-play').setAttribute('aria-pressed','false');$('tour-quick-play').textContent='ניגון';}
function setPanels(tab){document.body.dataset.tab=tab;floorStudio?.setVisible(tab==='floors');if(tab!=='floors'){basementControls.setVisible(false);floorRequest++;floorFraming=null;floorAnchors=[];floorSource.close();floorCompare.close();cutaway?.restore();floorRendering?.setVisible(false);}motion?.stop();experience?.setPlaying(false);experience?.setTab(tab);presentation?.setTab(tab);compass?.update(camera,controls.target,!['gallery','walk'].includes(tab));$('plan-view').hidden=true;$('floor-quickbar').hidden=tab!=='floors';document.querySelector('.workspace').classList.toggle('floor-mode',tab==='floors');$('tour-quickbar').hidden=tab!=='tour';document.querySelectorAll('.tabs [data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));for(const id of ['building','floor','tour','gallery','walk'])$(`${id}-panel`).hidden=(id==='floor'?'floors':id)!==tab;
 $('viewport').hidden=['gallery','walk'].includes(tab);$('render-gallery').hidden=tab!=='gallery';$('walk-frame').hidden=tab!=='walk';document.querySelector('.stage').classList.toggle('walking',tab==='walk');$('thumbnail-strip').hidden=tab!=='building';$('stage-footer').hidden=['gallery','walk'].includes(tab);
 const text={building:['כל הבניין. מכל זווית.','סובבו את המבנה, התקרבו לחזית ובחרו את המקום שתרצו להכיר.'],floors:['קומה אחר קומה.','בחרו מפלס ופתחו מבט אל המבנה.'],tour:['חמש תחנות. מבנה אחד.','דרך פשוטה להכיר את המבנה, הסביבה והכניסה.'],gallery:['המבנה באור אחר.','תמונות באיכות גבוהה, מזוויות נבחרות.'],walk:['נכנסים פנימה.','סיור חופשי באזורים שכבר הוכנו להליכה.']}[tab];$('panel-title').textContent=text[0];$('panel-description').textContent=text[1];}
async function setTab(tab){stopTour();if(state.tab!==tab)experience?.setPanel(false);if(state.tab==='walk'&&tab!=='walk')$('walk-frame').src='about:blank';state.tab=tab;setPanels(tab);
 if(tab==='gallery'){++sequence;await galleryReady;if(state.tab!=='gallery')return;$('loading').hidden=true;$('viewer-error').hidden=true;$('view-title').textContent='מבטי הדמיה';$('view-kind').textContent='חוץ ופנים';$('view-subtitle').textContent='בחירת תמונה פותחת את הקובץ המלא';return;}
 if(tab==='walk'){++sequence;$('loading').hidden=true;$('viewer-error').hidden=true;$('walk-frame').src='./walk/index.html';return;}
 if(tab==='tour'){state.tour=0;await showTour();return;}
 if(tab==='floors'){await selectFloor();return;}if(!await showModel('exterior','fit')||state.tab!=='building')return;showArchitecturalScene(SCENES[0],firstComposition);firstComposition=false;}
function selectedRegion(){const f=regionCatalog.floors.find(f=>f.id===floors[state.floor].id);return {floor:f,region:f.regions.find(r=>r.id===state.area)||f.regions[0]};}
function syncRegionControls(){
 const {floor,region}=selectedRegion();state.area=region.id;regionNav?.setSelection(floor.id,region.id);
 $('floor-select').value=String(state.floor);$('floor-quick-select').value=String(state.floor);
 $('area-quick-select').replaceChildren(...floor.regions.map(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.label;return o;}));$('area-quick-select').value=state.area;
 const view=config[region.mode||'exterior']?.views?.[region.view||0];floorStudio?.setSelection(floor.id,region.id,{mode:floorCompare.isOpen?'compare':state.floorPresentation,evidence:state.floorPresentation==='inside'&&floor.id.startsWith('office-')?{caption:region.caption+' התקרה בגובה 3.05 מ׳ היא הנמכה מוצעת להמחשה; אינה תוכנית תקרות מאושרת.'}:null,insideAvailable:hasInsideView(region,view),sourceAvailable:!!floorSourceInfo(floor,region).href});const source=floorSourceInfo(floor,region);floorStudio?.setSources(source.href?[source]:[]);
}
function hasInsideView(region,view){
 if(region.id==='overview'||region.kind==='3d'||!view?.position||!view?.target)return false;
 const dy=Math.abs(view.position[1]-view.target[1]),distance=Math.hypot(...view.position.map((v,i)=>v-view.target[i]));
 return dy<5&&dy/Math.max(distance,.01)<.50;
}
function floorSourceInfo(floor,region){
 const entry=sourceIndex[floor.id]||sourceIndex.floors?.[floor.id];
 return region.plan&&region.id!=='overview'?{href:region.plan,label:floor.label+' / '+region.label,note:region.caption}:entry?{...entry,label:floor.label+' / '+(entry.label||'תוכנית הקומה'),note:entry.basis}:floor.plan?{href:floor.plan,label:floor.label+' / תוכנית המקור'}:{};
}
function updateFloorHotspots(){
 if(!floorStudio||!camera||state.tab!=='floors'||!floorAnchors.length){floorStudio?.updateHotspots([]);return;}
 const selected=state.floorPresentation==='stack'&&basementStack?.focused?'stack-'+basementStack.focused:state.area;
 camera.updateMatrixWorld();floorStudio.updateHotspots(projectFloorAnchors(floorAnchors,camera,$('viewport').getBoundingClientRect(),document.querySelector('.stage').getBoundingClientRect(),{selected,max:state.floorPresentation==='stack'?4:matchMedia('(max-width:760px)').matches?3:6}));
}
function frameFloor(bounds,{immediate=false}={}){
 state.fit=false;state.refFov=38;state.refAspect=4/3;state.shift=state.shiftX=0;floorFraming=null;camera.clearViewOffset();camera.near=.05;
 resize(false);const pose=composeFloor(bounds,camera,{presentation:state.floorPresentation,direction:state.floorPresentation==='plan'?null:floorDirection||(state.floorPresentation==='stack'?[.85,.65,1.22]:null)});motion.move(pose.position,pose.target,{duration:1050,immediate});floorFraming=bounds.clone();floorFraming.framePoints=bounds.framePoints;invalidate();
}
function oppositeFloor(){
 if(!active||state.tab!=='floors')return;
 if(state.floorPresentation!=='stack')state.floorPresentation='overview';floorDirection=floorDirection?null:[-.85,1.1,-1.22];selectFloor();
}
async function loadBasementStack(){
 const [{createBasementStack},blueprint]=await Promise.all([import('./assets/floor-completions/basement-stack.js'),fetch('./assets/floor-completions/basement-stack.json').then(r=>r.json())]);
 const sources=[];
 try{
  basementStack=await createBasementStack({blueprint,loadGLB:async href=>{const gltf=await loader.loadAsync(href);sources.push(gltf.scene);return gltf.scene;},onProgress:({completed,total})=>{$('load-message').textContent=`מכינים את מערכת המרתפים · ${completed} / ${total}`;}});
  basementStack.group.userData.presentationOnly=false;basementStack.group.userData.dynamicFloorBounds=true;
  basementStack.setLayout(basementLayout,basementGap);
  return{scene:basementStack.group};
 }finally{for(const root of sources)materials(root,(m,o)=>{o.geometry.dispose();m.dispose();});}
}
function stackAnchors(){
 if(!basementStack)return[];
 return [...basementStack.layers].map(([id,layer])=>{const box=new THREE.Box3().setFromObject(layer),point=box.getCenter(new THREE.Vector3());point.x=box.max.x;point.y=box.min.y+1;return{id:'stack-'+id,label:id,position:point,basis:'registered-floor-layer'};});
}
function updateBasementLayout(immediate=false){
 if(!basementStack||active!==basementStack.group||state.tab!=='floors'||state.floorPresentation!=='stack')return;
 basementStack.setLayout(basementLayout,basementGap);basementStack.setFocus(basementFocus,{othersOpacity:.04});
 floorRendering.setView({root:active,floor:floors[state.floor],region:selectedRegion().region,presentation:'overview'});
 frameFloor(basementStack.framingBounds(),{immediate});floorAnchors=stackAnchors();renderer.shadowMap.needsUpdate=true;invalidate();
}
function setBasementFocus(id){
 basementFocus=id;basementControls.setSelection(id);
 if(basementStack&&state.floorPresentation==='stack'){basementStack.setFocus(id,{othersOpacity:.04});renderer.shadowMap.needsUpdate=true;invalidate();}
}
function evictFloorModels(){
 const candidates=[...cache.keys()].filter(k=>k!=='exterior'&&cache.get(k)!==active).sort((a,b)=>(cacheTouched.get(a)||0)-(cacheTouched.get(b)||0));
 while([...cache.keys()].filter(k=>k!=='exterior').length>6&&candidates.length){
  const id=candidates.shift(),root=cache.get(id);cache.delete(id);cacheTouched.delete(id);floorLabels.detach(id);cutaway.release(root);floorRendering.release(root);scene.remove(root);
  const retainedTextures=new Set(),retainedGeometries=new Set();for(const object of cache.values())materials(object,(m,o)=>{retainedGeometries.add(o.geometry);for(const value of Object.values(m))if(value?.isTexture)retainedTextures.add(value);});
  const geometries=new Set(),ms=new Set(),textures=new Set();materials(root,(m,o)=>{geometries.add(o.geometry);ms.add(m);for(const value of Object.values(m))if(value?.isTexture&&!retainedTextures.has(value))textures.add(value);});
  geometries.forEach(g=>{if(!retainedGeometries.has(g))g.dispose();});ms.forEach(m=>m.dispose());textures.forEach(t=>{if(!t.name?.startsWith('R4'))t.dispose();});if(id==='basement-stack'){basementStack?.dispose();basementStack=null;}
 }
}
async function selectFloor(){
 const request=++floorRequest;++sequence;motion?.stop();floorFraming=null;floorAnchors=[];basementControls.setVisible(state.floorPresentation==='stack');
 const floor=floors[state.floor],{floor:catalogFloor,region}=selectedRegion(),area=region.id,presentationMode=state.floorPresentation;
 syncRegionControls();floorStudio?.setSelection(floor.id,region.id,{mode:floorCompare.isOpen?'compare':presentationMode,busy:true,insideAvailable:hasInsideView(region,config[region.mode||'exterior']?.views?.[region.view||0]),sourceAvailable:!!floorSourceInfo(catalogFloor,region).href});
 $('floor-note').textContent=region.caption;$('detail-render').hidden=!region.render;$('detail-source').hidden=!floorSourceInfo(catalogFloor,region).href;$('detail-source').href=floorSourceInfo(catalogFloor,region).href||'#';
 $('detail-render').onclick=()=>{if(!region.render)return;$('large-render').src=displayImage(region.render);$('large-render').alt=floor.label+' / '+region.label;$('render-caption').textContent=floor.label+' / '+region.label+' · '+region.caption;$('open-full-render').href=region.render;$('render-dialog').showModal();};
 $('plan-view').hidden=true;$('viewport').hidden=false;$('stage-footer').hidden=false;
 const wholeMode=catalogFloor.regions.find(r=>r.id==='overview').mode;
 // Office balconies already exist in the source-aligned complete floor model.
 const mode=presentationMode==='stack'?'basement-stack':floor.id.startsWith('office-')&&/balcony/.test(region.id)?wholeMode:region.kind==='interior'?'interior':region.mode||'exterior';
 const changed=!active||state.mode!==mode;
 if(changed||failed){if(presentationMode==='stack')basementControls.setBusy(true);if(!await showModel(mode,region.view??'fit')){if(request===floorRequest){floorStudio?.setBusy(false);basementControls.setBusy(false);}return;}}
 if(request!==floorRequest||state.tab!=='floors'||state.area!==area||state.floorPresentation!==presentationMode)return;
 floorRendering.prepare(active,{floor,mode,region});floorRendering.setView({root:active,floor,region,presentation:presentationMode==='stack'?'overview':presentationMode});floorRendering.setVisible(true);
 lighting.setMode(presentationMode==='inside'?'floor-inside':'floor-overview');visual.setMode(presentationMode==='inside'?'enclosed':'cutaway');
 applyClip();controls.minDistance=.15;controls.maxDistance=250;controls.maxPolarAngle=presentationMode==='inside'?Math.PI*.92:Math.PI*.49;
 if(presentationMode==='stack'){$('loading').hidden=true;$('viewer-error').hidden=true;state.view='floor-stack';basementControls.setBusy(false);basementControls.setLayout(basementLayout);basementControls.setSelection(basementFocus);updateBasementLayout(changed);contextLayer.setMode('floor');syncRegionControls();evictFloorModels();return;}
 const view=region.mode?(config[mode].views?.[region.view||0]||region):region;
 if(presentationMode==='inside'&&hasInsideView(region,view)){
  const position=[...view.position],target=[...view.target];if(floor.id.startsWith('office-')&&region.id==='west-wing'){position.splice(0,3,0,floor.base+1.65,17);target.splice(0,3,7,floor.base+1.05,20);}
  finishCamera(new THREE.Vector3(...position),new THREE.Vector3(...target),view.fov||56,4/3,0);state.view='floor-inside';
 }else{
  const range=mode==='exterior'?[(floor.clipBase??floor.base)-.32,floor.cut??44]:null;
  const focus=regionBounds(active,{floor,region,wholeMode,mode,view,range});frameFloor(focus.bounds,{immediate:changed});state.view='floor-'+presentationMode;
 }
 if(region.id==='overview')floorAnchors=createFloorAnchors(active,{floor:catalogFloor,config,modelIndex});
 $('viewer-error').hidden=true;$('loading').hidden=true;$('view-kind').textContent=region.status==='model'?'מודל לפי מקורות · גמרים להמחשה':'מודל עם השלמות פתוחות';$('view-title').textContent=floor.label+' / '+region.label;$('view-subtitle').textContent=region.caption;
 contextLayer.setMode('floor');if(floorCompare.isOpen)floorCompare.open(floorSourceInfo(catalogFloor,region));syncRegionControls();evictFloorModels();invalidate();
}
async function showTour(){const step=guide[state.tour];$('tour-count').textContent=`${String(state.tour+1).padStart(2,'0')} / 05`;$('tour-title').textContent=step.title;$('tour-text').textContent=step.text;$('tour-prev').disabled=state.tour===0;$('tour-quick-prev').disabled=state.tour===0;$('tour-quick-next').textContent=state.tour===4?'להתחלה ↻':'למבט הבא ←';$('tour-next').textContent=state.tour===4?'חזרה להתחלה ↻':'למבט הבא ←';return showModel(step.mode,step.view);}
async function advanceTour(){state.tour=(state.tour+1)%guide.length;const ok=await showTour();if(state.playing&&ok)tourTimer=setTimeout(advanceTour,8000);else if(!ok)stopTour();}
floors.forEach((f,i)=>{const o=document.createElement('option');o.value=i;o.textContent=f.label;$('floor-select').append(o);$('floor-quick-select').append(o.cloneNode(true));});$('floor-select').value=String(state.floor);$('floor-quick-select').value=String(state.floor);
// The hidden library is built without delaying the first model view.
const galleryReady=mountRenderGallery($('render-gallery'),config.renders).catch(error=>console.warn('Render library unavailable',error));
document.querySelectorAll('.tabs [data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$('home').onclick=()=>{setTab('building');if(matchMedia('(max-width:760px)').matches)document.querySelector('.stage').scrollIntoView({block:'start',behavior:'auto'});};$('fit').onclick=()=>state.tab==='floors'?selectFloor():fitModel();$('walk').onclick=()=>setTab('walk');$('leave-walk').onclick=()=>setTab('building');
$('context-toggle').onchange=event=>contextLayer?.setEnabled(event.target.checked);
const onFloorChange=event=>{state.floor=Number(event.target.value);state.area='overview';state.floorPresentation='overview';selectFloor();};$('floor-select').onchange=onFloorChange;$('floor-quick-select').onchange=onFloorChange;
document.querySelectorAll('[data-cut]').forEach(b=>b.onclick=()=>{state.cut=b.dataset.cut;document.querySelectorAll('[data-cut]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));selectFloor();});
$('tour-next').onclick=()=>{stopTour();advanceTour();};$('tour-prev').onclick=()=>{stopTour();state.tour=Math.max(0,state.tour-1);showTour();};$('tour-play').onclick=()=>{if(state.playing){stopTour();return;}state.playing=true;$('tour-play').textContent='השהיית הסיור';$('tour-play').setAttribute('aria-pressed','true');$('tour-quick-play').setAttribute('aria-pressed','true');$('tour-quick-play').textContent='השהיה';tourTimer=setTimeout(advanceTour,8000);};$('close-render').onclick=()=>$('render-dialog').close();document.addEventListener('visibilitychange',()=>{if(document.hidden){stopTour();motion?.stopOrbit();experience?.setPlaying(false);}else invalidate();});
$('tour-quick-prev').onclick=()=>$('tour-prev').click();$('tour-quick-next').onclick=()=>$('tour-next').click();$('tour-quick-play').onclick=()=>$('tour-play').click();
floorStudio=mountFloorStudio({onOpposite:oppositeFloor,host:document.querySelector('.stage'),floors:regionCatalog.floors.map(f=>({...f,...floors.find(x=>x.id===f.id),regions:f.regions})),onFloor:id=>{state.floor=floors.findIndex(f=>f.id===id);state.area='overview';state.floorPresentation='overview';selectFloor();},onRegion:id=>{if(id.startsWith('stack-')){setBasementFocus(id.slice(6));return;}state.area=id;state.floorPresentation='overview';selectFloor();},onMode:mode=>{if(mode==='compare'){const {floor,region}=selectedRegion();floorCompare.open(floorSourceInfo(floor,region));state.floorPresentation='plan';selectFloor();return;}if(mode==='source'){motion?.finish();const {floor,region}=selectedRegion();floorSource.open(floorSourceInfo(floor,region));return;}floorCompare.close();state.floorPresentation=mode;if(mode==='stack'){state.area='overview';basementControls.setVisible(true);basementControls.setBusy(true);}selectFloor();},onReset:()=>{state.area='overview';state.floorPresentation='overview';selectFloor();}});
regionNav=mountRegionNav({container:$('region-navigation'),floors:regionCatalog.floors,initialFloorId:floors[state.floor].id,groupOrder:['ground','offices','roof','basements'],onFloor:id=>{state.floor=floors.findIndex(f=>f.id===id);state.area='overview';},onRegion:id=>{state.area=id;selectFloor();}});
$('area-quick-select').onchange=e=>{state.area=e.target.value;selectFloor();};
document.querySelectorAll('[data-cut]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cut===state.cut)));
function setAtmosphere(look){
 currentLook=look;lighting?.setLook(look);experience?.setLook(look);
 const select=$('visual-look');if(select)select.value=look;invalidate();
}
function showArchitecturalScene(preset,immediate=false){
 if(!active||state.mode!=='exterior')return;
 motion.stop();experience?.setPlaying(false);currentScene=preset.id;state.fit=false;state.shift=0;state.shiftX=0;
 state.refFov=36;state.refAspect=16/9;resize(false);
 const composed=composeArchitecture(active,camera,preset);
 state.shiftX=matchMedia('(min-width:900px)').matches?.075:0;
 camera.near=.5;resize(false);motion.move(composed.position,composed.target,{immediate});
 $('view-title').textContent=preset.id==='signature'?'בית הלר':preset.label;
 $('view-kind').textContent='BEIT HELLER · REHOVOT';$('view-subtitle').textContent=preset.subtitle+' · חומרים ותאורה להמחשה';
 state.view='architectural';markViews();experience?.setScene(preset.id);invalidate();
}
document.addEventListener('keydown',event=>{if(event.key!=='Escape'||document.querySelector('dialog[open]'))return;motion?.stopOrbit();experience?.setPlaying(false);experience?.setPanel(false);});
const initialQuery=new URLSearchParams(location.search),initialFloor=floors.findIndex(f=>f.id===initialQuery.get('floor'));
if(initialFloor>=0)state.floor=initialFloor;
if(initialQuery.get('view')==='stack'&&/^B0[1-4]$/.test(floors[state.floor].id))state.floorPresentation='stack';
await setTab(initialQuery.get('tab')==='floors'?'floors':'building');
if(new URLSearchParams(location.search).has('qa'))window.__hellerQA={get scene(){return scene;},get renderer(){return renderer;},get camera(){return camera;},get controls(){return controls;},get visual(){return visual;},get lighting(){return lighting;},snapshot:()=>({state:{...state},scene:currentScene,look:currentLook,camera:camera.position.toArray(),target:controls.target.toArray(),render:visual.snapshot(),lighting:lighting.snapshot(),motion:motion.active,drawCalls:visual.snapshot().sceneCalls,triangles:visual.snapshot().sceneTriangles,floor:floorStudio?.snapshot(),floorRendering:floorRendering?.snapshot(),cutaway:cutaway?.snapshot(),cache:[...cache.keys()],memory:renderer.info.memory,sourceOpen:floorSource.isOpen,compare:floorCompare.snapshot(),basements:basementStack?.snapshot(),basementControls:basementControls.snapshot(),anchors:floorAnchors.map(a=>({id:a.id,position:a.position.toArray(),basis:a.basis}))})};
