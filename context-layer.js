// Context is always a scene sibling: it never changes building fit bounds,
// floor clipping, or walking collisions. Acceptance is an explicit manifest
// flag, and source replacement happens only after the nearfield has loaded.
export function createContextLayer(THREE,scene,loader,ground,{onChange=()=>{},invalidate=()=>{},prepareNearfield=async()=>{},fetcher=fetch}={}){
 let mode='exterior',enabled=true,ready=false,loading=false,building=null,near=null,manifest=null,promise=null,warning=null;
 const replacements=new Map();
 const allowedReplacementNames=new Set(['Building_part_0754','Building_part_0735']);
 const localAsset=value=>{if(typeof value!=='string'||!/^\.\/assets\/models\/context\/[a-zA-Z0-9_.-]+\.(glb|json)$/.test(value))throw Error('Invalid local context asset path');return value;};
 const notify=()=>onChange({ready,loading,enabled,active:ready&&enabled&&mode==='exterior',warning});
 function collectReplacements(){
  replacements.clear();if(!building||!manifest)return;
  for(const name of manifest.replacesNodes||[]){
   if(!allowedReplacementNames.has(name))throw Error('Unsupported context replacement node');
   const node=building.getObjectByName(name);if(!node)throw Error('Context replacement node is missing');
   replacements.set(node,node.visible);
  }
 }
 function sync(){
  const active=ready&&enabled&&mode==='exterior';
  if(near)near.visible=active;
  for(const [node,original]of replacements)node.visible=active?false:original;
  ground.visible=mode==='exterior'&&!(active&&manifest.hideDefaultGround===true);
  notify();invalidate();
 }
 async function load(){
  if(promise)return promise;loading=true;notify();
  promise=(async()=>{
   const response=await fetcher('./assets/models/context/manifest.json');if(!response.ok)throw Error('Context manifest unavailable');
   const candidate=await response.json();if(candidate.schema!=='beit-heller-context-v1'||candidate.accepted!==true)throw Error('Context has not been accepted');
   const registeredSurroundings=candidate.extentPolicy==='source-registered-site'&&candidate.sourceRegistration?.notSurveyed===true&&candidate.radiusMetres>10&&candidate.radiusMetres<=300;
   if((candidate.radiusMetres!==10&&!registeredSurroundings)||candidate.farData)throw Error('Context extent must match an accepted local or source-registered site');
   if(!Array.isArray(candidate.replacesNodes)||candidate.replacesNodes.some(name=>!allowedReplacementNames.has(name)))throw Error('Context replacement manifest is invalid');
   const result=await loader.loadAsync(localAsset(candidate.nearfield));
   near=result.scene;near.name='Nearfield_context';near.visible=false;near.userData.excludeFromBuildingBounds=true;near.userData.excludeFromFloorClipping=true;
   near.traverse(o=>{if(!o.isMesh)return;o.receiveShadow=true;const mats=Array.isArray(o.material)?o.material:[o.material];o.castShadow=mats.every(m=>!(m.transmission>.05||m.opacity<.95));for(const m of mats){
    // Road/paint finishes sit millimetres over the source-graded terrain.
    // A small depth bias prevents coplanar shimmer in distant facade views.
    if(m.name==='Immediate_context_asphalt'||m.name==='Immediate_context_road_paint'||m.name==='SITE | circulation white'||m.name==='SITE | fine paving joints'){
     m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=m.name.endsWith('paint')?-4:-2;
    }
    if(m.name.startsWith('SITE | source leaf canopy')){
     // Tiny leaf masks lose coverage in distant mip levels. Keep the source
     // alpha texture, but retain those leaves at browser viewing distances.
     m.alphaTest=.1;m.alphaToCoverage=true;m.transparent=false;m.depthWrite=true;
     m.side=THREE.DoubleSide;
     if(m.map){m.map.anisotropy=4;m.map.needsUpdate=true;}
     m.needsUpdate=true;
    }
   }});
   await prepareNearfield(near,candidate);
   manifest=candidate;collectReplacements();scene.add(near);
   ready=true;return true;
  })().catch(error=>{warning='context_unavailable';console.warn('Optional context remains off',error);return false;}).finally(()=>{loading=false;sync();});
  return promise;
 }
 return {load,setMode(value){mode=value;sync();},setEnabled(value){enabled=!!value;sync();},setBuilding(value){
  // Restore the old model before taking visibility snapshots from another.
  for(const [node,original]of replacements)node.visible=original;
  building=value;try{collectReplacements();}catch(error){ready=false;warning='context_replacement_unavailable';console.warn(error);}sync();
 },getState(){return {ready,loading,enabled,mode,active:ready&&enabled&&mode==='exterior',warning,near,far:null,manifest};}};
}
