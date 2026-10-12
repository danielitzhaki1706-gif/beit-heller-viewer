import {createFloorIndex} from './floor-index.js';
import {createCollisionIndex} from './collision-index.js';
// Sampled walking collision for visualization, not a certified clearance model.
// The same implementation is imported by the app and CPU regression checks.
export function createWalkingPhysics(THREE,{meshes,floorMeshes=meshes,dynamicMeshes=[],navigator,radius=.25}){
 const ray=new THREE.Raycaster();
 ray.layers.enable(1);
 const dynamic=new Set(dynamicMeshes);
 const floorIndex=createFloorIndex(THREE,floorMeshes.filter(mesh=>!dynamic.has(mesh)));
 const collisionIndex=createCollisionIndex(THREE,meshes.filter(mesh=>!dynamic.has(mesh)));
 const stats={bodyRays:0,floorQueries:0,substeps:0,floorIndex:floorIndex.stats,collisionIndex:collisionIndex.stats};
 function floorAt(p,reference){
  stats.floorQueries++;
  return floorIndex.floorAt(p,reference); // No invented floor across holes.
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
  const direction=new THREE.Vector3(dx/distance,0,dz/distance);
  for(const side of [-.85,0,.85])for(const height of [.45,1.05,1.55]){
   stats.bodyRays++;ray.set(new THREE.Vector3(from[0]-direction.z*radius*side,feet+height,from[1]+direction.x*radius*side),direction);ray.far=distance+radius;
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
