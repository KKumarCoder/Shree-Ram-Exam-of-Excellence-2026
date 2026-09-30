import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPublicDate,preparationAvailability,eligibleClassLabel} from '../src/publicDisplay.js';
import {mergePublicConfig} from '../src/publicConfig.js';
test('public dates use one timezone-independent display and preserve school labels',()=>{
 for(const value of ['12-01-2027','12/01/2027','2027-01-12','2027-01-12T00:00:00Z'])assert.equal(formatPublicDate(value),'12 Jan 2027');
 for(const value of ['',undefined,'TBA','31-02-2027'])assert.equal(formatPublicDate(value),'To be announced');
 assert.equal(formatPublicDate('School confirmation pending'),'School confirmation pending');
});
test('main exam date wins over a conflicting milestone; milestone is a shared fallback',()=>{
 const portal={importantDates:[{title:'Examination Day',date:'13-01-2027'}]};
 assert.equal(mergePublicConfig({examDate:''},{examDate:'12-01-2027',portal}).examDate,'12-01-2027');
 assert.equal(mergePublicConfig({examDate:''},{portal}).examDate,'13-01-2027');
});
test('availability reflects usable configured content for the selected class',()=>{
 const settings={portal:{syllabus:[{studentClass:'2',topics:['Published topic'],samplePaperUrl:'/class2.pdf'}],resources:[{category:'sample-paper',studentClass:'1',fileUrl:'javascript:bad'}],examPattern:{isPublished:false}}};
 assert.deepEqual(preparationAvailability(settings,'1'),{syllabus:false,samplePaper:false,examPattern:false});
 assert.deepEqual(preparationAvailability(settings,'2'),{syllabus:true,samplePaper:true,examPattern:false});
 settings.portal.resources.push({category:'sample-paper',studentClass:'',fileUrl:'/all.pdf'});
 assert.equal(preparationAvailability(settings,'1').samplePaper,true);
});
test('class labels preserve configured gaps instead of implying wider eligibility',()=>{
 assert.equal(eligibleClassLabel({eligibleClasses:['1','2','3']}),'1–3');
 assert.equal(eligibleClassLabel({eligibleClasses:['1','3']}),'1, 3');
 assert.equal(eligibleClassLabel({eligibleClasses:[]}),'To be announced');
});
