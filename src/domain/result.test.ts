import { expect, test } from '@jest/globals';

import { err, ok, type Result } from './result';

test('ok preserves a successful value for discriminated consumption', () => {
  const result: Result<number, string> = ok(42);
  expect(result.ok ? result.value : result.error).toBe(42);
  expect(ok(null)).toEqual({ ok: true, value: null });
});

test('err preserves the error as a value', () => {
  const result: Result<number, string> = err('expired');
  expect(result.ok ? result.value : result.error).toBe('expired');
});
