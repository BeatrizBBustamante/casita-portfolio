/* Solo ajusta el HUD y los diálogos al área realmente visible; no mueve la escena. */
(() => {
  let pending=0;
  function update() {
    pending=0;
    const v=window.visualViewport,s=document.documentElement.style;
    const metrics={left:v?.offsetLeft||0,top:v?.offsetTop||0,width:v?.width||innerWidth,height:v?.height||innerHeight};
    for(const [key,value] of Object.entries(metrics))s.setProperty('--visible-'+key,value+'px');
  }
  function refresh(){if(!pending)pending=requestAnimationFrame(update);}
  for(const name of ['resize','orientationchange','pageshow','focus'])window.addEventListener(name,refresh);
  for(const name of ['resize','scroll'])window.visualViewport?.addEventListener(name,refresh);
  for(const name of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(name,()=>{refresh();setTimeout(refresh,100);setTimeout(refresh,350);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(pending);pending=0;}else refresh();});
  window.PortfolioViewport={refresh};update();
})();
