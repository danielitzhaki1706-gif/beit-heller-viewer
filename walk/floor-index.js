// Local, immutable triangle height index. World-space source vertices are read,
// never changed. Upward surfaces only; no inferred or extrapolated support.
export function createFloorIndex(THREE,meshes,{bounds=[-10.5,-22.5,60.5,40.5],cellSize=2}={}){
 const cells=new Map(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),normal=new THREE.Vector3();
 let triangles=0,references=0;
 const cell=v=>Math.floor(v/cellSize),key=(x,z)=>x+','+z;
 for(const mesh of meshes){
  const g=mesh.geometry,p=g.attributes.position,index=g.index,count=index?.count??p.count;
  const first=Math.max(0,g.drawRange.start),end=Math.min(count,first+g.drawRange.count);
  for(let i=first;i+2<end;i+=3){
   a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);
   b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld);
   c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld);
   normal.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a)).normalize();if(normal.y<=.65)continue;
   const x0=Math.max(bounds[0],Math.min(a.x,b.x,c.x)),x1=Math.min(bounds[2],Math.max(a.x,b.x,c.x)),z0=Math.max(bounds[1],Math.min(a.z,b.z,c.z)),z1=Math.min(bounds[3],Math.max(a.z,b.z,c.z));
   if(x1<x0||z1<z0)continue;
   const denominator=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(denominator)<1e-14)continue;
   const triangle=[a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z,denominator];triangles++;
   for(let x=cell(x0);x<=cell(x1);x++)for(let z=cell(z0);z<=cell(z1);z++){
    const k=key(x,z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(triangle);references++;
   }
  }
 }
 function floorAt(p,reference){
  let highest=null;
  for(const [ax,ay,az,bx,by,bz,cx,cy,cz,den]of cells.get(key(cell(p[0]),cell(p[1])))||[]){
   const u=((bz-cz)*(p[0]-cx)+(cx-bx)*(p[1]-cz))/den,v=((cz-az)*(p[0]-cx)+(ax-cx)*(p[1]-cz))/den;
   if(u< -1e-9||v< -1e-9||u+v>1+1e-9)continue;
   const y=u*ay+v*by+(1-u-v)*cy;
   if(y<=reference+.26+1e-9&&y>=reference-.46-1e-9&&(highest===null||y>highest))highest=y;
  }
  return highest;
 }
 return {floorAt,stats:{triangles,references,cells:cells.size,cellSize,bounds}};
}
