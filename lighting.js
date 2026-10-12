import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {loadLocalHDRI} from './local-hdri.js';
export function createLighting(renderer,scene,{onReady=()=>{}}={}){
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
 const dir=new THREE.Vector3(-.55,.85,-.45).normalize();
 const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{sunDirection:{value:dir}},
 vertexShader:'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
 fragmentShader:'varying vec3 vDirection; uniform vec3 sunDirection; void main(){vec3 d=normalize(vDirection);float h=smoothstep(-.08,.65,d.y);vec3 sky=mix(vec3(.82,.85,.78),vec3(.30,.48,.67),h);sky=mix(vec3(.29,.32,.24),sky,smoothstep(-.12,.01,d.y));float s=pow(max(dot(d,sunDirection),0.0),600.0);gl_FragColor=vec4(sky+vec3(7.0,5.5,3.5)*s,1.0);}'});
 const sky=new THREE.Mesh(new THREE.SphereGeometry(450,32,16),material);sky.frustumCulled=false;scene.add(sky);
 const envScene=new THREE.Scene();envScene.add(new THREE.Mesh(sky.geometry,material));
 const pmrem=new THREE.PMREMGenerator(renderer),outdoor=pmrem.fromScene(envScene,.02,.1,1000),room=new RoomEnvironment(),indoor=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();
 const hemi=new THREE.HemisphereLight(0xe4efff,0x92866e,1.15);scene.add(hemi);
 const sun=new THREE.DirectionalLight(0xfff0d9,2.8);sun.position.copy(dir).multiplyScalar(100).add(new THREE.Vector3(22,20,8));sun.target.position.set(22,20,8);scene.add(sun,sun.target);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
 Object.assign(sun.shadow.camera,{left:-55,right:55,top:58,bottom:-58,near:1,far:220});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.00015;sun.shadow.normalBias=.035;
 const fill=new THREE.DirectionalLight(0xe4edff,.5);fill.position.set(60,45,70);scene.add(fill);
 let currentMode='exterior',photoSky=null,photoEnvironment=null;
 // Artistic heading from the existing asset's bright-sun U, not a Rehovot solar study.
 const skyYaw=(.5951-.5)*Math.PI*2-Math.atan2(dir.z,dir.x);
 function setMode(mode){
  currentMode=mode;const outside=mode==='exterior',enclosed=mode==='enclosed',cutaway=mode==='cutaway',photographic=outside&&photoSky!==null;
  scene.environment=outside?(photoEnvironment?.texture||outdoor.texture):indoor.texture;
  // Keep the HDR for reflections, but do not display its unsurveyed horizon
  // below the site. A matching atmospheric backdrop lets the mapped ground
  // fade naturally without making the building appear suspended over water.
  sky.visible=false;scene.background=new THREE.Color(outside?'#d9e3e3':enclosed?'#3b4141':cutaway?'#d0d6d2':'#e8ebe2');
  scene.fog=outside?new THREE.Fog('#d9e3e3',350,750):null;
  scene.environmentRotation.set(0,photographic?skyYaw:0,0);scene.backgroundRotation.set(0,photographic?skyYaw:0,0);
  scene.environmentIntensity=enclosed?.18:cutaway?.28:photographic?.65:1;scene.backgroundIntensity=1;scene.backgroundBlurriness=0;
  sun.shadow.normalBias=outside?.12:.035;
  sun.shadow.bias=outside?-.00025:-.00015;
  sun.intensity=enclosed?0:outside?2.8:cutaway?1.8:1.25;hemi.intensity=enclosed?.18:outside?1.15:cutaway?.32:.8;fill.intensity=enclosed?.08:outside?.5:cutaway?.18:.3;renderer.shadowMap.needsUpdate=true;
 }
 setMode('exterior');
 const ready=(async()=>{
  let texture,generator;
  try{
   texture=await loadLocalHDRI(THREE,'./assets/sky/kloofendal_puresky_2k.hdr');
   generator=new THREE.PMREMGenerator(renderer);const filtered=generator.fromEquirectangular(texture);
   photoSky=texture;photoEnvironment=filtered;setMode(currentMode);onReady();
   return {status:'LOCAL_HDRI_READY',artisticRotationRadians:skyYaw};
  }catch(error){if(!photoSky)texture?.dispose();console.warn('Local sky unavailable; procedural fallback retained',error);setMode(currentMode);onReady();return {status:'PROCEDURAL_FALLBACK'};}
  finally{generator?.dispose();}
 })();
 return {setMode,sun,sky,outdoor,indoor,ready};
}
