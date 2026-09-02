import { chromium } from 'playwright-core';
const b = await chromium.launch();
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36';
const pg = await b.newPage({ viewport:{width:1440,height:900}, userAgent:UA });
pg.on('console',m=>{ if(m.type()==='error') console.log('CONSOLE ERR',m.text()); });
pg.on('pageerror',e=>console.log('PAGEERR',e.message));
await pg.goto('http://127.0.0.1:18095/benchmarks',{waitUntil:'load'});
// wait both panes done
await pg.waitForFunction(()=>{const p=[...document.querySelectorAll('.pane')];return p.length===2&&p.every(x=>x.classList.contains('done'));},null,{timeout:45000});
const clocks = await pg.$$eval('.clock',els=>els.map(e=>e.textContent));
console.log('CLOCKS', JSON.stringify(clocks));
// scatter: hover a point
const pt = pg.locator('.scatter-chart circle').nth(2);
await pt.hover();
await pg.waitForTimeout(300);
const tipInfo = await pg.evaluate(()=>{
  const tip=document.querySelector('[data-tip]');
  const hot=document.querySelector('.series.hot circle');
  const tr=tip.getBoundingClientRect(), hr=hot.getBoundingClientRect();
  const z=Number(getComputedStyle(document.documentElement).zoom)||1;
  return {tipLeft:tr.left+tr.width/2, tipBottom:tr.bottom, ptCx:hr.left+hr.width/2, ptTop:hr.top, zoom:z,
    dx:(tr.left+tr.width/2-(hr.left+hr.width/2))/z, dy:(hr.top-tr.bottom)/z, html:tip.textContent, hidden:tip.hidden};
});
console.log('HOVER COST', JSON.stringify(tipInfo));
// click time per task
await pg.click('[data-metric="time"]');
await pg.waitForTimeout(300);
const pt2 = pg.locator('.scatter-chart circle').nth(0);
await pt2.hover();
await pg.waitForTimeout(200);
const tip2 = await pg.evaluate(()=>{
  const tip=document.querySelector('[data-tip]');
  const hot=document.querySelector('.series.hot circle');
  const tr=tip.getBoundingClientRect(), hr=hot.getBoundingClientRect();
  const z=Number(getComputedStyle(document.documentElement).zoom)||1;
  return {dx:(tr.left+tr.width/2-(hr.left+hr.width/2))/z, dy:(hr.top-tr.bottom)/z, html:tip.textContent, hidden:tip.hidden,
    axisLabel:document.querySelector('.scatter-chart svg').getAttribute('aria-label')?.slice(0,120)};
});
console.log('HOVER TIME', JSON.stringify(tip2));
// tab into chart
await pg.locator('[data-metric="cost"]').focus();
await pg.keyboard.press('Tab'); // goes to time tab
await pg.keyboard.press('Tab'); // first circle
const ae = await pg.evaluate(()=>({tag:document.activeElement.tagName, label:document.activeElement.getAttribute('aria-label')}));
console.log('TAB1', JSON.stringify(ae));
// 390x844
const m = await b.newPage({ viewport:{width:390,height:844}, userAgent:UA });
await m.goto('http://127.0.0.1:18095/benchmarks',{waitUntil:'load'});
await m.waitForTimeout(1500);
const mob = await m.evaluate(()=>{
  const svg=document.querySelector('.scatter-chart svg');
  const fonts=[...svg.querySelectorAll('text')].map(t=>getComputedStyle(t).fontSize);
  const cards=[...document.querySelectorAll('.fig.est')].map(c=>{const r=c.getBoundingClientRect();return {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width)};});
  return {scrollWidth:document.documentElement.scrollWidth, fonts:[...new Set(fonts)], estCards:cards,
    svgW: svg.getBoundingClientRect().width};
});
console.log('MOBILE', JSON.stringify(mob));
await b.close();
