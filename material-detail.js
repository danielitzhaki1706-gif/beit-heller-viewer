// Runtime material refinement. Positions, indices, source UVs and source assets are untouched.
// Detail textures are deterministic procedural finishes, not measured product scans.
import {installFacadeAtmosphere} from './facade-atmosphere.js?v=20261022-r7';
const VERSION='r5.1';
const materialCache=new WeakMap(),geometryCache=new WeakMap(),rootCache=new WeakMap(),textureCaches=new WeakMap();
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const fract=v=>v-Math.floor(v);
const hash=(x,y,seed)=>fract(Math.sin(x*127.1+y*311.7+seed*47.31)*43758.5453123);
const profiles={
 asphalt:{period:[2.4,2.4],rough:.88,range:.14,relief:.00085,variation:.38},
 concrete:{period:[1.2,1.2],rough:.78,range:.18,relief:.00024,variation:.19},
 stone:{period:[1.2,1.2],rough:.60,range:.18,relief:.00016,variation:.16},
 roof:{period:[3.2,3.2],rough:.84,range:.10,relief:.00035,variation:.16},
 wood:{period:[2.4,.32],rough:.48,range:.20,relief:.00009,variation:.28},
 fabric:{period:[.12,.12],rough:.91,range:.08,relief:.00012,variation:.20},
 carpet:{period:[.32,.32],rough:.97,range:.04,relief:.00035,variation:.18},
 plaster:{period:[.7,.7],rough:.89,range:.10,relief:.00008,variation:.09},
 metal:{period:[.24,.24],rough:.34,range:.13,relief:.000006,variation:.06},
 cladding:{period:[.6,.6],rough:.29,range:.09,relief:.000010,variation:.05},
 ground:{period:[5.0,5.0],rough:.98,range:.04,relief:.0014,variation:.16},
 ballast:{period:[.8,.8],rough:.96,range:.07,relief:.004,variation:.34}
};
const native={BH_Material_000:'ground',BH_Material_001:'stone',BH_Material_002:'wood',BH_Material_003:'stone',BH_Material_004:'stone',BH_Material_005:'concrete',BH_Material_006:'glass',BH_Material_013:'glass',BH_Material_014:'facadeGlass',BH_Material_015:'concrete',BH_Material_016:'cladding',BH_Material_017:'glass',BH_Material_018:'cladding',BH_Material_019:'cladding',BH_Material_020:'cladding',BH_Material_021:'cladding',BH_Material_022:'roof',BH_Material_023:'cladding',BH_Material_024:'cladding',BH_Material_025:'concrete',BH_Material_026:'metal'};

export function classifyMaterialDetail(material,meshName='',kind='building'){
 if(material.userData?.r4MaterialDetail?.version===VERSION)return null;
 const name=(material.name||'').replace(/\.\d{3}$/,'');
 const n=name.toLowerCase(),mesh=meshName.toLowerCase().replace(/_/g,' ');
 if(kind==='context'&&/continuous (graded|urban) apron/.test(mesh))return 'displayGround';
 // Alpha masks, label colors and source botanical textures are intentional.
 if(material.alphaTest>0||material.alphaMap||/leaf|leaves|foliage|shrub|greenery|island_tree|groundcover/.test(n)||/^BH_Material_00[789]$|^BH_Material_01[012]$/.test(name))return null;
 if(/signage|label|letter|display|diffuser|luminaire|headlamp|indicator|gauge|marking|circulation white|road paint|paving joints|\bwater\b|neutral model edge/.test(n)||/^(text|label)(\.|\s|$)/.test(mesh))return null;
 if(material.emissiveIntensity>1||material.isMeshBasicMaterial)return null;
 if(native[name])return native[name];
 if(/neighbour blue grey glazing|automotive glass/.test(n))return 'proxyGlass';
 if((material.transmission||0)>.05||/transparent glazing|clear.*glaz|glazed entrance|clear.*guard|clear.*partition/.test(n))return 'glass';
 if(/asphalt/.test(n))return 'asphalt';
 if(/roof membrane|roof_study/.test(n))return 'roof';
 if(/rail ballast/.test(n))return 'ballast';
 if(/urban mineral ground|planting soil/.test(n))return 'ground';
 if(/carpet/.test(n))return 'carpet';
 if(/upholstery|fabric|acoustic panel/.test(n))return 'fabric';
 if(/oak|teak|timber|wood|bamboo/.test(n))return 'wood';
 if(/plaster|mineral walls|pale render/.test(n))return 'plaster';
 if(/concrete|curb|coping/.test(n))return 'concrete';
 if(/limestone|terrazzo|stone|paving|paver|porcelain|ceramic|wall tile|solid-surface/.test(n))return 'stone';
 if(/steel|stainless|brass|aluminium|aluminum|graphite.*metal|graphite.*rail|metal|hardware|galvanized|facade frames/.test(n))return 'metal';
 if(/vehicle paint|laminate|equipment casing|powder coat/.test(n))return 'cladding';
 return null;
}

// The red channel modulates source albedo; green is perceptual roughness.
// Physical height derivatives form tangent-space normals (not painted lighting).
export function createMaterialDetailPixels(role,size=512){
 const p=profiles[role];if(!p)throw Error('Unknown material detail role: '+role);
 const height=new Float32Array(size*size),detail=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4);
 const seed=Array.from(role).reduce((a,c)=>a+c.charCodeAt(0),0);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size,f=hash(x,y,seed),f2=hash(Math.floor(x/3),Math.floor(y/3),seed+4);
  const cloud=.5+.22*Math.sin(u*Math.PI*6+Math.sin(v*Math.PI*4))+.15*Math.cos(v*Math.PI*6-u*Math.PI*2);
  let grain=.45*f+.35*f2+.20*cloud,albedo=.5+(cloud-.5)*.65+(f-.5)*.18;
  if(role==='asphalt'){const stone=f>.89;grain=stone?.95:grain*.53;albedo=.5+(cloud-.5)*.75+(stone?.32:(f-.5)*.23);}
  if(role==='concrete'||role==='stone'||role==='plaster'){const pore=f<.012;grain=pore?.04:.5+(grain-.5)*.48;albedo=.5+(cloud-.5)*.55+(pore?-.26:(f-.5)*.07);}
  if(role==='roof'){grain=.48+.15*Math.sin(v*Math.PI*20+Math.sin(u*Math.PI*4))+(f-.5)*.17;albedo=.5+(cloud-.5)*.85+(f2-.5)*.16;}
  if(role==='wood'){const bent=v*92+Math.sin(u*Math.PI*4)*.55+Math.sin(u*Math.PI*10)*.10;const ring=Math.sin(bent*Math.PI*2);grain=.5+.20*ring+(f-.5)*.18;albedo=.5+.28*ring+.11*Math.sin(v*Math.PI*22+u*Math.PI*4)+(f-.5)*.09;}
  if(role==='fabric'){const warp=Math.sin(u*Math.PI*200),weft=Math.sin(v*Math.PI*200);grain=.5+.22*warp+.22*weft;albedo=.5+.12*warp*weft+(f-.5)*.12;}
  if(role==='carpet'){grain=.35+.55*f2+(f-.5)*.10;albedo=.5+(f2-.5)*.42+(cloud-.5)*.14;}
  if(role==='metal'){grain=.5+.15*Math.sin(v*Math.PI*340)+(f-.5)*.15;albedo=.5+(f2-.5)*.08;}
  if(role==='cladding'){grain=.5+(f-.5)*.12;albedo=.5+(cloud-.5)*.11;}
  if(role==='ground'){grain=.6*f2+.4*f;albedo=.5+(cloud-.5)*.9+(f2-.5)*.16;}
  if(role==='ballast'){const a=hash(Math.floor(x/22),Math.floor(y/19),seed);grain=.18+.73*a+(f-.5)*.09;albedo=.5+(a-.5)*.65;}
  height[y*size+x]=grain*p.relief;
  const k=(y*size+x)*4;detail[k]=Math.round(clamp(albedo)*255);detail[k+1]=Math.round(clamp(p.rough+(grain-.5)*p.range,.05,1)*255);detail[k+2]=128;detail[k+3]=255;
 }
 const at=(x,y)=>height[((y+size)%size)*size+(x+size)%size];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const dx=(at(x+1,y)-at(x-1,y))*size/(2*p.period[0]),dy=(at(x,y+1)-at(x,y-1))*size/(2*p.period[1]);
  const length=Math.sqrt(dx*dx+dy*dy+1),k=(y*size+x)*4;
  normal[k]=Math.round((.5-dx/length*.5)*255);normal[k+1]=Math.round((.5-dy/length*.5)*255);normal[k+2]=Math.round((.5+1/length*.5)*255);normal[k+3]=255;
 }
 return {size,detail,normal,period:p.period,variation:p.variation};
}

function texturesFor(THREE,role,channel=1){
 let cache=textureCaches.get(THREE);if(!cache){cache=new Map();textureCaches.set(THREE,cache);}
 const key=role+'/'+channel;if(cache.has(key))return cache.get(key);
 const pixels=createMaterialDetailPixels(role),out={period:pixels.period};
 for(const key of ['detail','normal']){
  const texture=new THREE.DataTexture(pixels[key],pixels.size,pixels.size,THREE.RGBAFormat);
  texture.name=`R4 ${role} ${key} · metric procedural`;texture.channel=channel;texture.colorSpace=THREE.NoColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;out[key]=texture;
 }
 cache.set(key,out);return out;
}

function installAlbedoDetail(material,role,THREE){
 const amount=profiles[role].variation;
 material.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   float r4Hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float r4Noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(r4Hash(i),r4Hash(i+vec2(1.,0.)),f.x),mix(r4Hash(i+vec2(0.,1.)),r4Hash(i+vec2(1.,1.)),f.x),f.y);}`);
  // Both textures use uv1. Keep all original color maps and their uv0 intact.
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  #ifdef USE_ROUGHNESSMAP
   float r4Fine=texture2D(roughnessMap,vRoughnessMapUv).r;
   vec2 r4Metres=vRoughnessMapUv*vec2(${profiles[role].period[0].toFixed(5)},${profiles[role].period[1].toFixed(5)});
   float r4Broad=r4Noise(r4Metres/13.0)*0.7+r4Noise(r4Metres/4.73+vec2(8.19,1.47))*0.3;
   diffuseColor.rgb*=1.0+${amount.toFixed(4)}*((r4Fine-0.5)*0.25+(r4Broad-0.5)*0.8);
  #endif`);
 };
 material.customProgramCacheKey=()=>`beit-heller-material-${VERSION}-${role}`;
 // Adaptive reveal clones materials. Preserve the detail hook on those clones.
 material.clone=function(){const copy=THREE.Material.prototype.clone.call(this);installAlbedoDetail(copy,role,THREE);return copy;};
}

function installClearPaneDetail(material,THREE){
 // r180's reflection roughness floor (0.0525) and bicubic transmission
 // filtering visibly frost a clear, zero-thickness pane. Keep the standard
 // IOR/Fresnel reflection, but sample thin clear transmission at native LOD.
 material.onBeforeCompile=shader=>{
  const transmission=THREE.ShaderChunk.transmission_fragment.replace('n, v, material.roughness,','n, v, roughnessFactor,');
  const sampler=THREE.ShaderChunk.transmission_pars_fragment.replace('return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );','if ( roughness <= 0.02 ) return textureLod( transmissionSamplerMap, fragCoord.xy, 0.0 );\n\t\treturn textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );');
  shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_pars_fragment>',sampler).replace('#include <transmission_fragment>',transmission);
 };
 material.customProgramCacheKey=()=>`beit-heller-clear-pane-${VERSION}`;
 material.clone=function(){const copy=THREE.Material.prototype.clone.call(this);installClearPaneDetail(copy,THREE);return copy;};
}

function refinedMaterial(source,role,THREE,channel=1){
 let cache=materialCache.get(source);if(!cache){cache=new Map();materialCache.set(source,cache);}
 const cacheKey=role+'/'+channel;if(cache.has(cacheKey))return cache.get(cacheKey);
 const physical=['glass','facadeGlass','proxyGlass','fabric'].includes(role);
 let m;
 if(physical&&!source.isMeshPhysicalMaterial){
  m=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(m,source);
  // Standard.copy replaces defines. Retain the Physical shader struct (ior,
  // transmission, sheen); otherwise real WebGL compilation fails.
  m.defines={...m.defines,STANDARD:'',PHYSICAL:''};
 }
 else m=source.clone();
 m.name=source.name;m.userData={...source.userData,r4MaterialDetail:{version:VERSION,role}};
 if(role==='displayGround'){
  // This is the explicitly unmeasured display apron, not mapped site land.
  m.map=null;m.normalMap=null;m.bumpMap=null;m.roughnessMap=null;m.color.setRGB(.31,.335,.31);m.roughness=1;m.metalness=0;
 }else if(role==='facadeGlass'||role==='glass'){
  const c=m.color,luma=.2126*c.r+.7152*c.g+.0722*c.b;
  // A soft mineral-blue pane reflects the real sky while retaining a view
  // through the furnished building. Clear interior partitions stay neutral.
  if(role==='facadeGlass')c.lerp(new THREE.Color(luma,luma,luma),.68).lerp(new THREE.Color(.54,.65,.70),.42);
  else c.lerp(new THREE.Color(1,1,1),.58);
  m.metalness=0;m.roughness=role==='facadeGlass'?.065:.016;m.transmission=role==='facadeGlass'?.74:.985;
  m.ior=1.5;m.thickness=0;m.opacity=1;m.transparent=false;m.depthWrite=true;m.depthTest=true;m.forceSinglePass=true;
  m.clearcoat=0;m.specularIntensity=1;m.envMapIntensity=role==='facadeGlass'?1.30:1;
  if(role==='facadeGlass')installFacadeAtmosphere(m,THREE);
  if(role==='glass')installClearPaneDetail(m,THREE);
 }else if(role==='proxyGlass'){
  // These proxy neighbour/car panes have no modeled interiors behind them.
  // Dielectric glazing over a dark unlit interior: the sky reflection, not a
  // painted blue, gives the window its value (darker head-on, bright at grazing).
  m.color.lerp(new THREE.Color(.16,.19,.21),.7);m.roughness=.05;m.metalness=0;m.clearcoat=1;m.clearcoatRoughness=.03;m.envMapIntensity=1.25;
 }else{
  const textures=texturesFor(THREE,role,channel);m.roughness=1;m.roughnessMap=textures.detail;
  m.normalMap=textures.normal;m.normalMapType=THREE.TangentSpaceNormalMap;m.normalScale.set(1,1);
  // Existing source maps and colors stay intact. The detail is neutral modulation.
  if(role==='fabric'){m.sheen=.28;m.sheenRoughness=.82;m.sheenColor.copy(m.color);}
  if(role==='asphalt'||role==='concrete'||role==='stone'||role==='plaster'||role==='roof'||role==='ground'||role==='ballast')m.metalness=0;
  if(role==='cladding'&&m.isMeshPhysicalMaterial){m.clearcoat=Math.min(m.clearcoat,.18);m.clearcoatRoughness=.22;}
  installAlbedoDetail(m,role,THREE);
 }
 m.needsUpdate=true;cache.set(cacheKey,m);return m;
}

function metricGeometry(source,scale,period,THREE,channel){
 let cache=geometryCache.get(source);if(!cache){cache=new Map();geometryCache.set(source,cache);}
 const key=[scale.x,scale.y,scale.z,...period,channel].map(v=>v.toFixed(6)).join('/');
 if(cache.has(key))return cache.get(key);
 const positions=source.getAttribute('position'),normals=source.getAttribute('normal');
 if(!positions||!normals)return source;
 // New wrapper + UV channel only. Immutable source buffers remain shared;
 // do not allocate duplicate position/normal/index buffers for every chair.
 const geometry=new THREE.BufferGeometry();geometry.name=source.name;
 geometry.setIndex(source.index);for(const [name,attribute]of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
 geometry.groups=source.groups.map(group=>({...group}));geometry.drawRange={...source.drawRange};
 geometry.morphAttributes={...source.morphAttributes};geometry.morphTargetsRelative=source.morphTargetsRelative;
 geometry.boundingBox=source.boundingBox?.clone()||null;geometry.boundingSphere=source.boundingSphere?.clone()||null;
 const uv=new Float32Array(positions.count*2);
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i)*scale.x,y=positions.getY(i)*scale.y,z=positions.getZ(i)*scale.z;
  const nx=Math.abs(normals.getX(i)/scale.x),ny=Math.abs(normals.getY(i)/scale.y),nz=Math.abs(normals.getZ(i)/scale.z);
  let u,v;
  if(ny>=nx&&ny>=nz){u=x;v=-z;}
  else if(nx>=nz){u=z;v=y;}
  else{u=x;v=y;}
  uv[i*2]=u/period[0];uv[i*2+1]=v/period[1];
 }
 geometry.setAttribute('uv'+channel,new THREE.BufferAttribute(uv,2));geometry.userData={...source.userData,r4MetricDetail:true};cache.set(key,geometry);return geometry;
}

export async function applyMaterialDetail(root,THREE,{kind='building'}={}){
 if(!['building','context','interior'].includes(kind))throw Error('Invalid material detail kind');
 if(rootCache.has(root))return {...rootCache.get(root),cached:true};
 root.updateMatrixWorld(true);
 const stats={version:VERSION,kind,meshes:0,refinedMeshes:0,materials:0,metricGeometryCount:0,roles:{},skipped:0,mixedRoleGeometrySkipped:0,positionsChanged:false,indicesChanged:false,sourceUVsChanged:false};
 const pending=[],seen=new Set(),needed=new Set(),occupied=new Set();
 root.traverse(mesh=>{if(mesh.isMesh)for(const channel of [1,2,3])if(mesh.geometry.getAttribute('uv'+channel))occupied.add(channel);});
 const channel=[1,2,3].find(c=>!occupied.has(c));stats.detailUVChannel=channel??null;stats.sharedSourceBuffers=true;
 root.traverse(mesh=>{if(!mesh.isMesh)return;stats.meshes++;const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];const roles=mats.map(m=>classifyMaterialDetail(m,mesh.name,kind));
  if(!roles.some(Boolean)){stats.skipped++;return;}
  for(const role of roles)if(profiles[role]&&channel)needed.add(role);pending.push({mesh,mats,roles});
 });
 // Yield between texture sets; never block a loading indicator for the full batch.
 for(const role of needed){texturesFor(THREE,role,channel);await new Promise(resolve=>setTimeout(resolve,0));}
 for(const {mesh,mats,roles} of pending){
  const detailRoles=[...new Set(roles.filter(r=>profiles[r]))];
  if(detailRoles.length>1||detailRoles.length&&(!channel||!mesh.geometry.getAttribute('normal'))){stats.mixedRoleGeometrySkipped++;continue;}
  if(detailRoles.length){const scale=new THREE.Vector3();mesh.getWorldScale(scale);scale.set(Math.max(Math.abs(scale.x),1e-6),Math.max(Math.abs(scale.y),1e-6),Math.max(Math.abs(scale.z),1e-6));mesh.geometry=metricGeometry(mesh.geometry,scale,profiles[detailRoles[0]].period,THREE,channel);stats.metricGeometryCount++;}
  const changed=mats.map((material,i)=>{const role=roles[i];if(!role)return material;const refined=refinedMaterial(material,role,THREE,channel);seen.add(refined);stats.roles[role]=(stats.roles[role]||0)+1;return refined;});
  mesh.material=Array.isArray(mesh.material)?changed:changed[0];stats.refinedMeshes++;
 }
 stats.materials=seen.size;stats.textureSets=needed.size;root.userData.materialDetail={...stats};rootCache.set(root,stats);return stats;
}
