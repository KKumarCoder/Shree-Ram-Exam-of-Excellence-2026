import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSchema,manualSchema,lookupSchema,safeCsv} from '../src/utils/validation.js';
const good={studentName:'Aarav Kumar',dob:'2013-02-12',studentClass:'7',currentSchool:'Sample School',guardianName:'Anita Kumar',guardianPhone:'9876543210',email:'',address:'Village Road',city:'Kanhra',district:'Charkhi Dadri',state:'Haryana',pincode:'127306',purpose:'',consent:true};
test('accepts valid real student data',()=>assert.equal(startSchema.parse(good).studentName,'AARAV KUMAR'));
test('rejects incorrect guardian phone',()=>assert.equal(startSchema.safeParse({...good,guardianPhone:'123'}).success,false));
test('requires guardian consent',()=>assert.equal(startSchema.safeParse({...good,consent:false}).success,false));
test('requires real UTR and accepted terms',()=>{assert.equal(manualSchema.safeParse({utr:'1234567890',termsAccepted:'true'}).success,true);assert.equal(manualSchema.safeParse({utr:'123',termsAccepted:'true'}).success,false);assert.equal(manualSchema.safeParse({utr:'1234567890',termsAccepted:'false'}).success,false);});
test('accepts confirmed registration or private application reference',()=>{assert.equal(lookupSchema.safeParse({registrationNumber:'SHREE26-000001',phone:'9876543210'}).success,true);assert.equal(lookupSchema.safeParse({registrationNumber:'APP-1A2B3C4D5E',phone:'9876543210'}).success,true);});
test('protects spreadsheet exports from formula injection',()=>assert.equal(safeCsv('=SUM(A1:A2)'),`"'=SUM(A1:A2)"`));

test('registration text is stored in capitals while email and numeric fields retain their values', () => {
  const input = {...good, email:'Parent.Name@example.com', purpose:'Learn and compete'};
  const result = startSchema.parse(input);
  for (const key of ['studentName','currentSchool','guardianName','address','city','district','state','purpose']) {
    assert.equal(result[key], input[key].toUpperCase());
  }
  for (const key of ['email','dob','studentClass','guardianPhone','pincode','consent']) assert.equal(result[key], input[key]);
  assert.equal(startSchema.parse({...good, purpose:undefined}).purpose, '');
});

test('rejects malformed registration fields even when submitted directly to the API', () => {
  for (const [key, value] of [
    ['studentName','Student123'], ['guardianName','38925799359RDSG'], ['studentName','A'],
    ['guardianPhone','abcdefghij'], ['guardianPhone','1234567890'], ['guardianPhone','98765432100'],
    ['pincode','dgasg'], ['pincode','012345'], ['pincode','12345'],
    ['currentSchool','23456'], ['currentSchool','<script>'], ['address','123456'],
    ['city','123'], ['district','@#$'], ['state','123'], ['purpose','12345'],
    ['email','namegmail.com'], ['email','name@'], ['dob','2013-02-30'], ['dob','2099-01-01'],
  ]) assert.equal(startSchema.safeParse({...good,[key]:value}).success, false, `${key}: ${value}`);
  assert.equal(startSchema.safeParse({...good,currentSchool:"ST MARYS SCHOOL",address:'HOUSE 12, WARD-4 / MAIN ROAD',email:'parent@gmail.com'}).success,true);
  assert.equal(startSchema.safeParse({...good,email:'parent@school.edu.in'}).success,true);
});

test('school, city and district require letters and spaces', () => {
  for (const key of ['currentSchool','city','district']) {
    for (const value of ['School 123','Town@Name','A','   ']) assert.equal(startSchema.safeParse({...good,[key]:value}).success,false);
    assert.equal(startSchema.parse({...good,[key]:'shree ram'})[key], 'SHREE RAM');
  }
});
