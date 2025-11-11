/**
 * Script de migración para mover flujos existentes a proyectos
 * 
 * Este script:
 * 1. Crea un proyecto "Proyecto Principal" para cada usuario que tenga flujos
 * 2. Mueve todos los flujos existentes a ese proyecto
 * 
 * Ejecutar con: node scripts/migrate-flows-to-projects.js
 */

import { createProject, getUserFlows, saveFlowInProject, getProjectFlows } from '../lib/db.js';
import Adapter from '../lib/adapter.js';

async function migrateFlowsToProjects() {
  console.log('🚀 Iniciando migración de flujos a proyectos...\n');

  try {
    const adapter = Adapter();
    
    // Obtener todos los usuarios (esto depende de cómo esté implementado el adapter)
    // Por ahora, vamos a leer directamente del archivo de datos local
    const fs = await import('fs');
    const path = await import('path');
    
    const dataPath = path.join(process.cwd(), 'tmp', 'data.json');
    let data = {};
    
    if (fs.existsSync(dataPath)) {
      data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }

    // Obtener todos los usuarios que tienen flujos
    const userIds = Object.keys(data).filter(key => {
      const userData = data[key];
      return userData && userData.flows && Array.isArray(userData.flows) && userData.flows.length > 0;
    });

    if (userIds.length === 0) {
      console.log('✅ No hay usuarios con flujos para migrar.');
      return;
    }

    console.log(`📋 Encontrados ${userIds.length} usuario(s) con flujos.\n`);

    for (const userId of userIds) {
      console.log(`\n👤 Procesando usuario: ${userId}`);
      
      try {
        // Verificar si ya tiene un proyecto "Proyecto Principal"
        const { getUserProjects } = await import('../lib/db.js');
        const projects = await getUserProjects(userId);
        let defaultProject = projects.find(p => p.name === 'Proyecto Principal');

        if (!defaultProject) {
          // Crear proyecto por defecto
          console.log('  📁 Creando proyecto "Proyecto Principal"...');
          defaultProject = await createProject(userId, {
            name: 'Proyecto Principal',
            description: 'Proyecto creado automáticamente durante la migración',
            isPersonal: true,
            color: '#3B82F6',
            icon: '📁',
          });
          console.log(`  ✅ Proyecto creado: ${defaultProject.id}`);
        } else {
          console.log(`  📁 Proyecto existente encontrado: ${defaultProject.id}`);
        }

        // Obtener flujos del usuario
        const flows = await getUserFlows(userId);
        console.log(`  📊 Encontrados ${flows.length} flujo(s)`);

        // Obtener flujos ya migrados del proyecto
        const { getProjectFlows } = await import('../lib/db.js');
        const existingProjectFlows = await getProjectFlows(defaultProject.id);
        const existingFlowIds = new Set(existingProjectFlows.map(f => f.id));

        // Migrar flujos que aún no están en el proyecto
        let migratedCount = 0;
        for (const flow of flows) {
          if (!existingFlowIds.has(flow.id)) {
            await saveFlowInProject(defaultProject.id, flow);
            migratedCount++;
            console.log(`    ✅ Migrado: ${flow.name} (${flow.id})`);
          } else {
            console.log(`    ⏭️  Ya existe: ${flow.name} (${flow.id})`);
          }
        }

        console.log(`  ✅ Migración completada: ${migratedCount} flujo(s) migrado(s)`);
      } catch (error) {
        console.error(`  ❌ Error procesando usuario ${userId}:`, error.message);
      }
    }

    console.log('\n✅ Migración completada exitosamente!');
  } catch (error) {
    console.error('\n❌ Error durante la migración:', error);
    process.exit(1);
  }
}

// Ejecutar migración
migrateFlowsToProjects()
  .then(() => {
    console.log('\n🎉 Proceso finalizado.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Error fatal:', error);
    process.exit(1);
  });

