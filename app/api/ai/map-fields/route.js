import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// Marcar como dinámico porque usa headers (getServerSession)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Función para normalizar nombres de campos
 */
function normalizeFieldName(field) {
  return field
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Función para calcular similitud entre dos strings usando Levenshtein
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Función para calcular similitud (0-1, donde 1 es idéntico)
 */
function similarity(str1, str2) {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

/**
 * Función para extraer todas las claves de un objeto (incluyendo anidadas)
 */
function extractKeys(obj, prefix = '') {
  const keys = [];
  
  if (obj === null || obj === undefined) return keys;
  
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return keys;
  }

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...extractKeys(value, fullKey));
    }
  }
  
  return keys;
}

/**
 * Función para mapear campos de forma inteligente
 */
function intelligentMapping(sourceFields, destinationFields) {
  const mappings = [];
  const normalizedSource = sourceFields.map(f => ({
    original: f,
    normalized: normalizeFieldName(f),
  }));
  
  const normalizedDest = destinationFields.map(f => ({
    original: f,
    normalized: normalizeFieldName(f),
  }));

  // Mapear cada campo destino con el campo origen más similar
  for (const dest of normalizedDest) {
    let bestMatch = null;
    let bestScore = 0;

    for (const src of normalizedSource) {
      // Calcular similitud
      const sim = similarity(dest.normalized, src.normalized);
      
      // Bonus si son exactamente iguales (después de normalizar)
      const exactMatch = dest.normalized === src.normalized ? 0.3 : 0;
      
      // Bonus si contienen las mismas palabras clave
      const destWords = dest.normalized.split(' ');
      const srcWords = src.normalized.split(' ');
      const commonWords = destWords.filter(w => srcWords.includes(w) && w.length > 2);
      const wordBonus = commonWords.length > 0 ? commonWords.length * 0.1 : 0;
      
      const totalScore = sim + exactMatch + wordBonus;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMatch = src.original;
      }
    }

    // Solo agregar mapeo si la similitud es razonable (>= 0.3)
    if (bestMatch && bestScore >= 0.3) {
      mappings.push({
        dest: dest.original,
        src: bestMatch,
        confidence: Math.min(100, Math.round(bestScore * 100)),
      });
    }
  }

  return mappings;
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { sourceExample, destinationUrl, destinationExample } = body;

    if (!sourceExample) {
      return NextResponse.json(
        { error: 'sourceExample es requerido' },
        { status: 400 }
      );
    }

    // Extraer campos del origen
    let sourceFields = [];
    try {
      const sourceData = typeof sourceExample === 'string' 
        ? JSON.parse(sourceExample) 
        : sourceExample;
      sourceFields = extractKeys(sourceData);
    } catch (error) {
      return NextResponse.json(
        { error: 'sourceExample debe ser un JSON válido' },
        { status: 400 }
      );
    }

    // Extraer campos del destino
    let destinationFields = [];
    let destinationExampleData = null;
    
    if (destinationExample) {
      // Si se proporciona un ejemplo de destino
      try {
        const destData = typeof destinationExample === 'string'
          ? JSON.parse(destinationExample)
          : destinationExample;
        destinationFields = extractKeys(destData);
        destinationExampleData = destData;
      } catch (error) {
        return NextResponse.json(
          { error: 'destinationExample debe ser un JSON válido' },
          { status: 400 }
        );
      }
    } else if (destinationUrl) {
      // Intentar obtener campos del destino haciendo llamadas HTTP
      try {
        // Intentar diferentes métodos para obtener la estructura
        const methods = ['GET', 'OPTIONS', 'POST'];
        let success = false;

        for (const method of methods) {
          try {
            // Crear un AbortController para timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(destinationUrl, {
              method: method,
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              // Para POST, enviar un objeto vacío
              body: method === 'POST' ? JSON.stringify({}) : undefined,
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (response && response.ok) {
              const contentType = response.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                destinationFields = extractKeys(data);
                destinationExampleData = data;
                success = true;
                break;
              }
            }
          } catch (error) {
            // Continuar con el siguiente método
            continue;
          }
        }

        // Si ningún método funcionó, intentar crear un ejemplo basado en la URL
        if (!success && destinationUrl) {
          // Intentar hacer una llamada HEAD para obtener información
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const headResponse = await fetch(destinationUrl, {
              method: 'HEAD',
              headers: {
                'Accept': 'application/json',
              },
              signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            // Si HEAD funciona, al menos sabemos que la URL es válida
          } catch (error) {
            // URL puede no ser accesible, pero continuamos
          }
        }
      } catch (error) {
        console.error('Error obteniendo campos del destino:', error);
        // Continuar sin campos del destino
      }
    }

    // Si solo se solicita obtener el destino
    if (body.getDestinationOnly) {
      return NextResponse.json({
        success: true,
        destinationExample: destinationExampleData,
        destinationFields,
      });
    }

    if (destinationFields.length === 0) {
      return NextResponse.json(
        { error: 'No se pudieron obtener los campos del destino. Proporciona un destinationExample.' },
        { status: 400 }
      );
    }

    // Realizar mapeo inteligente
    const mappings = intelligentMapping(sourceFields, destinationFields);

    return NextResponse.json({
      success: true,
      mappings,
      sourceFields,
      destinationFields,
    });
  } catch (error) {
    console.error('Error en mapeo inteligente:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

