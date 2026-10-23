// Dense foliage is left out of three's transmission pre-pass (the image seen
// through glazing). It stays in the main image and in the shadow map, which
// removes about 2.8M triangles from every exterior frame.
export function skipTransmissionPass(mesh,isMainPass){
 let saved=null;
 mesh.onBeforeRender=()=>{if(isMainPass())return;saved=mesh.geometry.drawRange.count;mesh.geometry.drawRange.count=0;};
 mesh.onAfterRender=()=>{if(saved===null)return;mesh.geometry.drawRange.count=saved;saved=null;};
 mesh.userData.skipTransmissionPass=true;
}
export const isFoliageMaterial=material=>/leaf|leaves|foliage|island_tree|branches|shrub|canopy/i.test(material?.name||'');
// Some mapped surfaces (roof membranes, curbs, neighbour top caps) were exported
// upside down: an open, double-sided surface whose horizontal faces all point
// down. Shading is unaffected, but the shadow lookup is offset along the normal,
// i.e. into the surface, which darkens it with acne rings. Reorienting winding and
// normals together keeps shading identical and fixes the shadow.
export function orientOpenSurfacesUp(root){
 const done=new WeakSet();let meshes=0;
 root.traverse(mesh=>{
  const g=mesh.geometry,material=mesh.material;
  if(!mesh.isMesh||mesh.isInstancedMesh||done.has(g)||Array.isArray(material)||material.alphaTest>0||mesh.matrixWorld.determinant()<=0)return;
  const n=g.attributes.normal,index=g.index;if(!n||!index||!(n.array instanceof Float32Array))return;done.add(g);
  let up=0,down=0;
  for(let t=0;t<index.count;t+=3){const s=n.getY(index.getX(t))+n.getY(index.getX(t+1))+n.getY(index.getX(t+2));if(s>2.7)up++;else if(s<-2.7)down++;}
  if(!down||up)return;
  for(let t=0;t<index.count;t+=3){const b=index.getX(t+1);index.setX(t+1,index.getX(t+2));index.setX(t+2,b);}
  for(let i=0;i<n.count;i++)n.setXYZ(i,-n.getX(i),-n.getY(i),-n.getZ(i));
  index.needsUpdate=n.needsUpdate=true;meshes++;
 });
 return meshes;
}
