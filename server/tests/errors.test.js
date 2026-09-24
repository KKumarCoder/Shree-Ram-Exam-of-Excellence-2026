import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../src/middleware/errors.js';
test('malformed JSON, oversized files and invalid IDs have safe actionable errors', () => {
  for (const [error, expected] of [
    [{type:'entity.parse.failed',message:'private submitted content'},400],
    [{name:'CastError',message:'private query details'},400],
    [{code:'LIMIT_FILE_SIZE',message:'raw upload details'},413],
    [{name:'MulterError',message:'raw upload details'},400],
  ]) {
    let status, body;
    const res={status(value){status=value;return this;},json(value){body=value;}};
    errorHandler(error,{},res,()=>{});
    assert.equal(status,expected);assert.ok(body.error);assert.notEqual(body.error,error.message);
  }
});
