import {mountRenderGallery} from './gallery.js?v=20261022-r7';
const root=document.getElementById('render-gallery');
try{
  const response=await fetch('./assets/viewer.json',{cache:'no-cache'});
  if(!response.ok)throw new Error('viewer.json');
  const config=await response.json();await mountRenderGallery(root,config.renders||[]);
}catch{
  root.textContent='לא ניתן לטעון את ספריית ההדמיות. פתחו את הגלריה דרך הצופה המקומי ונסו שוב.';
}
