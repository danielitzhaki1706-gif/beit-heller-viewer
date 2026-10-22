import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// Merge only draw submissions. Preserve source meshes on a non-camera layer for collision and auditing.
// Heavy geometry placed several times (trees) is instanced instead of copied.
export function batchStatic(root,dynamicNames=[]){
 root.updateMatrixWorld(true);
 const inverse=root.matrixWorld.clone().invert(),groups=new Map(),dynamic=new Set(dynamicNames),candidates=[],shared=new Map();
 let originals=0;
 root.traverse(o=>{
 if(!o.isMesh||o.isInstancedMesh||!o.visible||dynamic.has(o.name)||Array.isArray(o.material)||o.isSkinnedMesh||o.morphTargetInfluences)return;
 const matrix=inverse.clone().multiply(o.matrixWorld);
 // Mirrored objects retain their original render transform and winding.
 if(matrix.determinant()<0)return;
 candidates.push({o,matrix});const key=o.geometry.uuid+'|'+o.material.uuid;if(!shared.has(key))shared.set(key,[]);shared.get(key).push(candidates.at(-1));
 });
 const triangles=g=>(g.index?g.index.count:g.attributes.position.count)/3;
 let batches=0;
 for(const list of shared.values()){
 if(list.length<4||triangles(list[0].o.geometry)<1500)continue;
 const reference=list[0].o,mesh=new THREE.InstancedMesh(reference.geometry,reference.material,list.length);
 list.forEach((c,i)=>{mesh.setMatrixAt(i,c.matrix);c.instanced=true;c.o.layers.set(1);originals++;});
 mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.name='Presentation_batch_'+batches++;
 mesh.receiveShadow=true;mesh.castShadow=!(reference.material.transmission>.1)&&!reference.material.transparent;root.add(mesh);
 }
 for(const {o,matrix,instanced}of candidates){
 if(instanced)continue;
 const g=o.geometry.clone().applyMatrix4(matrix);
 const key=o.material.uuid+'|'+Object.keys(g.attributes).sort().join(',')+'|'+!!g.index;
 if(!groups.has(key))groups.set(key,{material:o.material,geometries:[]});
 groups.get(key).geometries.push(g);o.layers.set(1);originals++;
 }
 for(const {material,geometries}of groups.values()){
 const g=mergeGeometries(geometries,false);
 if(!g)throw Error('Static geometry batching failed');
 const m=new THREE.Mesh(g,material);m.name='Presentation_batch_'+batches++;
 m.receiveShadow=true;m.castShadow=!(material.transmission>.1)&&!material.transparent;root.add(m);
 geometries.forEach(g=>g.dispose());
 }
 return {originals,batches};
}
