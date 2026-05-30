'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft,
  Package,
  Users,
  Pencil,
  Trash2,
  FolderOpen,
  Folder,
  BarChart3,
  Link,
  Rocket,
  Zap,
  Target,
  Lightbulb,
  Settings,
  Smartphone,
  Globe,
  TrendingUp,
  Palette,
  Lock,
  FileText,
  PartyPopper,
  Star,
} from 'lucide-react';
import ProjectEditor from './ProjectEditor';
import ProjectPermissions from './ProjectPermissions';
import FlowList from './FlowList';
import { useWorkspace } from '@/contexts/WorkspaceContext';

// Mapeo de nombres de iconos a componentes
const ICON_COMPONENTS = {
  Folder,
  BarChart3,
  Link,
  Rocket,
  Zap,
  Target,
  Lightbulb,
  Settings,
  Smartphone,
  Globe,
  TrendingUp,
  Palette,
  Lock,
  FileText,
  PartyPopper,
  Star,
};

// Helper para renderizar el icono del proyecto (soporta tanto nombres de iconos como emojis antiguos)
const ProjectIcon = ({ iconName, className = "w-8 h-8" }) => {
  // Si es un emoji antiguo, renderizarlo como texto
  if (!iconName || /[\u{1F300}-\u{1F9FF}]/u.test(iconName)) {
    const sizeClass = className.includes('w-8') ? 'text-3xl' : className.includes('w-6') ? 'text-2xl' : 'text-xl';
    return <span className={sizeClass}>{iconName || '📁'}</span>;
  }
  // Si es un nombre de icono, usar el componente Lucide
  const IconComponent = ICON_COMPONENTS[iconName] || Folder;
  return <IconComponent className={className} />;
};

// Función helper para convertir color hex a rgba con opacidad
const hexToRgba = (hex, opacity) => {
  if (!hex || !hex.match(/^#[0-9A-Fa-f]{6}$/)) {
    // Si el color no es válido, usar un color por defecto (azul)
    hex = '#3B82F6';
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

export default function ProjectList() {
  const { data: session } = useSession();
  const { activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingProject, setEditingProject] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [permissionsProjectId, setPermissionsProjectId] = useState(null);
  const [orphanFlows, setOrphanFlows] = useState([]);
  const [showOrphanFlows, setShowOrphanFlows] = useState(false);

  useEffect(() => {
    if (session && activeWorkspace) {
      fetchProjects();
      fetchOrphanFlows();
    }
  }, [session, activeWorkspace?.id]);

  const fetchProjects = async () => {
    if (!activeWorkspace?.id) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/projects?workspaceId=${activeWorkspace.id}`);
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      } else {
        console.error('Error fetching projects');
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrphanFlows = async () => {
    try {
      const response = await fetch('/api/flows');
      if (response.ok) {
        const data = await response.json();
        // Filtrar flujos sin projectId
        const orphan = (data.flows || []).filter(f => !f.projectId);
        setOrphanFlows(orphan);
      }
    } catch (error) {
      console.error('Error fetching orphan flows:', error);
    }
  };

  const handleNewProject = () => {
    setEditingProject(null);
    setShowEditor(true);
  };

  const handleEditProject = (project) => {
    setEditingProject(project);
    setShowEditor(true);
  };

  const handleDeleteProject = async (projectId) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este proyecto? Todos los flujos del proyecto también se eliminarán.')) {
      return;
    }

    try {
      const response = await fetch(`/api/projects?projectId=${projectId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setProjects(projects.filter(p => p.id !== projectId));
        if (selectedProject?.id === projectId) {
          setSelectedProject(null);
        }
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Error al eliminar el proyecto'}`);
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Error al eliminar el proyecto');
    }
  };

  const handleSave = () => {
    setShowEditor(false);
    setEditingProject(null);
    fetchProjects();
  };

  const handleOpenPermissions = (projectId) => {
    setPermissionsProjectId(projectId);
    setShowPermissions(true);
  };

  const handleClosePermissions = () => {
    setShowPermissions(false);
    setPermissionsProjectId(null);
  };

  if (loading || workspaceLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-500">Cargando proyectos...</div>
      </div>
    );
  }

  if (showEditor) {
    return (
      <ProjectEditor
        project={editingProject}
        workspaceId={activeWorkspace?.id}
        onSave={handleSave}
        onCancel={() => {
          setShowEditor(false);
          setEditingProject(null);
        }}
      />
    );
  }

  if (showPermissions && permissionsProjectId) {
    return (
      <ProjectPermissions
        projectId={permissionsProjectId}
        onClose={handleClosePermissions}
      />
    );
  }

  if (showOrphanFlows) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => setShowOrphanFlows(false)}
          className="mb-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors inline-flex items-center gap-1 font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a proyectos</span>
        </button>
        <div className="mb-6">
          <div className="flex items-center space-x-2">
            <Package className="w-6 h-6" />
            <h1 className="text-2xl font-bold text-gray-900">Flujos sin Proyecto</h1>
          </div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
          <p className="text-sm text-yellow-800">
            <strong>⚠️ Nota:</strong> Estos flujos no pertenecen a ningún proyecto. 
            Te recomendamos migrarlos a un proyecto para mejor organización.
          </p>
        </div>
        <FlowList projectId={null} />
      </div>
    );
  }

  if (selectedProject) {
    const projectColor = selectedProject.color || '#3B82F6';
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => setSelectedProject(null)}
          className="mb-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a proyectos</span>
        </button>
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ProjectIcon iconName={selectedProject.icon} className="w-6 h-6" />
              <h1 className="text-2xl font-bold text-gray-900">{selectedProject.name}</h1>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleOpenPermissions(selectedProject.id)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors inline-flex items-center gap-2 font-medium"
              >
                <Users className="w-4 h-4" />
                <span>Permisos</span>
              </button>
              <button
                onClick={() => handleEditProject(selectedProject)}
                className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 transition-colors inline-flex items-center gap-2 font-medium"
              >
                <Pencil className="w-4 h-4" />
                <span>Editar</span>
              </button>
            </div>
          </div>
        </div>
        {selectedProject.description && (
          <p className="text-gray-600 mb-4">{selectedProject.description}</p>
        )}
        <FlowList
          projectId={selectedProject.id}
          projectColor={projectColor}
          workspaceId={selectedProject.workspaceId || activeWorkspace?.id}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Proyectos</h1>
          {activeWorkspace && (
            <p className="text-sm text-gray-500 mt-1">{activeWorkspace.name}</p>
          )}
        </div>
        <button
          onClick={handleNewProject}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors font-medium"
        >
          + Nuevo Proyecto
        </button>
      </div>

      {orphanFlows.length > 0 && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-yellow-900 mb-1 flex items-center gap-2">
                <Package className="w-5 h-5" />
                <span>Flujos sin Proyecto ({orphanFlows.length})</span>
              </h3>
              <p className="text-sm text-yellow-700">
                Tienes {orphanFlows.length} flujo(s) que no pertenecen a ningún proyecto.
              </p>
            </div>
            <button
              onClick={() => setShowOrphanFlows(true)}
              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors font-medium"
            >
              Ver Flujos
            </button>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-gray-500 mb-4">No tienes proyectos configurados aún.</p>
          <button
            onClick={handleNewProject}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors font-medium"
          >
            Crear tu primer proyecto
          </button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const isPersonal = project.isPersonal !== false;
            const projectColor = project.color || '#3B82F6';
            const backgroundColor = hexToRgba(projectColor, 0.1);
            return (
              <div
                key={project.id}
                className="rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow cursor-pointer"
                style={{ backgroundColor: backgroundColor }}
                onClick={() => setSelectedProject(project)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center space-x-3">
                    <ProjectIcon iconName={project.icon} className="w-8 h-8" />
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">{project.name}</h2>
                      {!isPersonal && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          Compartido
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: project.color || '#3B82F6' }}
                    title={`Color: ${project.color}`}
                  />
                </div>

                {project.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {project.description}
                  </p>
                )}

                <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                  <span>Creado: {new Date(project.createdAt).toLocaleDateString()}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-4 border-t border-gray-200">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedProject(project);
                    }}
                    className="w-full px-3 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors inline-flex items-center justify-center gap-1"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>Abrir</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenPermissions(project.id);
                    }}
                    className="w-full px-3 py-2 text-sm bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100 transition-colors inline-flex items-center justify-center gap-1"
                    title="Gestionar permisos"
                  >
                    <Users className="w-4 h-4" />
                    <span>Permisos</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditProject(project);
                    }}
                    className="w-full px-3 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors inline-flex items-center justify-center gap-1"
                    title="Editar proyecto"
                  >
                    <Pencil className="w-4 h-4" />
                    <span>Editar</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(project.id);
                    }}
                    className="w-full px-3 py-2 text-sm bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors inline-flex items-center justify-center gap-1"
                    title="Eliminar proyecto"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

