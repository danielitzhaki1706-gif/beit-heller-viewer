// Viewer-only metric surface appearance. Source coordinates and geometry preserved.
// Product colors, joint phase and deck dimensions are visualization assumptions.
const clamp=v=>Math.max(0,Math.min(1,v));
const srgb=v=>v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055;
const fract=x=>x-Math.floor(x);
const noise=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
export function createSurfacePixels(role){
 const wood=role==='BAMBOO_DECK',paving=role==='PAVING_HALF_BOND',dark=role==='PORCELAIN_GRESPANIA_MOMA_GRIS_R10';
 const width=wood?1024:512,height=wood?128:512,period=wood?[2.4,.14]:paving?[.6,.6]:[.8,.8];
 const base=wood?[.34,.22,.105]:paving?[.455,.45,.425]:dark?[.32,.335,.34]:[.57,.56,.53];
 const joint=wood?[.075,.052,.027]:paving?[.31,.31,.30]:[.13,.135,.14];
 const color=new Uint8Array(width*height*4),bump=new Uint8Array(color.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const mx=x/width*period[0],my=y/height*period[1];let seam;
  if(paving){const row=Math.floor(my/.3),px=fract((mx+row*.15)/.3)*.3,py=fract(my/.3)*.3;seam=px<.0024||py<.0024;}
  else seam=mx<.003||my<.003;
  const fine=noise(x,y),grain=wood?.5+.25*Math.sin(y*.5+Math.sin(x*.011)*1.8)+.25*fine:fine;
  const variation=wood?1+(grain-.5)*.11:1+(fine-.5)*.035;
  const index=(y*width+x)*4;
  for(let c=0;c<3;c++){color[index+c]=Math.round(255*srgb(clamp((seam?joint[c]:base[c])*variation)));bump[index+c]=Math.round(255*(paving&&seam?.05:grain));}
  color[index+3]=255;bump[index+3]=255;
 }
 return {width,height,period,color,bump,bumpScale:wood?.0007:paving?.003:.0002,roughness:wood?.64:paving?.78:.58};
}
export async function applySurfaceFinish(model,THREE,definitions=null){
 let entries=definitions;
 if(entries===null){const response=await fetch('./assets/material-surfaces.json');if(!response.ok)throw Error('Surface definitions unavailable');entries=(await response.json()).materials;}
 const byName=new Map(entries.map(e=>[e.name,e.role])),cache=new Map();
 let changed=0;model.updateMatrixWorld(true);
 model.traverse(mesh=>{if(!mesh.isMesh)return;const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const roles=mats.map(m=>byName.get(m.name));if(!roles.some(Boolean))return;
  // Target finishes are individually exported primitives. Leave mixed-role geometry unchanged.
  if(mats.length!==1){console.warn('Mixed finish primitive retained without procedural detail',mesh.name);return;}
  const role=roles[0];if(!role)return;let material=cache.get(mesh.material);
  if(!material){material=mesh.material.clone();const pixels=createSurfacePixels(role);
   for(const [key,buffer]of [['map',pixels.color],['bumpMap',pixels.bump]]){const texture=new THREE.DataTexture(buffer,pixels.width,pixels.height,THREE.RGBAFormat);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=4;if(key==='map')texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;material[key]=texture;}
   material.color.setRGB(1,1,1);material.bumpScale=pixels.bumpScale;material.roughness=pixels.roughness;material.userData.surfacePeriod=pixels.period;material.needsUpdate=true;cache.set(mesh.material,material);
  }
  mesh.material=material;mesh.geometry=mesh.geometry.clone();const positions=mesh.geometry.getAttribute('position'),uv=new Float32Array(positions.count*2),v=new THREE.Vector3(),period=material.userData.surfacePeriod;
  for(let i=0;i<positions.count;i++){v.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);uv[i*2]=v.x/period[0];uv[i*2+1]=-v.z/period[1];}
  mesh.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));changed++;
 });
 return {finishMeshes:changed,materials:cache.size,geometryPositionsChanged:false,appearance:'illustrative metric textures matching native modules, not measured product scans'};
}
