const fs = require('fs');
const path = require('path');

const buildInfoPath = path.join(__dirname, '..', 'build-info.json');

try {
  // Leer el archivo de build info
  let buildInfo = { buildNumber: 1, lastBuild: null };
  
  if (fs.existsSync(buildInfoPath)) {
    const content = fs.readFileSync(buildInfoPath, 'utf8');
    buildInfo = JSON.parse(content);
  }
  
  // Incrementar el build number
  buildInfo.buildNumber = (buildInfo.buildNumber || 0) + 1;
  buildInfo.lastBuild = new Date().toISOString();
  
  // Guardar el archivo
  fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2), 'utf8');
  
  console.log(`✅ Build number incrementado a: ${buildInfo.buildNumber}`);
  
  // Retornar el build number para que pueda ser usado por git hook
  process.exit(0);
} catch (error) {
  console.error('❌ Error al incrementar build number:', error.message);
  process.exit(1);
}






