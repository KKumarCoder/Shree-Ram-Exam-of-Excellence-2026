import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanRegistrationInput,registrationFieldError} from '../../client/src/registrationValidation.js';
test('typed and pasted registration input follows field restrictions', () => {
  assert.equal(cleanRegistrationInput('guardianPhone','98ab765432109'), '9876543210');
  assert.equal(cleanRegistrationInput('pincode','12abc7306'), '127306');
  assert.equal(cleanRegistrationInput('studentName','krishna123 kumar!'), 'KRISHNA KUMAR');
  assert.equal(cleanRegistrationInput('email','name @gmail.com'), 'name@gmail.com');
  assert.equal(registrationFieldError('currentSchool','23456').length > 0,true);
  assert.equal(registrationFieldError('guardianPhone','5876543210').length > 0,true);
  assert.equal(registrationFieldError('pincode','012345').length > 0,true);
  assert.equal(registrationFieldError('email','name@gmail.com'),'');
  assert.equal(registrationFieldError('purpose',''),'');
  assert.equal(registrationFieldError('dob','2013-02-30').length > 0,true);
});

test('school, city and district filter typed and pasted numbers and symbols', () => {
  for (const key of ['currentSchool','city','district']) {
    assert.equal(cleanRegistrationInput(key,'shree123 ram!'), 'SHREE RAM');
    assert.equal(registrationFieldError(key,'SHREE RAM'),'');
    assert.ok(registrationFieldError(key,'SHREE 123'));
  }
});
