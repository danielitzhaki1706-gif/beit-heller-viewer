// Plan-backed Hebrew labels remain on the physical floor plane.
export function createFloorLabels(THREE, data) {
 const attached=new Map();
 function attach(modelId,root){
  if(attached.has(modelId)||!data.models?.[modelId])return;
  const group=new THREE.Group();group.name='FLOOR LABELS | plan uses';group.userData.floorLabels=true;
  for(const row of data.models[modelId]){
   const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
   const ctx=canvas.getContext('2d');ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.fillStyle='rgba(250,249,241,.94)';ctx.fillRect(6,18,1012,220);
   ctx.strokeStyle='#788e83';ctx.lineWidth=5;ctx.strokeRect(8,20,1008,216);
   ctx.fillStyle='#163c33';
   const lines=row.text.split('\n');let fontSize=lines.length>1?95:170;ctx.font=`700 ${fontSize}px Arial`;
   while(Math.max(...lines.map(s=>ctx.measureText(s).width))>940){fontSize-=2;ctx.font=`700 ${fontSize}px Arial`;}
   if(lines.length>1)lines.forEach((s,i)=>ctx.fillText(s,512,78+i*101,940));else ctx.fillText(row.text,512,133,940);
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
   const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
   const mesh=new THREE.Mesh(new THREE.PlaneGeometry(row.width,row.width/4),material);
   mesh.name='FLOOR LABEL | '+row.id;mesh.position.set(...row.position);mesh.rotation.x=-Math.PI/2-Math.atan(row.slopeZ||0);mesh.rotation.z=row.rotation||0;mesh.renderOrder=6;
   mesh.userData.baseRotation=row.rotation||0;mesh.userData.planLabel={id:row.id,text:row.text,source:row.source,basis:row.basis};group.add(mesh);
  }
  root.add(group);attached.set(modelId,group);
 }
 function setVisible(modelId,visible){const group=attached.get(modelId);if(group)group.visible=visible;}
 function bind(canvas,camera,getActive){
  const hint=document.createElement('div');hint.setAttribute('role','tooltip');hint.id='floor-purpose-tooltip';hint.hidden=true;
  Object.assign(hint.style,{position:'fixed',zIndex:20,pointerEvents:'none',background:'#163c33',color:'#fff',padding:'8px 14px',borderRadius:'5px',font:'600 17px Arial',direction:'rtl',boxShadow:'0 2px 10px #0003'});document.body.append(hint);
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  canvas.addEventListener('pointermove',event=>{
   const root=getActive();if(!root||event.buttons){hint.hidden=true;return;}
   const group=[...attached.values()].find(g=>g.parent===root&&g.visible);if(!group){hint.hidden=true;return;}
   const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);
   const hit=ray.intersectObjects(group.children,false)[0];hint.hidden=!hit;if(!hit)return;
   hint.textContent=hit.object.userData.planLabel.text.replace('\n',' · ');hint.style.left=Math.min(event.clientX+16,innerWidth-260)+'px';hint.style.top=Math.max(8,event.clientY-44)+'px';
  });canvas.addEventListener('pointerleave',()=>hint.hidden=true);canvas.addEventListener('pointerdown',()=>hint.hidden=true);
 }
 function update(camera,root){const group=[...attached.values()].find(g=>g.parent===root);if(!group)return;for(const mesh of group.children){const angle=mesh.userData.baseRotation;const side=(camera.position.x-mesh.position.x)*Math.sin(angle)+(camera.position.z-mesh.position.z)*Math.cos(angle);mesh.rotation.z=angle+(side<0?Math.PI:0);}}
 function detach(modelId){const group=attached.get(modelId);if(!group)return;group.removeFromParent();for(const mesh of group.children){mesh.geometry.dispose();mesh.material.map?.dispose();mesh.material.dispose();}attached.delete(modelId);}
 return {attach,setVisible,bind,update,detach};
}
