(()=>{const root=document.querySelector('#coal-mirrors-bildspel');if(!root)return;
const slides=[...root.querySelectorAll('.cm-slide')],stage=root.querySelector('.cm-stage'),play=root.querySelector('[data-cm-play]'),count=root.querySelector('.cm-count');
const times=[3000,3000,3000,3000,4000,3000,4000,5000];let current=0,timer=null,playing=false;
function stop(){playing=false;clearTimeout(timer);play.textContent='Spela';play.setAttribute('aria-label','Spela bildspelet');}
function show(n){slides[current].hidden=true;current=(n+slides.length)%slides.length;slides[current].hidden=false;count.textContent=(current+1)+' / '+slides.length;}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(current===slides.length-1){stop();return;}show(current+1);schedule();},times[current]);}
play.addEventListener('click',()=>{if(playing){stop();return;}if(current===slides.length-1)show(0);playing=true;play.textContent='Pausa';play.setAttribute('aria-label','Pausa bildspelet');schedule();});
root.querySelector('[data-cm-prev]').addEventListener('click',()=>{stop();show(current-1);});root.querySelector('[data-cm-next]').addEventListener('click',()=>{stop();show(current+1);});
stage.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();stop();show(current+(e.key==='ArrowRight'?1:-1));}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
let touchX=null;stage.addEventListener('touchstart',e=>{touchX=e.changedTouches[0].clientX;},{passive:true});stage.addEventListener('touchend',e=>{if(touchX===null)return;const dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>50){stop();show(current+(dx<0?1:-1));}touchX=null;},{passive:true});
})();