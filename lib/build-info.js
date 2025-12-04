import fs from 'fs';
import path from 'path';

/**
 * Lee el número de build desde el archivo build-info.json
 * Esta función solo funciona en el servidor (Node.js)
 */
export function getBuildInfo() {
  try {
    const buildInfoPath = path.join(process.cwd(), 'build-info.json');
    
    if (!fs.existsSync(buildInfoPath)) {
      return { buildNumber: 0, lastBuild: null };
    }
    
    const content = fs.readFileSync(buildInfoPath, 'utf8');
    const buildInfo = JSON.parse(content);
    
    return {
      buildNumber: buildInfo.buildNumber || 0,
      lastBuild: buildInfo.lastBuild || null,
    };
  } catch (error) {
    console.error('Error al leer build-info.json:', error);
    return { buildNumber: 0, lastBuild: null };
  }
}

