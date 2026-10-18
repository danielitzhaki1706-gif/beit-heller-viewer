import * as THREE from 'three';

export const SCENES = [
 {id:'signature',label:'החזית',subtitle:'קווים, זכוכית ואור',direction:[1,.12,-1.38],targetY:21,look:null,thumb:'./assets/atelier/golden-hero.jpg'},
 {id:'terraces',label:'מבט אחורי',subtitle:'החזית השנייה של המבנה',direction:[.82,.28,1.28],targetY:21,look:null,thumb:'./assets/atelier/terraces.jpg'},
 {id:'crown',label:'מעל הגג',subtitle:'המרחב שבין המבנה לשמיים',direction:[.72,1.1,-.95],targetY:21,look:null,thumb:'./assets/atelier/golden-hero.jpg'},
 {id:'context',label:'בתוך העיר',subtitle:'בית הלר וסביבתו הקרובה',direction:[1,1.1,-1.1],targetY:17,scale:1.65,look:null,thumb:'./assets/atelier/golden-hero.jpg'}
];

// Frame real model bounds; no scale, geometry or coordinate changes.
export function composeArchitecture(object,camera,preset) {
 const bounds=new THREE.Box3().setFromObject(object),target=bounds.getCenter(new THREE.Vector3());
 target.y=preset.targetY??target.y;
 const direction=new THREE.Vector3(...preset.direction).normalize();
 const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
 const up=new THREE.Vector3().crossVectors(direction,right).normalize();
 const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5)),tanH=tanV*camera.aspect;
 let distance=0;
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  const p=new THREE.Vector3(x,y,z).sub(target),depth=p.dot(direction);
  distance=Math.max(distance,Math.abs(p.dot(right))/(tanH*.78)+depth,Math.abs(p.dot(up))/(tanV*.73)+depth);
 }
 distance*=preset.scale||1;
 return {position:target.clone().addScaledVector(direction,distance),target};
}

export function createCameraMotion(camera,controls,invalidate) {
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let transition=null,orbit=false,previous=0;
 function stop(){transition=null;orbit=false;controls.autoRotate=false;}
 function move(position,target,{duration=1450,immediate=false}={}){
  transition=null;
  if(immediate||reduced.matches){camera.position.copy(position);controls.target.copy(target);controls.update();invalidate();return;}
  transition={time:performance.now(),duration,from:camera.position.clone(),to:position.clone(),fromTarget:controls.target.clone(),toTarget:target.clone()};invalidate();
 }
 function tick(time){
  const dt=previous?Math.min(.05,(time-previous)/1000):0;previous=time;
  if(transition){const t=Math.min(1,(time-transition.time)/transition.duration),e=t*t*t*(t*(t*6-15)+10);camera.position.lerpVectors(transition.from,transition.to,e);controls.target.lerpVectors(transition.fromTarget,transition.toTarget,e);if(t===1)transition=null;invalidate();}
  if(orbit){const v=camera.position.clone().sub(controls.target);v.applyAxisAngle(new THREE.Vector3(0,1,0),dt*.035);camera.position.copy(controls.target).add(v);invalidate();}
 }
 function setOrbit(enabled){transition=null;orbit=!!enabled;previous=0;invalidate();return orbit;}
 return {move,tick,stop,setOrbit,get active(){return !!transition||orbit;},get orbit(){return orbit;},get reduced(){return reduced.matches;}};
}

export function mountExperience({onScene,onLook,onPlay,onPanel}) {
 const host=document.getElementById('experience-dock');
 if(!host)return null;
 host.setAttribute('aria-label','מבטים ותאורה');
 host.innerHTML=`<div class="experience-scenes" role="group" aria-label="מבטי האדריכלות">${SCENES.map((s,i)=>`<button class="experience-scene" data-scene="${s.id}" aria-pressed="${i===0}"><span class="scene-number" aria-hidden="true">${String(i+1).padStart(2,'0')}</span><span>${s.label}</span></button>`).join('')}</div><div class="experience-divider"></div><div class="experience-lighting" role="group" aria-label="אווירת התאורה"><button data-look="daylight" aria-pressed="false">יום</button><button data-look="golden" aria-pressed="true">שעת זהב</button><button data-look="twilight" aria-pressed="false">ערב</button></div><button id="cinematic-play" aria-pressed="false"><span aria-hidden="true">▷</span><span>תנועה סביב הבניין</span></button>`;
 host.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>onScene(SCENES.find(s=>s.id===b.dataset.scene)));
 host.querySelectorAll('[data-look]').forEach(b=>b.onclick=()=>onLook(b.dataset.look));
 const play=host.querySelector('#cinematic-play'),toggle=document.getElementById('explore-toggle');
 play.onclick=()=>onPlay();if(toggle)toggle.onclick=()=>onPanel();
 return {
  setScene(id){host.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scene===id)));},
  setLook(look){host.querySelectorAll('[data-look]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.look===look)));document.body.dataset.look=look;},
  setPlaying(value){play.setAttribute('aria-pressed',String(value));play.innerHTML=`<span aria-hidden="true">${value?'Ⅱ':'▷'}</span><span>${value?'עצירת התנועה':'תנועה סביב הבניין'}</span>`;},
  setTab(tab){host.hidden=tab!=='building';if(toggle)toggle.hidden=tab!=='building';},
  setPanel(open){document.body.dataset.panel=open?'open':'closed';if(toggle){toggle.setAttribute('aria-expanded',String(open));const label=toggle.querySelector('span:first-child')||toggle;label.textContent=open?'סגירת המבטים':'כל המבטים';}},
 };
}
