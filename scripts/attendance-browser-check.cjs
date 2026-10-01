const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const QRCode=require('../server/node_modules/qrcode');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
 const context=await browser.newContext({viewport:{width:1440,height:1100},permissions:['camera'],reducedMotion:'reduce'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let rows=Array.from({length:7},(_,i)=>({id:String(i),studentName:`TEST STUDENT ${i+1}`,guardianName:'TEST GUARDIAN',registrationNumber:`SHREE26-00000${i+1}`,studentClass:i<4?'7':'8',checkInAt:i<3?'2025-01-15T05:15:00.000Z':null}));let scanned,changes=0,exports=0;
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path==='/api/settings')return route.fulfill({json:{eventName:'SHREE 2026 OLYMPIAD',fee:149,eligibleClasses:['7','8'],portal:{},scholarships:[],instructions:[]}});
  if(path==='/api/admin/me')return route.fulfill({json:{email:'test@example.invalid',role:'ADMIN'}});
  if(path==='/api/admin/dashboard')return route.fulfill({json:{total:7,confirmed:7,pending:0,review:0,classes:[],revenue:0}});
  if(path==='/api/admin/attendance'){
   let list=rows.filter(r=>(!url.searchParams.get('studentClass')||r.studentClass===url.searchParams.get('studentClass'))&&(!url.searchParams.get('attendance')||(url.searchParams.get('attendance')==='PRESENT'?!!r.checkInAt:!r.checkInAt))&&(!url.searchParams.get('search')||r.studentName.includes(url.searchParams.get('search'))));const total=list.length,present=list.filter(r=>r.checkInAt).length,limit=Number(url.searchParams.get('limit')||5),p=Number(url.searchParams.get('page')||1);
   return route.fulfill({json:{items:list.slice((p-1)*limit,p*limit),total,present,notCheckedIn:total-present,pages:Math.ceil(total/limit),page:p,limit}});
  }
  if(path.startsWith('/api/admin/attendance/export.')){exports++;return route.fulfill({body:'mock download',contentType:path.endsWith('pdf')?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}
  if(path.startsWith('/api/admin/attendance/')&&['PATCH','DELETE'].includes(req.method())){const id=path.split('/').pop(),body=req.postDataJSON();rows=rows.map(r=>r.id===id?{...r,checkInAt:req.method()==='DELETE'?null:body.checkInAt}:r);changes++;return route.fulfill({json:{message:'Attendance updated.'}});}
  if(path==='/api/admin/check-in'){scanned=req.postDataJSON().token;return route.fulfill({json:{registration:rows[0]}});}
  return route.fulfill({status:404,json:{error:'Blocked by attendance UI test'}});
 });
 await page.goto((process.env.PORTAL_TEST_URL||'http://127.0.0.1:5173')+'/admin');await page.getByRole('button',{name:'Exam check-in',exact:true}).click();await page.getByText('1–5 of 7').waitFor();
 assert.equal(await page.getByRole('columnheader',{name:'Room / Seat'}).count(),0);
 const center=await page.locator('#admin-qr-reader').boundingBox(),panel=await page.locator('.exam-checkin-panel').boundingBox();assert.ok(Math.abs(center.x+center.width/2-panel.x-panel.width/2)<3);
 await page.getByLabel('Next attendance page').click();await page.getByText('6–7 of 7').waitFor();await page.getByRole('button',{name:'First',exact:true}).click();
 await page.locator('.attendance-filters').getByLabel('Attendance class',{exact:true}).selectOption('8');await page.getByText('1–3 of 3').waitFor();await page.getByRole('button',{name:'Reset filters'}).click();
 await page.getByRole('button',{name:'Edit',exact:true}).first().click();await page.getByLabel('Reason for correction').fill('Corrected from paper attendance');await page.getByRole('button',{name:'Save attendance'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Delete',exact:true}).first().click();await page.getByLabel('Reason for correction').fill('Mistaken initial check-in');await page.getByRole('button',{name:'Delete attendance',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(changes,2);
 for(const name of ['Excel','PDF']){const download=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();await download;}assert.equal(exports,2);
 const token='a'.repeat(48);await QRCode.toFile('/tmp/attendance-check-qr.png',`http://localhost:5000/api/verify/${token}`,{width:500});await page.getByLabel('Scan admit card image').setInputFiles('/tmp/attendance-check-qr.png');await page.getByText('Recorded',{exact:true}).waitFor();assert.equal(scanned,token,'Scanned token must reach the check-in API');
 await page.getByRole('button',{name:'Start camera',exact:true}).click();await page.getByRole('button',{name:'Camera active',exact:true}).waitFor();await page.getByRole('button',{name:'Stop camera',exact:true}).click();await page.getByRole('button',{name:'Start camera',exact:true}).waitFor();
 fs.mkdirSync('output',{recursive:true});await page.screenshot({path:'output/attendance-desktop.png',fullPage:true});
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await page.screenshot({path:'output/attendance-dark.png',fullPage:true});
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));await page.setViewportSize({width:390,height:844});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert.equal(overflow,false,'Mobile page must not overflow');await page.screenshot({path:'output/attendance-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('Attendance browser checks passed: layout, pagination, filters, edit/delete, exports, QR image, camera start/stop, dark mode and mobile width.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
