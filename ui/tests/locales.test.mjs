import test from 'node:test';
import { en } from '../src/locales/en.mjs';
import { ru } from '../src/locales/ru.mjs';
import { assertLocaleParity } from '../src/locales/validate.mjs';

test('English and Russian locales have matching keys and placeholders', () => {
  assertLocaleParity({ en, ru });
});
