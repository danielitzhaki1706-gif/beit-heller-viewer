import * as THREE from 'three';
// Presentation-only daylight and surface response. No model vertices or approved dimensions change.
export function daylight(renderer,scene){
 renderer.shadowMap.enabled=true;
 renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=.88;
 const skyScene=new THREE.Scene();
 const sky=new THREE.Mesh(new THREE.SphereGeometry(150,32,16),new THREE.ShaderMaterial({
 side:THREE.BackSide,
 uniforms:{},
 vertexShader:`varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
 fragmentShader:`varying vec3 vDirection;void main(){vec3 d=normalize(vDirection);float h=max(d.y,0.0);vec3 color=mix(vec3(.72,.77,.78),vec3(.22,.42,.65),pow(h,.45));if(d.y<0.0)color=mix(vec3(.72,.77,.78),vec3(.28,.26,.22),min(-d.y*3.0,1.0));float sun=pow(max(dot(d,normalize(vec3(.4,.75,-.5))),0.0),260.0);gl_FragColor=vec4(color+vec3(4.0,3.5,2.8)*sun,1.0);}`
 }));
 skyScene.add(sky);
 const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(skyScene,.025);
 scene.environment=env.texture;scene.environmentIntensity=.45;
 scene.background=new THREE.Color('#c9dce9');
 scene.fog=new THREE.Fog('#c9dce9',95,230);
 sky.geometry.dispose();sky.material.dispose();pmrem.dispose();
 const hemi=new THREE.HemisphereLight(0xcadfff,0x8c8172,1.15);scene.add(hemi);
 const sun=new THREE.DirectionalLight(0xffefd9,2.6);sun.position.set(50,65,-35);
 sun.target.position.set(25,0,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
 Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:140});
 sun.shadow.bias=-.0001;sun.shadow.normalBias=.035;
 scene.add(sun,sun.target);
 return {setMode(mode){hemi.intensity=mode==='office'?1.45:1.15;scene.environmentIntensity=mode==='office'?.55:.45;sun.target.position.y=mode==='office'?11.39:0;},
 setQuality(high){renderer.shadowMap.enabled=high;renderer.setPixelRatio(Math.min(devicePixelRatio,high?1.5:1));}};
}
export function finishModel(root){
 const done=new Set();
 root.traverse(o=>{
 if(!o.isMesh)return;
 const materials=Array.isArray(o.material)?o.material:[o.material];
 o.castShadow=materials.every(m=>!(m.transmission>.1)&&!m.transparent);
 o.receiveShadow=true;
 for(const m of materials){
 if(done.has(m))continue;done.add(m);
 if(m.transmission>0){m.envMapIntensity=.8;continue;}
 // Fine surface grain is purely a shading study, never a construction detail.
 if(m.roughness>.5){
 m.onBeforeCompile=shader=>{
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vFinishLocal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFinishLocal=position;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vFinishLocal;').replace('#include <color_fragment>',`#include <color_fragment>
 float grain=fract(sin(dot(floor(vFinishLocal*380.0),vec3(12.9898,78.233,36.719)))*43758.5453);
 diffuseColor.rgb*=.975+.05*grain;`);
 };
 m.customProgramCacheKey=()=>'heller-finish-02';
 }
 }
 });
}
