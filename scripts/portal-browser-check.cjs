/* Standalone browser smoke check. Uses mocked public APIs; never sends SMS/payment. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:5177';
const settings = {eventName:'SHREE 2026 OLYMPIAD',fee:149,registrationOpen:false,eligibleClasses:Array.from({length:12},(_,i)=>String(i+1)),examDate:'',venue:'Shree Ram Public School',contactPhone:'8199991081',contactEmail:'srpskanhra@gmail.com',scholarships:[],instructions:[],portal:{}};
const routes=['/','/about','/prizes','/scholarships','/eligibility','/exam-pattern','/syllabus','/sample-papers','/important-dates','/exam-guidelines','/information-bulletin','/downloads','/notices','/faq','/help','/results','/awards','/privacy','/terms','/refund','/payment-policy','/register','/status','/exam-guide'];
(async()=>{
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
const context=await browser.newContext({reducedMotion:'reduce'});const page=await context.newPage();const errors=[];let mode='empty';let saved;
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('status of 503'))errors.push(m.text())});
await page.route('**/api/**',async route=>{
 const pathname=new URL(route.request().url()).pathname;
 if(pathname==='/api/settings'){
  if(mode==='error')return route.fulfill({status:503,json:{error:'test unavailable'}});
  if(mode==='loading')await new Promise(resolve=>setTimeout(resolve,600));
  const portal=mode==='published'?{announcement:{enabled:true,text:'Test publication',isNew:true,link:'/notices'},importantDates:[{title:'Test milestone',date:'Date pending school confirmation',status:'active'}],examPattern:{isPublished:true,totalQuestions:'10',sections:[{title:'Test section',questions:'10',marks:'10'}]},syllabus:[{studentClass:'7',title:'Test Class 7 syllabus',topics:['Test topic'],fileUrl:'/test-syllabus.pdf'}],resources:[{title:'Test Class 7 paper',category:'sample-paper',studentClass:'7',fileUrl:'/test-paper.pdf',previewUrl:'/test-paper.pdf',answerKeyUrl:'/test-key.pdf'},{title:'Test Class 8 paper',category:'sample-paper',studentClass:'8',fileUrl:'/test-paper.pdf'},{title:'Test bulletin',category:'bulletin',fileUrl:'/test-bulletin.pdf'}],notices:[{title:'Test school update',description:'Published test notice',isNew:true,pinned:true}],faq:[{question:'Test question?',answer:'Test answer',category:'Exam'}]}:{};
  return route.fulfill({json:{...settings,portal}});
 }
 if(pathname==='/api/admin/me')return route.fulfill({json:{email:'test@example.invalid',role:'ADMIN'}});
 if(pathname==='/api/admin/settings')return route.fulfill({json:settings});
 if(pathname==='/api/admin/portal'){saved=route.request().postDataJSON();return route.fulfill({json:saved});}
 if(pathname==='/api/admin/dashboard')return route.fulfill({json:{total:0,confirmed:0,pending:0,review:0,classes:[],revenue:0}});
 if(pathname==='/api/admin/registrations'||pathname==='/api/admin/payments')return route.fulfill({json:{items:[],total:0}});
 // All other API calls are blocked; no real school API is contacted.
 return route.fulfill({status:400,json:{error:'Blocked by portal UI test'}});
});
const report=[];
for(const width of (process.env.PORTAL_VISUAL_ONLY?[]:[320,375,390,430,768,1024,1280,1440])){
 await page.setViewportSize({width,height:900});
 for(const path of routes){
  await page.goto(base+path);await page.locator('main h1').waitFor();await page.locator('text=Loading school information…').waitFor({state:'hidden'});
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,culprits:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2&&getComputedStyle(e).position!=='absolute').slice(0,5).map(e=>e.className)}));
  if(overflow.scroll>width+2)report.push({path,width,overflow});
 }
 console.log(`Checked ${routes.length} routes at ${width}px`);
}
assert.deepEqual(report,[],'Horizontal overflow: '+JSON.stringify(report));
await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/');
await page.getByRole('button',{name:'Exam Details',exact:true}).click();await page.getByRole('link',{name:'Exam Pattern',exact:true}).first().focus();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Exam Details',exact:true}).getAttribute('aria-expanded'),'false');
await page.getByRole('button',{name:'Resources',exact:true}).click();await page.getByRole('link',{name:'Information Bulletin',exact:true}).first().click();assert.ok(page.url().endsWith('/information-bulletin'));
await page.setViewportSize({width:320,height:900});await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('button',{name:'Exam Details',exact:true}).click();await page.getByRole('link',{name:'Syllabus',exact:true}).first().click();assert.ok(page.url().endsWith('/syllabus'));assert.equal(await page.getByRole('button',{name:'Open navigation'}).getAttribute('aria-expanded'),'false');
await page.getByLabel('Choose class').selectOption('12');assert.ok(await page.getByText('Syllabus for Class 12 will be published shortly.').isVisible());
mode='published';await page.goto(base+'/syllabus?class=7');assert.ok(await page.getByRole('heading',{name:'Test Class 7 syllabus'}).isVisible());
await page.goto(base+'/sample-papers?class=7');await page.getByRole('heading',{name:'Test Class 7 paper'}).waitFor();assert.equal(await page.getByRole('heading',{name:'Test Class 8 paper'}).count(),0);
await page.goto(base+'/downloads');await page.getByLabel('Document category').selectOption('bulletin');await page.getByRole('heading',{name:'Test bulletin'}).waitFor();assert.equal(await page.getByRole('heading',{name:'Test Class 7 paper'}).count(),0);
await page.goto(base+'/faq');await page.getByText('Test question?').click();assert.ok(await page.getByText('Test answer',{exact:true}).isVisible());
await page.goto(base+'/exam-pattern');await page.getByText('Test section',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
fs.mkdirSync('/tmp/shree-portal-qa',{recursive:true});
async function readyImages(){await page.evaluate(async()=>{const imgs=[...document.images];imgs.forEach(i=>i.loading='eager');await Promise.all(imgs.map(i=>i.decode().catch(()=>{})));});const broken=await page.evaluate(()=>[...document.images].filter(i=>!i.naturalWidth).map(i=>i.getAttribute('src')));assert.deepEqual(broken,[]);}
for(const theme of ['light','dark']){
 for(const path of ['/','/eligibility','/exam-pattern','/syllabus?class=7','/sample-papers','/important-dates','/exam-guidelines','/information-bulletin','/downloads','/notices','/faq','/help','/results','/awards','/prizes','/scholarships']){
  await page.goto(base+path);await page.locator('main h1').waitFor();await page.evaluate(t=>{document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;},theme);await readyImages();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,theme+' '+path+' '+JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2).map(e=>({tag:e.tagName,cls:e.className,w:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,20))));
  const missingAlt=await page.locator('main img:not([alt])').count();assert.equal(missingAlt,0,path);
  const unlabeled=await page.evaluate(()=>[...document.querySelectorAll('.portal-page input,.portal-page select,.portal-page textarea')].filter(e=>!e.labels?.length&&!e.getAttribute('aria-label')).length);assert.equal(unlabeled,0,path);
 }
 console.log(`Checked ${theme} theme, image loads and basic labels on 16 pages`);
}

await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/');await readyImages();await page.screenshot({path:'/tmp/shree-portal-qa/home-desktop.png',fullPage:true});
await page.getByRole('button',{name:'Switch to dark theme'}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.screenshot({path:'/tmp/shree-portal-qa/home-dark.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.goto(base+'/syllabus?class=7');await readyImages();await page.screenshot({path:'/tmp/shree-portal-qa/syllabus-mobile.png',fullPage:true});await page.goto(base+'/prizes');await readyImages();await page.screenshot({path:'/tmp/shree-portal-qa/prizes-mobile-dark.png',fullPage:true});await page.getByRole('button',{name:'Switch to light theme'}).click();
mode='error';await page.goto(base+'/scholarships');await page.getByText('Unable to load scholarship details. Please try again.').waitFor();mode='empty';await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByText('Scholarship details for SHREE 2026 OLYMPIAD will be announced shortly.').waitFor();
mode='loading';await page.goto(base+'/sample-papers');await page.getByText('Updating live examination details…').waitFor();await page.getByText('Official sample paper for Class 1 will be published shortly.').waitFor();
mode='error';await page.goto(base+'/syllabus');await page.getByText('Some live examination details are temporarily unavailable. General information is still available below.').waitFor();mode='empty';await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByText('Syllabus for Class 1 will be published shortly.').waitFor();
await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/admin');await page.getByRole('button',{name:'Event settings',exact:true}).click();await page.getByText('Public portal content',{exact:true}).waitFor();await page.getByText('Notices (0)',{exact:true}).click();await page.getByRole('button',{name:'Add notices entry'}).click();const row=page.locator('.portal-editor-row').filter({has:page.getByText('Notices · 1')});await row.getByLabel('Title',{exact:true}).fill('UI test notice');await row.getByLabel('Published',{exact:true}).check();await page.getByRole('button',{name:'Save public content'}).click();await page.getByText('Public content saved.',{exact:false}).waitFor();assert.equal(saved.portal.notices[0].title,'UI test notice');assert.equal(saved.portal.notices[0].isPublished,true);
assert.deepEqual(errors,[]);console.log(`PASS: ${process.env.PORTAL_VISUAL_ONLY?0:192} route/viewport checks, navigation, filters, published/empty/loading/error states, dark screenshots, admin editor; 32 theme/image/accessibility checks; no SMS/payment requests.`);
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
