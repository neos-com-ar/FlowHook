import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WEBHOOK_SUMMARY_SEARCH_TEXT_MAX,
  buildWebhookSearchText,
} from '../lib/webhook-search-text.mjs';

test('prioriza valores de datos recibidos sin claves JSON', () => {
  const text = buildWebhookSearchText({
    flowName: 'eOne',
    destino: 'https://erp.example.com/api/pedidos',
    incomingData: { pedido: { numero: 'PED-1234', cliente: { cuit: '30-71234567-8' } } },
    result: { message: 'OK', responseData: { very: 'long'.repeat(200) } },
  });
  assert.ok(text.startsWith('ped-1234 30-71234567-8'));
  assert.ok(!text.includes('pedido'));
  assert.ok(!text.includes('https://erp.example.com'));
});

test('respeta el límite de caracteres con payloads grandes', () => {
  const incomingData = { items: Array.from({ length: 500 }, (_, i) => ({ sku: `SKU-${i}` })) };
  const text = buildWebhookSearchText({ incomingData });
  assert.ok(text.length <= WEBHOOK_SUMMARY_SEARCH_TEXT_MAX);
  assert.ok(text.startsWith('sku-0 sku-1'));
});

test('devuelve vacío para entradas inválidas', () => {
  assert.equal(buildWebhookSearchText(null), '');
});
