// Reduce draw submissions for immutable contents only. Architectural pieces
// remain individually available to the adaptive cutaway.
export function batchCutawayContents(THREE,mergeGeometries,prepared){
 if(!mergeGeometries||prepared.contentBatches||prepared.entries.length<350)return;
 const root=prepared.root,inverse=root.matrixWorld.clone().invert(),groups=new Map();
 for(const e of prepared.entries){
  const o=e.mesh,g=o.geometry,m=e.original;
  if(!['content','floor','column'].includes(e.kind)||!e.visible||e.layers!==1||Array.isArray(m)||m.transparent||m.transmission>0||o.isSkinnedMesh||o.morphTargetInfluences||g.groups.length>1)continue;
  const transform=inverse.clone().multiply(o.matrixWorld);
  // Mirrored stair modules retain their original winding and front-face state.
  if(transform.determinant()<=0||g.drawRange.start!==0||Number.isFinite(g.drawRange.count))continue;
  const attrs=Object.entries(g.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([n,a])=>`${n}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).join('|');
  const key=[m.uuid,attrs,!!g.index,o.castShadow,o.receiveShadow,o.renderOrder].join('|');
  if(!groups.has(key))groups.set(key,{material:m,entries:[],geometries:[]});
  const group=groups.get(key);group.entries.push(e);group.geometries.push(g.clone().applyMatrix4(transform));
 }
 const finished=[];
 try{
  for(const group of groups.values()){
   if(group.entries.length<2)continue;
   const geometry=mergeGeometries(group.geometries,false);if(!geometry)throw Error('Content geometry merge failed');
   const reference=group.entries[0].mesh,mesh=new THREE.Mesh(geometry,group.material);
   mesh.name='Cutaway_content_batch_'+finished.length;mesh.castShadow=reference.castShadow;mesh.receiveShadow=reference.receiveShadow;mesh.renderOrder=reference.renderOrder;
   mesh.userData.cutawayContentBatch=true;mesh.userData.sourceNames=group.entries.map(e=>e.name);mesh.userData.sourceUUIDs=group.entries.map(e=>e.mesh.uuid);
   finished.push({mesh,entries:group.entries});
  }
 }catch(error){for(const b of finished)b.mesh.geometry.dispose();throw error;}
 finally{for(const g of groups.values())for(const geometry of g.geometries)geometry.dispose();}
 prepared.contentBatches=finished;
 for(const b of finished){b.mesh.visible=false;root.add(b.mesh);}
 prepared.root.userData.cutawayBatching={sourceMeshes:prepared.entries.length,batchedSources:finished.reduce((n,b)=>n+b.entries.length,0),batches:finished.length};
}
