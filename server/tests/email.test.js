import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { normalizeEmail, sendOTP } from '../src/services/email.js';
test('email normalization rejects missing recipients', () => {
  assert.equal(normalizeEmail(' Name@Example.com '),'name@example.com');
  for(const value of ['',undefined,'not-email']) assert.throws(()=>normalizeEmail(value));
});
test('SMTP OTP uses TLS, hides provider errors and never returns the OTP', async t => {
  const values={SMTP_HOST:'smtp.example.com',SMTP_PORT:'587',SMTP_USER:'test@example.com',SMTP_PASS:'test-password',SMTP_FROM:'SHREE <test@example.com>',OTP_DEV_MODE:'false',OTP_ENABLED:'true'};
  const previous=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
  Object.assign(process.env,values); let options,mail,fail=false;
  t.mock.method(nodemailer,'createTransport',config=>{options=config;return {async sendMail(message){mail=message;if(fail)throw new Error('password private');return {accepted:[message.to],rejected:[],messageId:'test-id'};},close(){}};});
  try {
    assert.deepEqual(await sendOTP(' Name@Example.com ','012345',300),{messageId:'test-id'});
    assert.equal(options.requireTLS,true); assert.equal(options.secure,false);assert.equal(mail.to,'name@example.com');assert.match(mail.text,/012345/);assert.match(mail.text,/5 minutes/);
    fail=true;await assert.rejects(sendOTP('name@example.com','012345',300),e=>e.status===502&&!/private|password|012345/.test(e.message));
  } finally {for(const [k,v] of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
