// North comes from the registered SITE-016 / geospatial context transform.
// Project both endpoints so the compass remains correct during orbit and tilt.
export function createSiteCompass(THREE,host){
 const root=document.createElement('div');root.className='site-compass';root.setAttribute('role','img');root.setAttribute('aria-label','כיוון צפון במבט הנוכחי');
 const label=document.createElement('span');label.textContent='צפון';
 const arrow=document.createElement('span');arrow.className='site-compass-arrow';arrow.setAttribute('aria-hidden','true');
 root.append(label,arrow);host.append(root);
 const origin=new THREE.Vector3(),tip=new THREE.Vector3(),north=new THREE.Vector3(.46638664,0,-.88458098);
 return {update(camera,target,visible){
  root.hidden=!visible;if(!visible)return;
  origin.copy(target).project(camera);tip.copy(target).addScaledVector(north,.01).project(camera);
  const dx=(tip.x-origin.x)*camera.aspect,dy=tip.y-origin.y;
  if(Math.hypot(dx,dy)<1e-7)return;
  arrow.style.transform=`rotate(${Math.atan2(dx,dy)*180/Math.PI}deg)`;
 }};
}
