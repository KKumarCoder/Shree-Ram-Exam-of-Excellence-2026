/* Read-only public page checks. Failure/publication fixtures never contact candidate APIs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PORTAL_TEST_URL || 'http://localhost:5173';
const paths = ['/', '/important-dates', '/exam-pattern', '/syllabus', '/sample-papers', '/information-bulletin', '/downloads', '/exam-guidelines', '/faq', '/results', '/notices', '/eligibility', '/help', '/awards', '/privacy', '/terms', '/refund', '/payment-policy'];
(async () => {
 const browser = await chromium.launch({ headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}) });
 try {
  const page = await browser.newPage({ reducedMotion:'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let mode = 'failure';
  await page.route('**/api/settings', route => mode === 'failure' ? route.fulfill({status:503,json:{error:'Simulated outage'}}) : route.fulfill({json:{portal:mode === 'published' ? {examPattern:{isPublished:true,totalQuestions:'24',sections:[{title:'Published section',questions:'24',marks:'0'}]},importantDates:[{title:'Registration Opens',date:'Official date fixture',status:'active'}],resources:[{title:'Official Class 8 paper',studentClass:'8',category:'sample-paper',fileUrl:'/official-test.pdf',previewUrl:'/official-test.pdf'}],syllabus:[{studentClass:'8',title:'Published syllabus',topics:['Official topic fixture']}]} : {}}}));
  let count=0; fs.mkdirSync('/tmp/shree-resilience-qa',{recursive:true});
  for (const state of ['failure','empty','published']) {
   mode=state;
   for (const width of [375,390,430,1440]) {
    await page.setViewportSize({width,height:900});
    for (const theme of ['light','dark']) {
     for (const path of paths) {
      await page.goto(base+path); await page.locator('main h1').waitFor();
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await page.getByText('Updating live examination details…',{exact:true}).waitFor({state:'hidden'});
      assert.equal(await page.locator('main').getByText('Unable to load school information.',{exact:false}).count(),0);
      assert.equal(await page.locator('.public-data-notice').count(),state==='failure'?1:0,path);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,`${state} ${theme} ${width} ${path}`);
      if (['/exam-pattern','/sample-papers','/syllabus','/important-dates'].includes(path)) assert.ok(await page.locator('main .portal-card').count()>=4,path);
      if(path==='/important-dates') assert.equal(await page.locator('main .portal-timeline li').count(),7);
      if(state==='failure' && width===390 && theme==='dark' && paths.indexOf(path)<9) await page.screenshot({path:`/tmp/shree-resilience-qa/${path==='/'?'home':path.slice(1)}-mobile-dark.png`,fullPage:true});
      if(state==='failure' && width===1440 && theme==='light' && paths.indexOf(path)<9) await page.screenshot({path:`/tmp/shree-resilience-qa/${path==='/'?'home':path.slice(1)}-desktop.png`,fullPage:true});
      count++;
     }
    }
   }
  }
  mode='published'; await page.goto(base+'/sample-papers?class=8'); await page.getByRole('heading',{name:'Official Class 8 paper'}).waitFor(); assert.equal(await page.getByRole('link',{name:'Download',exact:false}).filter({hasText:'Download'}).count()>0,true);
  await page.getByLabel('Choose class').selectOption('9'); await page.getByText('Official sample paper for Class 9 will be published shortly.',{exact:true}).waitFor(); assert.equal(await page.locator('main a[download]').count(),0);
  await page.goto(base+'/syllabus?class=8'); await page.getByText('Official topic fixture').waitFor();
  await page.goto(base+'/exam-pattern');await page.getByText('Published section',{exact:true}).waitFor();
  mode='failure'; await page.goto(base+'/exam-pattern');await page.getByRole('button',{name:'Retry',exact:true}).waitFor();mode='published';await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByText('Published section',{exact:true}).waitFor();assert.equal(await page.locator('.public-data-notice').count(),0);
  assert.deepEqual(errors,[]);console.log(`PASS: ${count} public route/state/viewport/theme checks, class selection, authoritative published data and retry recovery.`);
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
