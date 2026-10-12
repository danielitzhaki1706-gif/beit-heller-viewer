export function mountSiteSources({button, assets='./assets/site-sources.json'}={}){
 if(!button)return;
 const dialog=document.createElement('dialog');dialog.className='site-sources-dialog';
 dialog.setAttribute('aria-labelledby','site-source-title');
 const header=document.createElement('div');header.className='site-source-header';
 const title=document.createElement('h2');title.id='site-source-title';title.textContent='הבניין, בתוך המקום שלו';
 const close=document.createElement('button');close.textContent='סגירה';close.onclick=()=>dialog.close();
 header.append(title,close);
 const body=document.createElement('div');body.className='site-source-body';
 dialog.append(header,body);document.body.append(dialog);
 let loaded=false;
 button.onclick=async()=>{
  dialog.showModal();
  if(loaded)return;
  body.textContent='טוענים את מקורות הסביבה…';
  try{
   const response=await fetch(assets);if(!response.ok)throw Error('Sources unavailable');
   const data=await response.json();body.replaceChildren();
   const intro=document.createElement('p');intro.textContent=data.intro;body.append(intro);
   if(data.image){const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=data.image;img.alt=data.imageAlt||'מבט על המודל וסביבת האתר';caption.textContent=data.imageCaption||'';figure.append(img,caption);body.append(figure);}
   const list=document.createElement('div');list.className='site-source-grid';
   for(const row of data.layers||[]){const article=document.createElement('article'),h=document.createElement('h3'),p=document.createElement('p');h.textContent=row.title;p.textContent=row.text;article.append(h,p);list.append(article);}
   body.append(list);
   const heading=document.createElement('h3');heading.textContent='בדיקת המקורות';body.append(heading);
   const links=document.createElement('nav');links.className='site-source-links';links.setAttribute('aria-label','מקורות סביבת האתר');
   for(const source of data.sources||[]){const link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener';link.textContent=source.label+' ↗';links.append(link);}
   body.append(links);loaded=true;
  }catch{body.textContent='מקורות הסביבה אינם זמינים כרגע. אפשר להמשיך לצפות בבניין.';}
 };
 dialog.addEventListener('close',()=>button.focus());
 return {dialog};
}
