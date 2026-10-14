export const WEBHOOK_SUMMARY_SEARCH_TEXT_MAX = 300;
const SEARCH_VALUE_MAX = 80;

/**
 * Texto de búsqueda de un log: solo valores (sin claves JSON) y primero los datos de negocio,
 * para que pedido, cliente, código ERP o CUIT entren en el límite de caracteres.
 */
export function buildWebhookSearchText(webhook) {
  if (!webhook || typeof webhook !== 'object') {
    return '';
  }

  try {
    const parts = [
      webhook.incomingData,
      webhook.mappedData,
      webhook.result?.error,
      webhook.result?.message,
      webhook.flowName,
      webhook.result?.responseData,
    ];

    const seen = new Set();
    const values = [];
    let length = 0;
    const collect = (value, depth = 0) => {
      if (length >= WEBHOOK_SUMMARY_SEARCH_TEXT_MAX || value === undefined || value === null) {
        return;
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const text = String(value).trim().toLowerCase().slice(0, SEARCH_VALUE_MAX);
        if (text && !seen.has(text)) {
          seen.add(text);
          values.push(text);
          length += text.length + 1;
        }
        return;
      }
      if (typeof value === 'object' && depth < 6) {
        for (const child of Object.values(value)) {
          collect(child, depth + 1);
        }
      }
    };
    parts.forEach((part) => collect(part));

    return values.join(' ').slice(0, WEBHOOK_SUMMARY_SEARCH_TEXT_MAX);
  } catch {
    return '';
  }
}
