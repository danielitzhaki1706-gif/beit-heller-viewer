import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const reconstruct=`uniform sampler2D tDepth;uniform mat4 inverseProjection;
 vec3 viewPosition(vec2 uv){float d=texture2D(tDepth,uv).x;vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}`;
// Metre-bounded contact from the SAME render as colour. No overrideMaterial,
// hidden-ceiling silhouettes, or full walls replacing the active clipping.
const contactShader=`varying vec2 vUv;${reconstruct}
 uniform vec2 resolution;uniform mat4 projection;uniform float radius;uniform float samples;
 void main(){
  float depth=texture2D(tDepth,vUv).x;if(depth>=.999999){gl_FragColor=vec4(1.,0.,0.,1.);return;}
  vec3 p=viewPosition(vUv);vec2 texel=1./resolution;
  vec3 pr=viewPosition(vUv+vec2(texel.x,0.))-p,pl=p-viewPosition(vUv-vec2(texel.x,0.));
  vec3 pu=viewPosition(vUv+vec2(0.,texel.y))-p,pd=p-viewPosition(vUv-vec2(0.,texel.y));
  vec3 n=normalize(cross(abs(pr.z)<abs(pl.z)?pr:pl,abs(pu.z)<abs(pd.z)?pu:pd));if(dot(n,-p)<0.)n=-n;
  float pixelRadius=clamp(radius*projection[1][1]*resolution.y/(2.*max(.1,-p.z)),2.,54.);
  float angle=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453)*6.2831853;
  float sum=0.,valid=0.;
  for(int i=0;i<12;i++){
   if(float(i)>=samples)break;float f=(float(i)+.5)/samples;float a=angle+float(i)*2.3999632;
   vec2 uv=vUv+vec2(cos(a),sin(a))*sqrt(f)*pixelRadius*texel;
   if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.)))||texture2D(tDepth,uv).x>=.999999)continue;
   vec3 delta=viewPosition(uv)-p;float distance=length(delta);
   float horizon=max((dot(n,delta)-max(.012,radius*.055))/max(distance,.0001)-.10,0.);
   float attenuation=1.-smoothstep(radius*.25,radius,distance);sum+=horizon*attenuation;valid+=1.;
  }
  gl_FragColor=vec4(clamp(1.-2.7*sum/max(valid,1.),0.,1.),-p.z,0.,1.);
 }`;
const compositeShader=`varying vec2 vUv;${reconstruct}
 uniform sampler2D tDiffuse;uniform sampler2D tContact;uniform vec2 contactResolution;uniform float strength;uniform float radius;
 void main(){vec4 color=texture2D(tDiffuse,vUv);float depth=texture2D(tDepth,vUv).x;
  if(depth>=.999999){gl_FragColor=color;return;}
  float z=-viewPosition(vUv).z,ao=0.,weights=0.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
   vec2 sampleUv=vUv+vec2(float(x),float(y))/contactResolution;vec2 s=texture2D(tContact,sampleUv).rg;
   float w=exp(-abs(s.y-z)/max(.018,radius*.10))*(x==0&&y==0?2.:1.);ao+=s.x*w;weights+=w;
  }
  float contact=weights>0.0001?ao/weights:1.;gl_FragColor=vec4(color.rgb*(1.-strength*(1.-contact)),color.a);
 }`;
export function createVisualPipeline(renderer,scene,camera,{onFallback=()=>{}}={}){
 const screenSize=new THREE.Vector2(),inverseProjection=new THREE.Matrix4(),projection=new THREE.Matrix4();
 const contactMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:contactShader,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{tDepth:{value:null},inverseProjection:{value:inverseProjection},projection:{value:projection},resolution:{value:new THREE.Vector2()},radius:{value:.24},samples:{value:12}}});
 const compositeMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:compositeShader,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{tDepth:{value:null},inverseProjection:{value:inverseProjection},tDiffuse:{value:null},tContact:{value:null},contactResolution:{value:new THREE.Vector2()},radius:{value:.24},strength:{value:.32}}});
 const quad=new FullScreenQuad(contactMaterial),output=new OutputPass();output.renderToScreen=true;
 // Exterior HDR sky and fog share tone mapping. The flat interior background
 // keeps its unlit display colour. No extra geometry pass is required.
 output.uniforms.tSceneDepth={value:null};output.uniforms.r5Atmosphere={value:1};
 output.material.fragmentShader=output.material.fragmentShader.replace('uniform sampler2D tDiffuse;','uniform sampler2D tDiffuse;\n uniform sampler2D tSceneDepth; uniform float r5Atmosphere;').replace('// tone mapping','// tone mapping\n if(texture2D(tSceneDepth,vUv).x<.999999||r5Atmosphere>.5){').replace('// color space','}\n // color space');
 let sceneTarget=null,contactTarget=null,compositeTarget=null,mode='exterior',requested='auto',effective='balanced',width=1,height=1,disposed=false,failure=null,frames=0,sceneCalls=0,sceneTriangles=0,renderMs=0;
 // Adaptive resolution: only ever lowered, after sustained slow continuous frames.
 let budgetScale=1,slowFrames=[],idleFrames=[],refresh=16.7,allocatedRatio=0;
 const supported=renderer.capabilities.isWebGL2&&renderer.extensions.has('EXT_color_buffer_float');
 function selectQuality(value){if(value!=='auto')return value;const coarse=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches,memory=typeof navigator!=='undefined'?navigator.deviceMemory:undefined;return coarse||(memory&&memory<=4)?'low':'balanced';}
 function releaseTargets(){for(const t of [sceneTarget,contactTarget,compositeTarget])t?.dispose();sceneTarget=contactTarget=compositeTarget=null;}
 function allocate(){
  releaseTargets();allocatedRatio=renderer.getPixelRatio();if(effective==='low'||!supported||failure)return;
  // Device pixels up to 2x, so HiDPI and 4K screens are not upscaled from a
  // small buffer; the pixel budget keeps the cost bounded.
  const ratio=Math.min(renderer.getPixelRatio(),2),budget=(effective==='high'?5600000:3500000)*budgetScale;
  const scale=Math.min(ratio,Math.sqrt(budget/(width*height))),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
  sceneTarget=new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false,samples:Math.min(renderer.capabilities.maxSamples,4)});
  sceneTarget.depthTexture=new THREE.DepthTexture(w,h,THREE.UnsignedIntType);sceneTarget.resolveDepthBuffer=true;output.uniforms.tSceneDepth.value=sceneTarget.depthTexture;
  contactTarget=new THREE.WebGLRenderTarget(Math.ceil(w*.5),Math.ceil(h*.5),{type:THREE.HalfFloatType,depthBuffer:false,stencilBuffer:false});
  compositeTarget=new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,depthBuffer:false,stencilBuffer:false});
  contactMaterial.uniforms.tDepth.value=sceneTarget.depthTexture;contactMaterial.uniforms.resolution.value.set(w,h);contactMaterial.uniforms.samples.value=effective==='high'?12:8;
  compositeMaterial.uniforms.tDepth.value=sceneTarget.depthTexture;compositeMaterial.uniforms.tDiffuse.value=sceneTarget.texture;compositeMaterial.uniforms.tContact.value=contactTarget.texture;compositeMaterial.uniforms.contactResolution.value.set(contactTarget.width,contactTarget.height);
 }
 function resize(w,h){const nextWidth=Math.max(1,Math.round(w)),nextHeight=Math.max(1,Math.round(h));if(nextWidth===width&&nextHeight===height&&sceneTarget&&renderer.getPixelRatio()===allocatedRatio)return;width=nextWidth;height=nextHeight;allocate();}
 function setQuality(value){if(!['auto','high','balanced','low'].includes(value))throw Error('Unknown visual quality: '+value);requested=value;effective=selectQuality(value);budgetScale=1;slowFrames=[];allocate();return sceneTarget?effective:'low';}
 function setMode(value){mode=value;
  // Exterior glazing is seen at a distance: a half-resolution see-through pass is
  // indistinguishable there. Floor and room views keep full resolution.
  renderer.transmissionResolutionScale=value==='exterior'?.5:1;output.uniforms.r5Atmosphere.value=value==='exterior'?1:0;const radius=value==='exterior'?.65:value==='enclosed'?.22:.28;contactMaterial.uniforms.radius.value=radius;compositeMaterial.uniforms.radius.value=radius;compositeMaterial.uniforms.strength.value=value==='exterior'?.24:.32;}
 function render(){
  if(disposed)return;const started=performance.now();if(!sceneTarget){renderer.render(scene,camera);sceneCalls=renderer.info.render.calls;sceneTriangles=renderer.info.render.triangles;renderMs=performance.now()-started;frames++;return;}
  const previous=renderer.getRenderTarget(),autoClear=renderer.autoClear;
  try{inverseProjection.copy(camera.projectionMatrixInverse);projection.copy(camera.projectionMatrix);renderer.autoClear=true;
   renderer.setRenderTarget(sceneTarget);renderer.render(scene,camera);sceneCalls=renderer.info.render.calls;sceneTriangles=renderer.info.render.triangles;quad.material=contactMaterial;renderer.setRenderTarget(contactTarget);quad.render(renderer);
   quad.material=compositeMaterial;renderer.setRenderTarget(compositeTarget);quad.render(renderer);output.render(renderer,null,compositeTarget);frames++;
  }catch(error){failure=String(error?.message||error);releaseTargets();onFallback(error);renderer.setRenderTarget(previous);renderer.render(scene,camera);}
  finally{renderer.setRenderTarget(previous);renderer.autoClear=autoClear;renderMs=performance.now()-started;}
 }
 // Compiles the scene's shader programs (in parallel where the browser allows)
 // for the target the next frame renders into, so the first frame does not stall.
 async function compile(timeout=4000,object=scene){
  if(!renderer.compileAsync)return;const previous=renderer.getRenderTarget();let pending;
  try{renderer.setRenderTarget(sceneTarget);pending=renderer.compileAsync(object,camera,object===scene?null:scene);}finally{renderer.setRenderTarget(previous);}
  await Promise.race([pending,new Promise(resolve=>setTimeout(resolve,timeout))]);
 }
 // Interval between two consecutive rendered frames while the camera moves.
 function reportFrame(interval){
  if(!sceneTarget||budgetScale<=.45||!(interval>0&&interval<250))return;slowFrames.push(interval);if(slowFrames.length<45)return;
  const sorted=[...slowFrames].sort((a,b)=>a-b),median=sorted[sorted.length>>1];slowFrames=[];
  // Only a GPU that misses the display's own refresh by half again counts as slow;
  // a 30 Hz or battery-capped display never lowers the resolution by itself.
  if(median>Math.max(27,refresh*1.5)){budgetScale*=.7;allocate();}
 }
 function reportIdle(interval){if(!(interval>0&&interval<250))return;idleFrames.push(interval);if(idleFrames.length<30)return;const sorted=[...idleFrames].sort((a,b)=>a-b);refresh=sorted[sorted.length>>1];idleFrames=[];}
 function dispose(){if(disposed)return;disposed=true;releaseTargets();quad.dispose();contactMaterial.dispose();compositeMaterial.dispose();output.dispose();}
 function snapshot(){return{revision:THREE.REVISION,mode,requestedQuality:requested,effectiveQuality:sceneTarget?effective:'low',supported,contactEnabled:!!sceneTarget,renderSize:sceneTarget?[sceneTarget.width,sceneTarget.height]:null,samples:sceneTarget?.samples||0,maximumContactDarkening:sceneTarget?compositeMaterial.uniforms.strength.value:0,frames,sceneCalls,sceneTriangles,renderMs,failure,budgetScale};}
 renderer.getSize(screenSize);width=Math.max(1,screenSize.x);height=Math.max(1,screenSize.y);setQuality('auto');setMode('exterior');return{render,resize,setMode,setQuality,reportFrame,reportIdle,compile,dispose,snapshot,get target(){return sceneTarget;}};
}
