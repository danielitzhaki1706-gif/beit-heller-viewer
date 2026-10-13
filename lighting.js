import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {loadLocalHDRI} from './local-hdri.js';
// Artistic daylight, not a location/date-dependent solar simulation.
export const LIGHT_LOOKS=Object.freeze({
 daylight:{direction:[-.55,.85,-.45],sun:0xfff4e8,sky:0xc3d9f0,ground:0x9c9383,exposure:1.0},
 golden:{direction:[-.76,.34,-.47],sun:0xffcf94,sky:0xb5cce9,ground:0x958574,exposure:1.0}
});
export function createLighting(renderer,scene,{onReady=()=>{}}={}){
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 const dir=new THREE.Vector3(),focus=new THREE.Vector3(22,18,8),lastFocus=new THREE.Vector3(Infinity,0,0);
 const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{sunDirection:{value:dir},warmth:{value:0}},
 vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
 fragmentShader:'varying vec3 vDirection;uniform vec3 sunDirection;uniform float warmth;void main(){vec3 d=normalize(vDirection);float h=smoothstep(-.04,.82,d.y);vec3 horizon=mix(vec3(.70,.77,.80),vec3(.81,.66,.48),warmth);vec3 sky=mix(horizon,vec3(.22,.39,.65),h);sky=mix(vec3(.16,.15,.12),sky,smoothstep(-.1,.02,d.y));float s=pow(max(dot(d,sunDirection),0.),900.);gl_FragColor=vec4(sky+mix(vec3(5.,4.5,3.7),vec3(5.,3.3,1.8),warmth)*s,1.);}'});
 const sky=new THREE.Mesh(new THREE.SphereGeometry(450,32,16),material);sky.frustumCulled=false;sky.visible=false;scene.add(sky);
 const envScene=new THREE.Scene();envScene.add(new THREE.Mesh(sky.geometry,material));const pmrem=new THREE.PMREMGenerator(renderer),environments={};
 for(const [key,look]of Object.entries(LIGHT_LOOKS)){dir.fromArray(look.direction).normalize();material.uniforms.warmth.value=key==='golden'?1:0;environments[key]=pmrem.fromScene(envScene,.025,.1,1000);}
 const room=new RoomEnvironment(),indoor=pmrem.fromScene(room,.05);room.dispose();pmrem.dispose();
 const hemi=new THREE.HemisphereLight(0xc3d9f0,0x9c9383,.20);scene.add(hemi);
 const sun=new THREE.DirectionalLight(0xfff4e8,3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00006;sun.shadow.normalBias=.025;sun.shadow.radius=2;scene.add(sun,sun.target);
 const fill=new THREE.DirectionalLight(0xc3d9f0,.08);fill.position.set(60,45,70);scene.add(fill);
 let currentMode='exterior',currentLook='daylight',quality='balanced',photoSky=null,photoEnvironment=null,disposed=false,lastExtent=0;
 function updateShadowBias(extent){
  // PCFSoft samples neighbouring shadow texels. A fixed centimetre offset
  // undershoots a 124 m / 1024 map and draws false bands on sloped receivers.
  // Keep the depth bias small; scale the world-normal offset to this footprint.
  // Interior offsets stay small so furniture contact is retained.
  const texel=2*extent/sun.shadow.mapSize.x,slope=Math.sqrt(Math.max(0,1-dir.y*dir.y));
  sun.shadow.normalBias=currentMode==='exterior'?Math.max(.035,Math.min(.33,2*texel*slope+.005)):.024;
  sun.shadow.bias=currentMode==='exterior'?-.00010:-.00009;
 }
 function placeSun(extent){sun.target.position.copy(focus);sun.position.copy(focus).addScaledVector(dir,130);Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:.5,far:300});sun.shadow.camera.updateProjectionMatrix();updateShadowBias(extent);}
 function apply(){
  const look=LIGHT_LOOKS[currentLook],outside=currentMode==='exterior',enclosed=currentMode==='enclosed',cutaway=currentMode==='cutaway';dir.fromArray(look.direction).normalize();material.uniforms.warmth.value=currentLook==='golden'?1:0;
  sun.color.setHex(look.sun);hemi.color.setHex(look.sky);hemi.groundColor.setHex(look.ground);fill.color.setHex(look.sky);
  // Environment supplies broad skylight; weak hemi/fill restore missing bounce.
  const photographic=outside&&photoEnvironment&&currentLook==='daylight';
  scene.environment=outside?(photographic?photoEnvironment.texture:environments[currentLook].texture):indoor.texture;
  scene.environmentIntensity=enclosed?.26:cutaway?.28:outside?.60:.40;
  scene.environmentRotation.set(0,photographic?(.5951-.5)*Math.PI*2-Math.atan2(dir.z,dir.x):0,0);
  const background=outside?(currentLook==='golden'?'#cbd5dc':'#c6d9e5'):enclosed?'#343b3f':cutaway?'#c7d0d0':'#dbe2e2';sky.visible=false;scene.background=new THREE.Color(background);scene.fog=outside?new THREE.Fog(background,500,1050):null;scene.backgroundIntensity=1;scene.backgroundBlurriness=0;
  sun.intensity=enclosed?0:outside?(currentLook==='golden'?2.55:3.05):cutaway?2.25:1.85;hemi.intensity=enclosed?.11:outside?.20:cutaway?.19:.23;fill.intensity=enclosed?.025:outside?.08:cutaway?.07:.09;
  renderer.toneMappingExposure=look.exposure*(enclosed?1.10:1);lastExtent=0;placeSun(55);renderer.shadowMap.needsUpdate=true;
 }
 function update(camera,target){
  if(disposed||!target)return false;const outside=currentMode==='exterior',distance=camera.position.distanceTo(target);
  // Quantized frustum: detailed interiors need centimetre-scale shadow texels.
  const desired=outside?Math.max(48,Math.min(88,distance*.52)):Math.max(7,Math.min(48,distance*.48)),extent=Math.ceil(desired/2)*2;
  if(extent===lastExtent&&lastFocus.distanceToSquared(target)<.04)return false;focus.copy(target);lastFocus.copy(target);lastExtent=extent;placeSun(extent);renderer.shadowMap.needsUpdate=true;return true;
 }
 function setMode(mode){currentMode=mode;apply();}
 function setLook(look){if(!LIGHT_LOOKS[look])throw Error('Unknown light look: '+look);currentLook=look;apply();onReady();}
 function setQuality(value){if(!['auto','high','balanced','low'].includes(value))throw Error('Unknown lighting quality: '+value);quality=value;const small=value==='low'||(value==='auto'&&typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches),size=small?1024:value==='high'?3072:2048;if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;updateShadowBias(lastExtent||55);renderer.shadowMap.needsUpdate=true;}}
 setMode('exterior');
 const ready=(async()=>{let texture,generator;try{texture=await loadLocalHDRI(THREE,new URL('./assets/sky/kloofendal_puresky_2k.hdr',import.meta.url));if(disposed){texture.dispose();return{status:'DISPOSED'};}generator=new THREE.PMREMGenerator(renderer);photoEnvironment=generator.fromEquirectangular(texture);photoSky=texture;apply();onReady();return{status:'LOCAL_HDRI_READY',look:currentLook};}catch(error){if(!photoSky)texture?.dispose();if(!disposed){console.warn('Local sky unavailable; procedural fallback retained',error);apply();onReady();}return{status:'PROCEDURAL_FALLBACK'};}finally{generator?.dispose();}})();
 function dispose(){if(disposed)return;disposed=true;for(const o of [sun,sun.target,hemi,fill,sky])scene.remove(o);sun.shadow.map?.dispose();for(const e of Object.values(environments))e.dispose();indoor.dispose();photoEnvironment?.dispose();photoSky?.dispose();material.dispose();sky.geometry.dispose();scene.environment=null;}
 return{setMode,setLook,setQuality,update,dispose,sun,sky,outdoor:environments.daylight,indoor,ready,snapshot:()=>({mode:currentMode,look:currentLook,quality,shadowSize:sun.shadow.mapSize.x,shadowExtent:lastExtent,shadowTexelMetres:2*lastExtent/sun.shadow.mapSize.x,shadowNormalBias:sun.shadow.normalBias,shadowDepthBias:sun.shadow.bias,environmentIntensity:scene.environmentIntensity,exposure:renderer.toneMappingExposure})};
}
