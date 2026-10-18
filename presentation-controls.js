export function mountPresentationControls({onLook,onQuality,onResize,onCapture}) {
 const host=document.createElement('div');host.className='presentation-tools';host.setAttribute('aria-label','אפשרויות צפייה');
 host.innerHTML='<button type="button" id="clean-view" aria-pressed="false">מבט נקי</button><details class="appearance-menu"><summary>תאורה ואיכות</summary><div class="appearance-fields"><label>אור<select id="visual-look"><option value="daylight">אור יום</option><option value="golden">שעת זהב</option><option value="twilight">שעת ערב</option></select></label><label>רמת פירוט<select id="visual-quality"><option value="auto">מותאם למכשיר</option><option value="high">פירוט גבוה</option><option value="balanced">תנועה חלקה</option><option value="low">חסכוני</option></select></label><p>התאורה להמחשה, ללא חישוב שעות שמש באתר.</p></div></details><button type="button" id="capture-view">שמירת תמונה</button>';
 document.querySelector('.stage').append(host);
 const clean=host.querySelector('#clean-view'), menu=host.querySelector('details');
 function setClean(enabled){document.body.classList.toggle('clean-view',enabled);clean.setAttribute('aria-pressed',String(enabled));clean.textContent=enabled?'חזרה לתפריטים':'מבט נקי';onResize();}
 clean.onclick=()=>setClean(!document.body.classList.contains('clean-view'));
 host.querySelector('#visual-look').onchange=e=>onLook(e.target.value);
 host.querySelector('#visual-quality').onchange=e=>onQuality(e.target.value);
 host.querySelector('#capture-view').onclick=()=>{menu.open=false;onCapture();};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.open=false;if(document.body.classList.contains('clean-view')){setClean(false);clean.focus();}}});
 return {setTab(tab){host.hidden=['gallery','walk'].includes(tab);if(host.hidden)setClean(false);},setQuality(value){host.querySelector('#visual-quality').value=value;},setClean};
}
