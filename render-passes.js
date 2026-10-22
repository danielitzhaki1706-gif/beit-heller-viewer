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
