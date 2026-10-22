import {createFloorIndex} from './floor-index.js?v=20261022-r7';
import {createCollisionIndex} from './collision-index.js?v=20261022-r7';
// Sampled walking collision for visualization, not a certified clearance model.
// The same implementation is imported by the app and CPU regression checks.
export function createWalkingPhysics(THREE,{meshes,floorMeshes=meshes,fallbackFloorMeshes=[],dynamicMeshes=[],navigator,radius=.25,maxHeight=Infinity,seamTolerance=0}){
 const ray=new THREE.Raycaster(),origin=new THREE.Vector3(),direction=new THREE.Vector3();
 ray.layers.enable(1);
 const dynamic=new Set(dynamicMeshes);
 const floorIndex=createFloorIndex(THREE,floorMeshes.filter(mesh=>!dynamic.has(mesh)),{maxHeight});
 // The displayed ground leads; a fallback model only bridges seams (a few cm)
 // where the displayed surfaces leave no walkable triangle.
 const fallbackIndex=fallbackFloorMeshes.length?createFloorIndex(THREE,fallbackFloorMeshes,{maxHeight}):null;
 const collisionIndex=createCollisionIndex(THREE,meshes.filter(mesh=>!dynamic.has(mesh)),{maxHeight});
 const stats={bodyRays:0,floorQueries:0,substeps:0,floorIndex:floorIndex.stats,collisionIndex:collisionIndex.stats};
 function floorAt(p,reference){
  stats.floorQueries++;
  const y=floorIndex.floorAt(p,reference)??fallbackIndex?.floorAt(p,reference)??null;if(y!==null||!seamTolerance)return y; // No invented floor across holes.
  // Hairline seams between separately modelled pavings (a few cm) are not
  // holes: accept the highest surface found within seamTolerance.
  let best=null;for(const [dx,dz]of [[seamTolerance,0],[-seamTolerance,0],[0,seamTolerance],[0,-seamTolerance]]){const h=floorIndex.floorAt([p[0]+dx,p[1]+dz],reference);if(h!==null&&(best===null||h>best))best=h;}
  return best;
 }
 function supportAt(p,reference){
  const center=floorAt(p,reference);if(center===null||center-reference>.25||reference-center>.45)return null;
  for(const [dx,dz]of [[radius,0],[-radius,0],[0,radius],[0,-radius]]){
   const y=floorAt([p[0]+dx,p[1]+dz],center);if(y===null||Math.abs(y-center)>.25)return null;
  }
  return center;
 }
 function geometryClear(from,to,feet){
  const dx=to[0]-from[0],dz=to[1]-from[1],distance=Math.hypot(dx,dz);if(distance<1e-8)return true;
  direction.set(dx/distance,0,dz/distance);
  for(const side of [-.85,0,.85])for(const height of [.45,1.05,1.55]){
   stats.bodyRays++;ray.set(origin.set(from[0]-direction.z*radius*side,feet+height,from[1]+direction.x*radius*side),direction);ray.far=distance+radius;
   if(collisionIndex.blocked(ray.ray,ray.far)||ray.intersectObjects(dynamicMeshes,false).length)return false;
  }
  return true;
 }
 function move(position,feet,delta,segments=[]){
  if(!Array.isArray(delta)||delta.length!==2||!delta.every(Number.isFinite)||Math.hypot(...delta)>.5)throw Error('Finite bounded walking frame required');
  const count=Math.max(1,Math.ceil(Math.hypot(...delta)/.04)),step=delta.map(v=>v/count);let p=[...position],y=feet,blocked=false;
  for(let i=0;i<count;i++){
   stats.substeps++;const candidate=navigator.move(p,step,segments),nextY=supportAt(candidate.position,y);
   if(nextY===null||!geometryClear(p,candidate.position,Math.max(y,nextY))){blocked=true;break;}
   p=candidate.position;y=nextY;blocked ||= candidate.blocked;
  }
  return {position:p,feet:y,blocked};
 }
 return {floorAt,supportAt,geometryClear,move,stats};
}
