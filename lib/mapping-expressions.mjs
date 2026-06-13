// =============================================================================
// Expresiones de mapeo: cálculos, IF y CASE (funciones puras, testeables).
// =============================================================================

const NUMERIC_OPS = new Set(['add', 'subtract', 'multiply', 'divide']);
const FIELD_NUMERIC_OPS = new Set(['addBy', 'subtractBy', 'multiplyBy', 'divideBy']);

export function normalizeOperator(operator) {
  const op = String(operator || '').trim();
  const aliases = {
    eq: 'equals',
    ne: 'notEquals',
    gt: 'greaterThan',
    lt: 'lessThan',
  };
  return aliases[op] || op;
}

export function isEmptyValue(fieldValue) {
  return (
    fieldValue === undefined ||
    fieldValue === null ||
    fieldValue === '' ||
    (Array.isArray(fieldValue) && fieldValue.length === 0) ||
    (typeof fieldValue === 'object' &&
      fieldValue !== null &&
      Object.keys(fieldValue).length === 0)
  );
}

export function compareValues(fieldValue, operator, compareValue) {
  const op = normalizeOperator(operator);

  switch (op) {
    case 'equals': {
      if (typeof fieldValue === 'number' || !Number.isNaN(Number(compareValue))) {
        return Number(fieldValue) === Number(compareValue);
      }
      return String(fieldValue) === String(compareValue);
    }
    case 'notEquals': {
      if (typeof fieldValue === 'number' || !Number.isNaN(Number(compareValue))) {
        return Number(fieldValue) !== Number(compareValue);
      }
      return String(fieldValue) !== String(compareValue);
    }
    case 'greaterThan':
      return Number(fieldValue) > Number(compareValue);
    case 'lessThan':
      return Number(fieldValue) < Number(compareValue);
    case 'contains':
      return String(fieldValue).includes(String(compareValue));
    case 'startsWith':
      return String(fieldValue).startsWith(String(compareValue));
    case 'endsWith':
      return String(fieldValue).endsWith(String(compareValue));
    case 'isEmpty':
      return isEmptyValue(fieldValue);
    case 'isNotEmpty':
      return !isEmptyValue(fieldValue);
    default:
      return false;
  }
}

export function parseSpecPairs(specString) {
  const mapping = {};
  if (!specString || typeof specString !== 'string') {
    return mapping;
  }

  specString.split(',').forEach((pair) => {
    const colonIndex = pair.indexOf(':');
    if (colonIndex === -1) return;
    const key = pair.slice(0, colonIndex).trim();
    const val = pair.slice(colonIndex + 1).trim();
    if (!key) return;
    const numVal = Number(val);
    mapping[key] = Number.isNaN(numVal) ? val : numVal;
  });

  return mapping;
}

export function resolveCase(value, caseSpec) {
  if (!caseSpec || typeof caseSpec !== 'object') {
    return value;
  }

  const lookupKey = value === undefined || value === null ? '' : String(value);
  if (caseSpec[lookupKey] !== undefined) {
    return caseSpec[lookupKey];
  }
  if (value !== undefined && value !== null && caseSpec[value] !== undefined) {
    return caseSpec[value];
  }
  if (caseSpec.default !== undefined) {
    return caseSpec.default;
  }
  return undefined;
}

export function resolveValueReference(rawValue, context, getNestedValue) {
  if (rawValue === undefined || rawValue === null) {
    return rawValue;
  }

  const trimmed = String(rawValue).trim();
  if (trimmed === '') {
    return '';
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (
    getNestedValue &&
    context &&
    (trimmed.startsWith('data.') ||
      trimmed.startsWith('prev.') ||
      trimmed.startsWith('headers.') ||
      trimmed.startsWith('now.'))
  ) {
    const resolved = getNestedValue(context, trimmed);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  return trimmed;
}

export function resolveIf({ value, operator, compareTo, thenVal, elseVal, context, getNestedValue }) {
  const op = normalizeOperator(operator);
  const needsCompare = op !== 'isEmpty' && op !== 'isNotEmpty';
  const compareValue = needsCompare ? compareTo : undefined;
  const matches = compareValues(value, op, compareValue);
  const chosen = matches ? thenVal : elseVal;
  return resolveValueReference(chosen, context, getNestedValue);
}

export function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

export function applyNumericTransform(value, transform, context, getNestedValue) {
  const base = toNumberOrNull(value);
  if (base === null) {
    console.warn(`Numeric transform skipped: value is not numeric (${value})`);
    return null;
  }

  let operand = transform.operand;
  if (transform.field && getNestedValue && context) {
    operand = getNestedValue(context, transform.field);
  }

  const opNum = toNumberOrNull(operand);
  if (opNum === null && transform.type !== 'round') {
    console.warn(`Numeric transform skipped: operand is not numeric (${operand})`);
    return null;
  }

  switch (transform.type) {
    case 'add':
    case 'addBy':
      return base + opNum;
    case 'subtract':
    case 'subtractBy':
      return base - opNum;
    case 'multiply':
    case 'multiplyBy':
      return base * opNum;
    case 'divide':
    case 'divideBy':
      if (opNum === 0) {
        console.warn('Numeric transform skipped: division by zero');
        return null;
      }
      return base / opNum;
    case 'round': {
      const digits = transform.operand !== undefined ? Number(transform.operand) : 0;
      const factor = 10 ** (Number.isNaN(digits) ? 0 : digits);
      return Math.round(base * factor) / factor;
    }
    default:
      return value;
  }
}

export function splitFunctionArgs(argsString) {
  const args = [];
  let current = '';
  let depth = 0;
  let inQuote = null;

  for (let i = 0; i < argsString.length; i++) {
    const ch = argsString[i];

    if (inQuote) {
      current += ch;
      if (ch === '\\' && i + 1 < argsString.length) {
        current += argsString[i + 1];
        i++;
        continue;
      }
      if (ch === inQuote) {
        inQuote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;
      current += ch;
      continue;
    }

    if (ch === '(') {
      depth++;
      current += ch;
      continue;
    }

    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }

    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim() !== '' || args.length > 0) {
    args.push(current.trim());
  }

  return args;
}

export function evaluateTemplateIf(argsString, context, getNestedValue) {
  const args = splitFunctionArgs(argsString);
  if (args.length < 4) {
    console.warn('if() requires at least 4 arguments: field, operator, compareTo, thenVal, elseVal');
    return null;
  }

  const [field, operator, compareTo, thenVal, elseVal] = args;
  const fieldValue = getNestedValue(context, field.trim());
  return resolveIf({
    value: fieldValue,
    operator,
    compareTo,
    thenVal,
    elseVal,
    context,
    getNestedValue,
  });
}

export function evaluateTemplateCase(argsString, context, getNestedValue) {
  const args = splitFunctionArgs(argsString);
  if (args.length < 3) {
    console.warn('case() requires field and at least one value/result pair');
    return null;
  }

  const field = args[0].trim();
  const fieldValue = getNestedValue(context, field);
  const caseSpec = {};

  let i = 1;
  while (i < args.length) {
    const key = args[i];
    if (key === 'default') {
      if (i + 1 < args.length) {
        caseSpec.default = resolveValueReference(args[i + 1], context, getNestedValue);
      }
      break;
    }
    if (i + 1 < args.length) {
      caseSpec[key] = resolveValueReference(args[i + 1], context, getNestedValue);
      i += 2;
    } else {
      break;
    }
  }

  const result = resolveCase(fieldValue, caseSpec);
  return result === undefined ? null : result;
}

export function evaluateArithmeticExpression(expr) {
  if (expr === undefined || expr === null) return null;
  const trimmed = String(expr).trim();
  if (!trimmed || !/[+\-*/]/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isNaN(num) ? null : num;
  }

  let index = 0;

  function peek() {
    return trimmed[index];
  }

  function consumeWhitespace() {
    while (index < trimmed.length && /\s/.test(trimmed[index])) index++;
  }

  function parseNumber() {
    consumeWhitespace();
    const match = trimmed.slice(index).match(/^-?\d+(?:\.\d+)?/);
    if (!match) return null;
    index += match[0].length;
    return Number(match[0]);
  }

  function parseFactor() {
    consumeWhitespace();
    if (peek() === '(') {
      index++;
      const val = parseExpression();
      consumeWhitespace();
      if (peek() !== ')') return null;
      index++;
      return val;
    }
    return parseNumber();
  }

  function parseTerm() {
    let left = parseFactor();
    if (left === null) return null;

    while (true) {
      consumeWhitespace();
      const op = peek();
      if (op !== '*' && op !== '/') break;
      index++;
      const right = parseFactor();
      if (right === null) return null;
      if (op === '*') {
        left = left * right;
      } else {
        if (right === 0) {
          console.warn('Arithmetic expression: division by zero');
          return null;
        }
        left = left / right;
      }
    }
    return left;
  }

  function parseExpression() {
    consumeWhitespace();
    let left = parseTerm();
    if (left === null) return null;

    while (true) {
      consumeWhitespace();
      const op = peek();
      if (op !== '+' && op !== '-') break;
      index++;
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  const result = parseExpression();
  consumeWhitespace();
  if (index !== trimmed.length) {
    return null;
  }
  return result;
}

export function resolveInlineCalcTemplates(template, resolvePlaceholder) {
  if (!template || typeof template !== 'string') {
    return template;
  }

  const pattern =
    /\{\{([^}]+)\}\}((?:\s*[+\-*/]\s*(?:\{\{[^}]+\}\}|-?\d+(?:\.\d+)?))+)/g;

  return template.replace(pattern, (fullMatch) => {
    let hasInvalidOperand = false;

    const exprString = fullMatch.replace(/\{\{([^}]+)\}\}/g, (_m, expr) => {
      const value = resolvePlaceholder(expr.trim());
      if (value === undefined || value === null || value === '') {
        hasInvalidOperand = true;
        return 'NaN';
      }
      const num = Number(value);
      if (Number.isNaN(num)) {
        hasInvalidOperand = true;
        return 'NaN';
      }
      return String(num);
    });

    if (hasInvalidOperand) {
      console.warn(`Inline calc skipped: non-numeric value in ${fullMatch}`);
      return 'null';
    }

    const result = evaluateArithmeticExpression(exprString);
    if (result === null) {
      console.warn(`Inline calc failed for expression: ${exprString}`);
      return 'null';
    }

    return String(result);
  });
}

export function resolveArithmeticInJsonString(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') {
    return jsonStr;
  }

  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';

  while (i < jsonStr.length) {
    const ch = jsonStr[i];

    if (inString) {
      result += ch;
      if (ch === '\\' && i + 1 < jsonStr.length) {
        result += jsonStr[i + 1];
        i += 2;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      result += ch;
      i++;
      continue;
    }

    const rest = jsonStr.slice(i);
    const exprMatch = rest.match(
      /^(\(?\s*-?\d+(?:\.\d+)?\s*\)?(?:\s*[+\-*/]\s*\(?\s*-?\d+(?:\.\d+)?\s*\)?)+)/,
    );

    if (exprMatch && /[+\-*/]/.test(exprMatch[1])) {
      const evaluated = evaluateArithmeticExpression(exprMatch[1].trim());
      if (evaluated !== null) {
        result += String(evaluated);
        i += exprMatch[1].length;
        continue;
      }
    }

    result += ch;
    i++;
  }

  return result;
}

export function parseSuffixTransform(suffix) {
  const trimmed = suffix.trim();
  if (!trimmed) return null;

  const numericLiteralMatch = trimmed.match(/^(add|subtract|multiply|divide)\((-?\d+(?:\.\d+)?)\)$/);
  if (numericLiteralMatch) {
    return {
      type: numericLiteralMatch[1],
      operand: Number(numericLiteralMatch[2]),
    };
  }

  const numericFieldMatch = trimmed.match(/^(addBy|subtractBy|multiplyBy|divideBy)\(([^)]+)\)$/);
  if (numericFieldMatch) {
    return {
      type: numericFieldMatch[1],
      field: numericFieldMatch[2].trim(),
    };
  }

  const roundMatch = trimmed.match(/^round\((\d+)?\)$/);
  if (roundMatch) {
    return {
      type: 'round',
      operand: roundMatch[1] !== undefined ? Number(roundMatch[1]) : 0,
    };
  }

  const ifMatch = trimmed.match(/^if\((.+)\)$/);
  if (ifMatch) {
    const args = splitFunctionArgs(ifMatch[1]);
    if (args.length >= 3) {
      const [operator, compareTo, thenVal, elseVal] = args;
      return {
        type: 'if',
        operator,
        compareTo: compareTo ?? '',
        thenVal: thenVal ?? '',
        elseVal: elseVal ?? '',
      };
    }
  }

  return null;
}

export function isNumericTransformType(type) {
  return NUMERIC_OPS.has(type) || FIELD_NUMERIC_OPS.has(type) || type === 'round';
}
