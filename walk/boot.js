document.getElementById('reload').onclick=()=>location.reload();
import('./app.js').catch(error=>{document.getElementById('loading').hidden=true;document.getElementById('error').hidden=false;document.getElementById('error-text').textContent=location.protocol==='file:'?'להפעלת הסיור הפעילו את Start_Local_Viewer.cmd ופתחו את הכתובת שמופיעה בחלון ההפעלה במחשב זה.':String(error.message||error);});
