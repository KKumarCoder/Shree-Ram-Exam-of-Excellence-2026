import test from 'node:test';
import assert from 'node:assert/strict';
import {portalSchema,publicPortal} from '../src/utils/portalContent.js';
import {applicationStages} from '../../client/src/portalData.js';
import {Settings} from '../src/models/index.js';

test('existing settings need no migration and unconfigured exam information stays unpublished',()=>{
  const settings=new Settings({_id:'primary'});
  const portal=publicPortal(settings.portal);
  assert.equal(portal.examPattern.isPublished,false);
  assert.deepEqual(portal.resources,[]);
  assert.deepEqual(portal.announcement,{enabled:false});
  assert.equal(portal.examMode,'');
  assert.equal(settings.fee,149);
});
test('public projection removes drafts in every collection, disabled announcement and unpublished pattern',()=>{
  const data=portalSchema.parse({
    announcement:{enabled:false,text:'draft notice'},examPattern:{isPublished:false,totalMarks:'draft'},
    notices:[{title:'draft'},{title:'public',isPublished:true}],resources:[{title:'draft document',category:'bulletin',fileUrl:'https://school.example/private.pdf'}],
    faq:[{question:'draft question',answer:'draft answer'}],syllabus:[{studentClass:'7',title:'draft syllabus'}],importantDates:[{title:'draft date'}],guidelines:[{title:'draft rule'}],journey:[{title:'draft journey'}],awardRules:[{title:'draft award'}],
  });
  const out=publicPortal(data);assert.equal(out.notices.length,1);assert.equal(out.notices[0].title,'public');
  for(const field of ['resources','faq','syllabus','importantDates','guidelines','journey','awardRules'])assert.deepEqual(out[field],[]);
  assert.equal(JSON.stringify(out).includes('draft'),false);
});
test('URL validation rejects script schemes, protocol-relative URLs and backslash escapes',()=>{
  for(const link of ['javascript:alert(1)','data:text/html,hi','//evil.example','/\\evil.example','https://good.example\\@evil.example','https://good.example/a b'])assert.equal(portalSchema.safeParse({announcement:{enabled:true,link}}).success,false,link);
  for(const link of ['/downloads','/documents/syllabus.pdf','https://school.example/bulletin.pdf'])assert.equal(portalSchema.safeParse({announcement:{enabled:true,link}}).success,true,link);
});
test('strict content schema rejects secrets, unsupported classes and unknown fields',()=>{
  assert.equal(portalSchema.safeParse({secret:'never public'}).success,false);
  assert.equal(portalSchema.safeParse({resources:[{title:'x',category:'bulletin',adminId:'private'}]}).success,false);
  assert.equal(portalSchema.safeParse({syllabus:[{studentClass:'13'}]}).success,false);
  assert.equal(JSON.stringify(publicPortal({secret:'never public'})).includes('never public'),false);
});
test('published documents retain class and metadata and respect display order',()=>{
  const out=publicPortal({resources:[{title:'B',category:'sample-paper',studentClass:'7',isPublished:true,sortOrder:2,fileUrl:'/papers/a.pdf',pages:'4',year:'2026'},{title:'A',category:'bulletin',isPublished:true,sortOrder:1}]});
  assert.deepEqual(out.resources.map(x=>x.title),['A','B']);assert.equal(out.resources[1].studentClass,'7');assert.equal(out.resources[1].pages,'4');
});
test('application timeline never invents approval, attendance or result completion',()=>{
  for(const status of ['DRAFT','OTP_VERIFIED','PAYMENT_PENDING','PAYMENT_UNDER_VERIFICATION','PAYMENT_REJECTED','CANCELLED','CONFIRMING','CONFIRMED']){
    const stages=applicationStages({status,verified:status!=='DRAFT',applicationRef:'APP-TEST'});
    assert.equal(stages[3].status==='completed',status==='CONFIRMED');
    assert.equal(stages[4].status==='completed',status==='CONFIRMED');
    assert.equal(stages[5].status,'upcoming');assert.equal(stages[6].status,'TBA');
  }
  assert.equal(applicationStages({status:'CONFIRMED',verified:true,checkInAt:'2026-01-01'})[5].title,'Exam check-in recorded');
});
