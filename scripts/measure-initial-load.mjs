import { chromium } from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const target=process.argv[2];const output=process.argv[3];
if (!target || !output) throw new Error('Usage: node scripts/measure-initial-load.mjs http://127.0.0.1:PORT OUTPUT.json');
const url = new URL(target);
if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:') throw new Error('Only a local loopback preview server is allowed');
const browser=await chromium.launch();const runs=[];
for(let i=0;i<3;i++) {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage();
 await page.route('**/*',route=>{const url=new URL(route.request().url());return url.hostname==='127.0.0.1'?route.continue():route.abort();});
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750,connectionType:'cellular4g'});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await page.addInitScript(()=>{window.heroLcp=0;new PerformanceObserver(list=>{for(const e of list.getEntries())window.heroLcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});});
 await page.goto(target+'/login');
 await page.getByRole('button',{name:'카카오로 시작하기',exact:true}).waitFor();
 await page.waitForFunction(()=>window.heroLcp>0);
 await page.waitForTimeout(800);
 const data=await page.evaluate(()=>({lcpMs:Math.round(window.heroLcp),jsBytes:performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname.endsWith('.js')).reduce((s,e)=>s+e.decodedBodySize,0),scripts:performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname.endsWith('.js')).map(e=>new URL(e.name).pathname)}));
 runs.push(data);await context.close();
}
await browser.close();const result={conditions:{viewport:'390x844',cpuSlowdown:4,latencyMs:150,downloadBytesPerSecond:200000,coldCache:true,serviceWorker:'blocked',externalRequests:'blocked'},runs,medianLcpMs:[...runs].map(r=>r.lcpMs).sort((a,b)=>a-b)[1]};
await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
