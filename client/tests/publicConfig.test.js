import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePublicConfig} from '../src/publicConfig.js';
const fallback={eventName:'SHREE 2026 OLYMPIAD',examDate:'',portal:{},registrationOpen:false};
test('missing public collections stay usable without invented official values',()=>{
 const result=mergePublicConfig(fallback,{portal:{resources:null,syllabus:{},importantDates:null}});
 assert.deepEqual(result.portal.resources,[]);assert.deepEqual(result.portal.syllabus,[]);
 assert.equal(result.examDate,'');assert.equal(result.portal.examPattern.duration,undefined);
 assert.equal(result.eventName,fallback.eventName);
});
test('school publications remain authoritative, including zero and false',()=>{
 const result=mergePublicConfig(fallback,{examDate:'Official date',registrationOpen:false,portal:{examPattern:{isPublished:true,totalMarks:0,sections:[{title:'Published section'}]},resources:[null,{title:'Published paper',fileUrl:'/paper.pdf'}]}});
 assert.equal(result.examDate,'Official date');assert.equal(result.portal.examPattern.totalMarks,0);assert.equal(result.registrationOpen,false);
 assert.equal(result.portal.resources.length,1);assert.equal(result.portal.examPattern.sections[0].title,'Published section');
});
test('HTML and invalid root responses surface as API failure instead of false success',()=>{
 for(const value of ['<!doctype html>',null,[],42])assert.throws(()=>mergePublicConfig(fallback,value));
});
