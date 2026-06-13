import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compareValues,
  resolveCase,
  resolveIf,
  applyNumericTransform,
  evaluateArithmeticExpression,
  resolveArithmeticInJsonString,
  evaluateTemplateIf,
  evaluateTemplateCase,
  splitFunctionArgs,
  parseSuffixTransform,
} from '../lib/mapping-expressions.mjs';

function getNestedValue(obj, path) {
  if (!path || typeof path !== 'string') return obj;
  const segments = [];
  const parts = path.split('.');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const arrayPattern = /^([^[]+)((?:\[\d+\])+)$/;
    const match = trimmed.match(arrayPattern);
    if (match) {
      segments.push(match[1]);
      const indices = match[2].match(/\[(\d+)\]/g) || [];
      for (const idx of indices) {
        segments.push(parseInt(idx.slice(1, -1), 10));
      }
    } else {
      segments.push(trimmed);
    }
  }
  let current = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof segment === 'number') {
      current = Array.isArray(current) ? current[segment] : undefined;
    } else {
      current = current[segment];
    }
  }
  return current;
}

test('compareValues equals numérico y string', () => {
  assert.equal(compareValues(10, 'equals', '10'), true);
  assert.equal(compareValues('ACTIVO', 'equals', 'ACTIVO'), true);
  assert.equal(compareValues(10, 'notEquals', '5'), true);
});

test('compareValues greaterThan y lessThan', () => {
  assert.equal(compareValues(100, 'gt', '50'), true);
  assert.equal(compareValues(10, 'lessThan', '20'), true);
});

test('compareValues isEmpty e isNotEmpty', () => {
  assert.equal(compareValues(null, 'isEmpty', ''), true);
  assert.equal(compareValues('hola', 'isNotEmpty', ''), true);
});

test('applyNumericTransform divide y round encadenados manualmente', () => {
  const ctx = { data: { campo2: 4 } };
  let value = 121;
  value = applyNumericTransform(value, { type: 'divide', operand: 1.21 }, ctx, getNestedValue);
  value = applyNumericTransform(value, { type: 'round', operand: 2 }, ctx, getNestedValue);
  assert.equal(value, 100);
});

test('applyNumericTransform divideBy cross-field', () => {
  const ctx = { data: { campo1: 100, campo2: 4 } };
  const result = applyNumericTransform(
    100,
    { type: 'divideBy', field: 'data.campo2' },
    ctx,
    getNestedValue,
  );
  assert.equal(result, 25);
});

test('applyNumericTransform división por cero retorna null', () => {
  const result = applyNumericTransform(10, { type: 'divide', operand: 0 }, {}, getNestedValue);
  assert.equal(result, null);
});

test('evaluateArithmeticExpression operaciones básicas', () => {
  assert.equal(evaluateArithmeticExpression('121/1.21'), 100);
  assert.equal(evaluateArithmeticExpression('5*10.5'), 52.5);
  assert.equal(evaluateArithmeticExpression('(10+5)/3'), 5);
});

test('resolveArithmeticInJsonString en JSON', () => {
  const input = '[{ "precioUnitario": 121/1.21, "ratio": 100/4 }]';
  const output = resolveArithmeticInJsonString(input);
  assert.deepEqual(JSON.parse(output), [{ precioUnitario: 100, ratio: 25 }]);
});

test('resolveCase con y sin default', () => {
  const spec = { ACTIVE: 1, INACTIVE: 0, default: -1 };
  assert.equal(resolveCase('ACTIVE', spec), 1);
  assert.equal(resolveCase('UNKNOWN', spec), -1);
  assert.equal(resolveCase('UNKNOWN', { A: 1 }), undefined);
});

test('resolveIf sobre valor resuelto', () => {
  const result = resolveIf({
    value: 1500,
    operator: 'gt',
    compareTo: '1000',
    thenVal: 'ALTO',
    elseVal: 'BAJO',
    context: {},
    getNestedValue,
  });
  assert.equal(result, 'ALTO');
});

test('evaluateTemplateIf cross-field', () => {
  const ctx = { data: { tipo: 'PREMIUM', descuento: 15 } };
  const result = evaluateTemplateIf(
    'data.tipo,equals,PREMIUM,data.descuento,0',
    ctx,
    getNestedValue,
  );
  assert.equal(result, 15);
});

test('evaluateTemplateCase con default', () => {
  const ctx = { data: { estado: 'PENDIENTE' } };
  const result = evaluateTemplateCase(
    'data.estado,ACTIVE,1,INACTIVE,0,default,-1',
    ctx,
    getNestedValue,
  );
  assert.equal(result, -1);
});

test('splitFunctionArgs respeta comas dentro de paréntesis', () => {
  assert.deepEqual(splitFunctionArgs('a,b,(c,d),e'), ['a', 'b', '(c,d)', 'e']);
});

test('parseSuffixTransform if y divide', () => {
  assert.deepEqual(parseSuffixTransform('divide(1.21)'), {
    type: 'divide',
    operand: 1.21,
  });
  assert.deepEqual(parseSuffixTransform('divideBy(data.campo2)'), {
    type: 'divideBy',
    field: 'data.campo2',
  });
  const ifTransform = parseSuffixTransform('if(equals,ACTIVO,1,0)');
  assert.equal(ifTransform.type, 'if');
  assert.equal(ifTransform.operator, 'equals');
});
