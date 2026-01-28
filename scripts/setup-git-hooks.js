const fs = require('fs');
const path = require('path');

const gitHooksDir = path.join(__dirname, '..', '.git', 'hooks');
const preCommitHookPath = path.join(gitHooksDir, 'pre-commit');
const incrementBuildScript = path.join(__dirname, 'increment-build.js');

try {
  // Crear el directorio .git/hooks si no existe
  if (!fs.existsSync(gitHooksDir)) {
    console.log('⚠️  Directorio .git/hooks no encontrado. Asegúrate de que el repositorio git esté inicializado.');
    process.exit(1);
  }
  
  // Leer el contenido actual del hook si existe
  let hookContent = '';
  if (fs.existsSync(preCommitHookPath)) {
    hookContent = fs.readFileSync(preCommitHookPath, 'utf8');
    
    // Verificar si ya contiene nuestro script
    if (hookContent.includes('increment-build.js')) {
      console.log('✅ El git hook pre-commit ya está configurado.');
      process.exit(0);
    }
  }
  
  // Crear el contenido del hook
  const newHookContent = `#!/bin/sh
# Incrementar build number antes de cada commit
node "${incrementBuildScript}"

# Continuar con el commit
exit 0
`;
  
  // Si ya existe un hook, agregar nuestro script al inicio
  if (hookContent) {
    const finalContent = `#!/bin/sh
# Incrementar build number antes de cada commit
node "${incrementBuildScript}"

${hookContent}
`;
    fs.writeFileSync(preCommitHookPath, finalContent, 'utf8');
  } else {
    fs.writeFileSync(preCommitHookPath, newHookContent, 'utf8');
  }
  
  // Hacer el hook ejecutable (en sistemas Unix)
  if (process.platform !== 'win32') {
    fs.chmodSync(preCommitHookPath, '755');
  }
  
  console.log('✅ Git hook pre-commit configurado correctamente.');
} catch (error) {
  console.error('❌ Error al configurar git hooks:', error.message);
  process.exit(1);
}








