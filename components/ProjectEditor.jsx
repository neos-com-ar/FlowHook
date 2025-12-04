'use client';

import { useState, useEffect } from 'react';
import {
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
  ArrowLeft,
} from 'lucide-react';

const COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Orange
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

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

// Lista de nombres de iconos (mantiene compatibilidad con el almacenamiento)
const ICONS = [
  'Folder', 'BarChart3', 'Link', 'Rocket', 'Zap', 'Target', 'Lightbulb', 'Settings',
  'Smartphone', 'Globe', 'TrendingUp', 'Palette', 'Lock', 'FileText', 'PartyPopper', 'Star',
];

export default function ProjectEditor({ project, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isPersonal: true,
    color: '#3B82F6',
    icon: 'Folder',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || '',
        description: project.description || '',
        isPersonal: project.isPersonal !== undefined ? project.isPersonal : true,
        color: project.color || '#3B82F6',
        icon: project.icon || 'Folder',
      });
    }
  }, [project]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = project ? '/api/projects' : '/api/projects';
      const method = project ? 'PUT' : 'POST';

      const body = project
        ? {
            projectId: project.id,
            ...formData,
          }
        : formData;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        onSave();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Error al guardar el proyecto'}`);
      }
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Error al guardar el proyecto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={onCancel}
        className="mb-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Volver</span>
      </button>
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {project ? 'Editar Proyecto' : 'Nuevo Proyecto'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del Proyecto *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              maxLength={100}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="ej: Integración ERP"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Descripción del proyecto..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Icono
            </label>
            <div className="grid grid-cols-8 gap-2">
              {ICONS.map((iconName) => {
                const IconComponent = ICON_COMPONENTS[iconName];
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, icon: iconName }))}
                    className={`p-3 rounded-md border-2 transition-colors flex items-center justify-center ${
                      formData.icon === iconName
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {IconComponent && <IconComponent className="w-5 h-5" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color
            </label>
            <div className="flex space-x-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, color }))}
                  className={`w-10 h-10 rounded-full border-2 transition-all ${
                    formData.color === color
                      ? 'border-gray-800 scale-110'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <input
              type="text"
              value={formData.color}
              onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
              className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
              placeholder="#3B82F6"
              pattern="^#[0-9A-Fa-f]{6}$"
            />
          </div>

          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                name="isPersonal"
                checked={formData.isPersonal}
                onChange={handleInputChange}
                className="rounded"
              />
              <span className="text-sm text-gray-700">
                Proyecto personal (no compartido)
              </span>
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Los proyectos compartidos pueden tener múltiples colaboradores
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Guardando...' : project ? 'Actualizar' : 'Crear Proyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

