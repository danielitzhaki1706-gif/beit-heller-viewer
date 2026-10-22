import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {loadLocalHDRI} from './local-hdri.js';
import {setFacadeAtmosphere} from './facade-atmosphere.js?v=20261018-r5';

// Architectural lighting moods. Not a site/date-dependent solar simulation.
export const LIGHT_LOOKS=Object.freeze({
 daylight:{direction:[-.55,.85,-.45],sun:0xfff4e8,sky:0xc3d9f0,ground:0x9c9383,exposure:1.0,strength:3.0,environment:.64},
 golden:{direction:[.65,.45,-.85],sun:0xffd6ac,sky:0xb3c9e7,ground:0xa2907d,exposure:.98,strength:2.55,environment:.59},
 twilight:{direction:[-.66,.30,-.61],sun:0xabc8f4,sky:0x92b1e0,ground:0x626578,exposure:1.18,strength:.64,environment:.72}
});
const skyVertex=`varying vec3 vDirection;
void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const skyFragment=`
varying vec3 vDirection;
uniform vec3 sunDirection;
uniform float warmth;
uniform float night;
uniform float photoReady;
uniform float photoRotation;
uniform sampler2D photo;
uniform sampler2D photoDetail;
uniform float detailReady;
uniform vec3 horizonColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
void main(){
 vec3 d=normalize(vDirection);
 float elevation=smoothstep(-.035,.86,d.y);
 vec3 zenith=mix(vec3(.13,.33,.65),vec3(.12,.27,.49),warmth);
 zenith=mix(zenith,vec3(.018,.045,.115),night);
 vec3 color=mix(horizonColor,zenith,elevation);
 float towardSun=pow(max(dot(normalize(vec3(d.x,.08,d.z)),normalize(vec3(sunDirection.x,.08,sunDirection.z))),0.),5.);
 float horizonGlow=exp(-abs(d.y-.035)*8.)*towardSun;
 color+=mix(vec3(.12,.065,.02),vec3(.04,.018,.01),night)*horizonGlow*warmth;
 // Preserve the real photograph's clouds; grade its radiance rather than
 // trying to extract a saturation mask (which erased soft clouds).
 float cr=cos(photoRotation),sr=sin(photoRotation);
 vec3 rotated=vec3(cr*d.x-sr*d.z,d.y,sr*d.x+cr*d.z);
 vec2 uv=vec2(atan(rotated.z,rotated.x)*.159154943+.5,asin(clamp(rotated.y,-1.,1.))*.318309886+.5);
 vec3 source=texture2D(photo,uv).rgb;
 // 4K visible-sky layer (gamma-encoded radiance up to 6); dithered against banding.
 // Only the brightest sun core exceeds the encoded range; keep the HDR value there.
 if(detailReady>.5&&max(source.r,max(source.g,source.b))<5.5){vec3 encoded=texture2D(photoDetail,uv).rgb+(hash(gl_FragCoord.xy)-.5)/255.;source=6.*pow(clamp(encoded,0.,1.),vec3(2.2));}
 vec2 cloudPosition=d.xz/max(d.y+.20,.14)*1.6;
 float cloudNoise=noise(cloudPosition)*.6+noise(cloudPosition*2.07+8.1)*.28+noise(cloudPosition*4.3)*.12;
 float fallbackCloud=smoothstep(.54,.76,cloudNoise)*.52;
 float clouds=fallbackCloud*smoothstep(-.01,.14,d.y);
 vec3 cloudColor=mix(vec3(1.18,1.16,1.10),vec3(1.13,.88,.64),warmth);
 cloudColor=mix(cloudColor,vec3(.11,.135,.21)+horizonGlow*vec3(.12,.055,.028),night);
 color=mix(color,cloudColor,clouds*mix(.64,.40,night));
 vec3 photographic=source*.78;
 vec3 goldenPhoto=photographic*vec3(1.14,.97,.86);
 goldenPhoto+=vec3(.12,.055,.012)*exp(-max(d.y,0.)*7.)*towardSun;
 photographic=mix(photographic,goldenPhoto,warmth);
 vec3 twilightPhoto=source*vec3(.105,.145,.245)+vec3(.008,.012,.024);
 photographic=mix(photographic,twilightPhoto,night);
 color=mix(color,photographic,photoReady);
 float sunDisc=pow(max(dot(d,sunDirection),0.),1800.);
 color+=mix(vec3(5.,4.6,3.8),vec3(5.,3.5,2.2),warmth)*sunDisc*(1.-night)*(1.-photoReady);
 // Identical horizon and fog radiance removes the ground/sky seam. The
 // photograph remains unchanged above the low atmospheric haze band.
 float horizonBlend=smoothstep(.005,.16,d.y);
 #ifndef TONE_MAPPING
  // The linear offscreen pipeline applies its OutputPass after scene fog.
  color=mix(horizonColor,color,horizonBlend);
 #endif
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 #ifdef TONE_MAPPING
  // r180 direct rendering applies material fog after tone mapping. Match
  // that output-space fog exactly at the horizon in low-quality mode; do
  // not alter the linear-radiance match used by balanced/high rendering.
  gl_FragColor.rgb=mix(linearToOutputTexel(vec4(horizonColor,1.)).rgb,gl_FragColor.rgb,horizonBlend);
 #endif
}`;
export function createLighting(renderer,scene,{onReady=()=>{}}={}){
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 const dir=new THREE.Vector3(),focus=new THREE.Vector3(22,18,8),lastFocus=new THREE.Vector3(Infinity,0,0);
 const emptyPhoto=new THREE.DataTexture(new Uint8Array([128,160,192,255]),1,1,THREE.RGBAFormat);emptyPhoto.needsUpdate=true;
 const horizons={daylight:new THREE.Color(.35,.38,.46),golden:new THREE.Color(.48,.40,.34),twilight:new THREE.Color(.075,.095,.145)};
 const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,uniforms:{sunDirection:{value:dir},warmth:{value:0},night:{value:0},photoReady:{value:0},photoRotation:{value:0},photo:{value:emptyPhoto},photoDetail:{value:emptyPhoto},detailReady:{value:0},horizonColor:{value:horizons.daylight.clone()}},vertexShader:skyVertex,fragmentShader:skyFragment});
 const sky=new THREE.Mesh(new THREE.SphereGeometry(450,40,24),material);sky.name='R5 atmospheric sky · illustrative';sky.frustumCulled=false;sky.renderOrder=-1000;scene.add(sky);
 const envScene=new THREE.Scene();envScene.add(new THREE.Mesh(sky.geometry,material));const environments={};
 function skyUniforms(key){dir.fromArray(LIGHT_LOOKS[key].direction).normalize();material.uniforms.warmth.value=key==='daylight'?0:1;material.uniforms.night.value=key==='twilight'?1:0;material.uniforms.photoRotation.value=(.5951-.5)*Math.PI*2-Math.atan2(dir.z,dir.x);material.uniforms.horizonColor.value.copy(horizons[key]);}
 const pmrem=new THREE.PMREMGenerator(renderer);
 for(const key of Object.keys(LIGHT_LOOKS)){skyUniforms(key);environments[key]=pmrem.fromScene(envScene,.025,.1,1000);}
 const room=new RoomEnvironment(),indoor=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();
 const hemi=new THREE.HemisphereLight(0xc3d9f0,0x9c9383,.20);scene.add(hemi);
 const sun=new THREE.DirectionalLight(0xfff4e8,3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00006;sun.shadow.normalBias=.025;sun.shadow.radius=2;scene.add(sun,sun.target);
 const fill=new THREE.DirectionalLight(0xc3d9f0,.08);fill.position.set(60,45,70);scene.add(fill);
 // Dedicated soft studio bounce for floor presentations. Zero intensity in
 // every existing R5 mode keeps the exterior and original rooms unchanged.
 const floorRim=new THREE.DirectionalLight(0xe4edff,0);floorRim.position.set(-35,38,55);scene.add(floorRim);
 let currentMode='exterior',currentLook='daylight',quality='balanced',photoSky=null,photoEnvironment=null,disposed=false,lastExtent=0,facadeRoot=null;
 let facadeState={look:'daylight',materials:0,facadeMeshes:0,glow:0,illustrative:true};
 function updateShadowBias(extent){
  // Preserve verified r4 texel-scaled bias: broad urban receivers require more
  // offset than furniture. A fixed cm offset caused false sloping bands.
  const texel=2*extent/sun.shadow.mapSize.x,slope=Math.sqrt(Math.max(0,1-dir.y*dir.y));
  sun.shadow.normalBias=currentMode==='exterior'?Math.max(.035,Math.min(.33,2*texel*slope+.005)):.024;sun.shadow.bias=currentMode==='exterior'?-.00010:-.00009;
 }
 function placeSun(extent){sun.target.position.copy(focus);sun.position.copy(focus).addScaledVector(dir,130);Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:.5,far:300});sun.shadow.camera.updateProjectionMatrix();updateShadowBias(extent);}
 function apply(){
  const outside=currentMode==='exterior',enclosed=currentMode==='enclosed',cutaway=currentMode==='cutaway',floorOverview=currentMode==='floor-overview',floorInside=currentMode==='floor-inside',floorStudio=floorOverview||floorInside,effectiveLook=outside?currentLook:'daylight',look=LIGHT_LOOKS[effectiveLook];skyUniforms(effectiveLook);
  sun.color.setHex(look.sun);hemi.color.setHex(look.sky);hemi.groundColor.setHex(look.ground);fill.color.setHex(look.sky);
  const photographic=outside&&photoEnvironment&&currentLook==='daylight';
  scene.environment=outside?(photographic?photoEnvironment.texture:environments[currentLook].texture):indoor.texture;
  scene.environmentIntensity=floorInside?.36:floorOverview?.24:enclosed?.26:cutaway?.28:outside?look.environment:.40;
  scene.environmentRotation.set(0,photographic?material.uniforms.photoRotation.value:0,0);
  const background=floorStudio?'#e3e2da':outside?(currentLook==='twilight'?'#596479':currentLook==='golden'?'#d2c1ad':'#bdcddf'):enclosed?'#343b3f':cutaway?'#c7d0d0':'#dbe2e2';
  // The HDR used to be hidden behind a flat background. Display it, aligned
  // with its own reflections. All assets are bundled and work offline.
  // Outdoors the sky dome covers the frame; a background texture underneath it
  // would only be drawn twice more per frame (main and transmission passes).
  scene.background=outside?null:new THREE.Color(background);
  scene.backgroundRotation.copy(scene.environmentRotation);scene.backgroundIntensity=.78;scene.backgroundBlurriness=0;
  sky.visible=outside;
  scene.fog=outside?new THREE.Fog(horizons[currentLook],180,450):null;
  sun.intensity=enclosed?0:outside?look.strength:cutaway?2.25:1.85;hemi.intensity=enclosed?.11:outside?(currentLook==='twilight'?.21:.20):cutaway?.19:.23;fill.intensity=enclosed?.025:outside?(currentLook==='twilight'?.14:.11):cutaway?.07:.09;
  floorRim.intensity=0;floorRim.visible=floorStudio;
  if(floorStudio){
   // This is a neutral presentation rig, not a sun-position prediction.
   dir.set(-.52,.84,-.38).normalize();sun.color.setHex(0xfff7ee);
   hemi.color.setHex(0xd7e4f1);hemi.groundColor.setHex(0xc3b6a3);fill.color.setHex(0xe4ecf5);
   sun.intensity=floorInside?1.15:2.15;hemi.intensity=floorInside?.24:.16;
   fill.intensity=floorInside?.24:.08;floorRim.intensity=floorInside?.10:.08;
  }
  // Enclosed/cutaway exposure stays independent of outdoor blue-hour.
  renderer.toneMappingExposure=outside?look.exposure:enclosed?1.10:1.0;
  facadeState=setFacadeAtmosphere(facadeRoot,currentLook,outside);lastExtent=0;placeSun(55);renderer.shadowMap.needsUpdate=true;
 }
 function update(camera,target){
  if(disposed||!target)return false;sky.position.copy(camera.position);const outside=currentMode==='exterior',distance=camera.position.distanceTo(target);
  const desired=outside?Math.max(48,Math.min(88,distance*.52)):Math.max(7,Math.min(48,distance*.48)),extent=Math.ceil(desired/2)*2;
  if(extent===lastExtent&&lastFocus.distanceToSquared(target)<.04)return false;focus.copy(target);lastFocus.copy(target);lastExtent=extent;placeSun(extent);renderer.shadowMap.needsUpdate=true;return true;
 }
 function setMode(mode){currentMode=mode;apply();}
 function setLook(look){if(!LIGHT_LOOKS[look])throw Error('Unknown light look: '+look);currentLook=look;apply();onReady();}
 function setModel(root){facadeRoot=root;facadeState=setFacadeAtmosphere(root,currentLook,currentMode==='exterior');onReady();return facadeState;}
 function setQuality(value){if(!['auto','high','balanced','low'].includes(value))throw Error('Unknown lighting quality: '+value);quality=value;const small=value==='low'||(value==='auto'&&typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches),size=small?1024:value==='high'?4096:3072;if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;updateShadowBias(lastExtent||55);renderer.shadowMap.needsUpdate=true;}}
 setMode('exterior');
 const ready=(async()=>{let texture,generator;try{
  texture=await loadLocalHDRI(THREE,new URL('./assets/sky/kloofendal_puresky_2k.hdr',import.meta.url));if(disposed){texture.dispose();return{status:'DISPOSED'};}
  generator=new THREE.PMREMGenerator(renderer);photoEnvironment=generator.fromEquirectangular(texture);photoSky=texture;material.uniforms.photo.value=texture;material.uniforms.photoReady.value=1;
  // Average the actual photographic horizon (about 3 degrees above it), in
  // linear radiance, rather than choosing an unrelated CSS background color.
  const pixels=texture.image.data,w=texture.image.width,row=Math.floor(texture.image.height*.483),sum=[0,0,0];
  for(let x=0;x<w;x++)for(let c=0;c<3;c++)sum[c]+=Math.min(4,THREE.DataUtils.fromHalfFloat(pixels[(row*w+x)*4+c]))/w;
  horizons.daylight.setRGB(sum[0]*.78,sum[1]*.78,sum[2]*.78);
  for(const key of ['golden','twilight']){skyUniforms(key);const previous=environments[key];environments[key]=generator.fromScene(envScene,.025,.1,1000);previous.dispose();}
  apply();onReady();loadSkyDetail();return{status:'LOCAL_HDRI_READY',look:currentLook,visibleSky:true};
 }catch(error){if(!photoSky)texture?.dispose();if(!disposed){console.warn('Local sky unavailable; procedural fallback retained',error);apply();onReady();}return{status:'PROCEDURAL_FALLBACK'};}finally{generator?.dispose();}})();
 // Desktop only: a 4K layer for the visible clouds (the 2K HDR keeps lighting and reflections).
 let skyDetail=null;
 function loadSkyDetail(){
  if(disposed||skyDetail||quality==='low'||(typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches))return;
  skyDetail=new THREE.TextureLoader().load(new URL('./assets/sky/kloofendal_puresky_4k_detail.webp',import.meta.url).href,texture=>{if(disposed){texture.dispose();return;}material.uniforms.detailReady.value=1;onReady();},undefined,()=>{skyDetail=null;});
  skyDetail.colorSpace=THREE.NoColorSpace;skyDetail.generateMipmaps=false;skyDetail.minFilter=THREE.LinearFilter;skyDetail.magFilter=THREE.LinearFilter;skyDetail.wrapS=THREE.RepeatWrapping;
  material.uniforms.photoDetail.value=skyDetail;
 }
 function dispose(){if(disposed)return;disposed=true;skyDetail?.dispose();for(const o of [sun,sun.target,hemi,fill,floorRim,sky])scene.remove(o);sun.shadow.map?.dispose();for(const e of Object.values(environments))e.dispose();indoor.dispose();photoEnvironment?.dispose();if(scene.background===photoSky)scene.background=null;photoSky?.dispose();emptyPhoto.dispose();material.dispose();sky.geometry.dispose();scene.environment=null;}
 return{setMode,setLook,setModel,setQuality,update,dispose,sun,sky,outdoor:environments.daylight,indoor,ready,snapshot:()=>({mode:currentMode,look:currentLook,quality,shadowSize:sun.shadow.mapSize.x,shadowExtent:lastExtent,shadowTexelMetres:2*lastExtent/sun.shadow.mapSize.x,shadowNormalBias:sun.shadow.normalBias,shadowDepthBias:sun.shadow.bias,environmentIntensity:scene.environmentIntensity,exposure:renderer.toneMappingExposure,sky:photoSky?(currentLook==='daylight'?'local-photographic-hdri':'photo-contour-atmosphere'):'procedural-fallback',skyDetail:material.uniforms.detailReady.value>0,visibleSky:currentMode==='exterior',facade:facadeState,artisticLighting:true})};
}
