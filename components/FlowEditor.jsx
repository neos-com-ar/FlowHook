'use client';

import { useState, useEffect } from 'react';

// Constantes para evitar problemas con llaves en JSX
const TEMPLATE_PLACEHOLDER = '{{ruta}}';
const TEMPLATE_PLACEHOLDER_QUOTED = `"${TEMPLATE_PLACEHOLDER}"`;

export default function FlowEditor({ flow, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    destino: '',
    method: 'POST',
    map: {},
  });
  const [mappingEntries, setMappingEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [loadingExamples, setLoadingExamples] = useState(false);
  const [sourceExample, setSourceExample] = useState('');
  const [destinationExample, setDestinationExample] = useState('');
  const [showMappingModal, setShowMappingModal] = useState(null); // {index, sourceKey}
  const [mappingPairs, setMappingPairs] = useState([{ key: '', value: '' }]); // Para el modal de mapeo
  const [showLiteralModal, setShowLiteralModal] = useState(null); // {index}
  const [literalType, setLiteralType] = useState('string'); // string, number, boolean, null, object, array
  const [literalValue, setLiteralValue] = useState(''); // Para valores simples
  const [literalObjectValue, setLiteralObjectValue] = useState('{}'); // Para objetos JSON
  const [literalArrayValue, setLiteralArrayValue] = useState('[]'); // Para arrays JSON
  const [useTemplate, setUseTemplate] = useState(false); // Si usa templates {{ruta}}

  useEffect(() => {
    if (flow) {
      setFormData({
        id: flow.id || '',
        name: flow.name || '',
        destino: flow.destino || '',
        method: flow.method || 'POST',
        map: flow.map || {},
      });
      setMappingEntries(
        Object.entries(flow.map || {}).map(([dest, src]) => ({
          dest,
          src,
        }))
      );
    }
  }, [flow]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleMappingChange = (index, field, value) => {
    const newEntries = [...mappingEntries];
    newEntries[index] = {
      ...newEntries[index],
      [field]: value,
    };
    setMappingEntries(newEntries);
  };

  const addMappingEntry = () => {
    setMappingEntries([...mappingEntries, { dest: '', src: '' }]);
  };

  const removeMappingEntry = (index) => {
    setMappingEntries(mappingEntries.filter((_, i) => i !== index));
  };

  const handleOpenMappingModal = (index, currentSourceKey) => {
    // Si ya tiene un mapeo, extraer los pares
    if (currentSourceKey && currentSourceKey.includes('::map{') && currentSourceKey.endsWith('}')) {
      const mapMatch = currentSourceKey.match(/::map\{([^}]+)\}$/);
      if (mapMatch) {
        const mapString = mapMatch[1];
        const baseKey = currentSourceKey.replace(/::map\{[^}]+\}$/, '');
        const pairs = [];
        mapString.split(',').forEach(pair => {
          const [key, val] = pair.split(':').map(s => s.trim());
          if (key && val) {
            pairs.push({ key, value: val });
          }
        });
        if (pairs.length > 0) {
          setMappingPairs(pairs);
        } else {
          setMappingPairs([{ key: '', value: '' }]);
        }
        setShowMappingModal({ index, baseKey });
      } else {
        // Extraer solo la clave base si no hay mapeo
        const baseKey = currentSourceKey.replace(/::(map|number|int).*$/, '') || currentSourceKey;
        setMappingPairs([{ key: '', value: '' }]);
        setShowMappingModal({ index, baseKey: baseKey || '' });
      }
    } else {
      // Extraer la clave base si tiene ::number o ::int
      const baseKey = currentSourceKey ? currentSourceKey.replace(/::(number|int).*$/, '') : '';
      setMappingPairs([{ key: '', value: '' }]);
      setShowMappingModal({ index, baseKey: baseKey || '' });
    }
  };

  const handleCloseMappingModal = () => {
    setShowMappingModal(null);
    setMappingPairs([{ key: '', value: '' }]);
  };

  const handleAddMappingPair = () => {
    setMappingPairs([...mappingPairs, { key: '', value: '' }]);
  };

  const handleRemoveMappingPair = (pairIndex) => {
    if (mappingPairs.length > 1) {
      setMappingPairs(mappingPairs.filter((_, i) => i !== pairIndex));
    }
  };

  const handleMappingPairChange = (pairIndex, field, value) => {
    const newPairs = [...mappingPairs];
    newPairs[pairIndex] = {
      ...newPairs[pairIndex],
      [field]: value,
    };
    setMappingPairs(newPairs);
  };

  const handleSaveMapping = () => {
    if (!showMappingModal) return;

    const { index, baseKey } = showMappingModal;
    
    // Filtrar pares vacíos
    const validPairs = mappingPairs.filter(pair => pair.key.trim() && pair.value.trim());
    
    if (validPairs.length === 0) {
      // Si no hay pares válidos, usar solo la clave base
      handleMappingChange(index, 'src', baseKey);
    } else {
      // Construir el string de mapeo
      const mapString = validPairs.map(pair => `${pair.key.trim()}:${pair.value.trim()}`).join(',');
      const finalSourceKey = `${baseKey}::map{${mapString}}`;
      handleMappingChange(index, 'src', finalSourceKey);
    }
    
    handleCloseMappingModal();
  };

  const handleOpenLiteralModal = (index, currentSourceKey) => {
    // Si ya tiene un literal, intentar extraerlo
    if (currentSourceKey && currentSourceKey.startsWith('literal:')) {
      const literalContent = currentSourceKey.substring(8).trim();
      
      // Intentar determinar el tipo
      if (literalContent === 'true' || literalContent === 'false') {
        setLiteralType('boolean');
        setLiteralValue(literalContent);
      } else if (literalContent === 'null') {
        setLiteralType('null');
        setLiteralValue('');
      } else if (literalContent.startsWith('{') && literalContent.endsWith('}')) {
        setLiteralType('object');
        setLiteralObjectValue(literalContent);
        setUseTemplate(literalContent.includes('{{'));
      } else if (literalContent.startsWith('[') && literalContent.endsWith(']')) {
        setLiteralType('array');
        setLiteralArrayValue(literalContent);
        setUseTemplate(literalContent.includes('{{'));
      } else if (!isNaN(literalContent) && literalContent.trim() !== '') {
        setLiteralType('number');
        setLiteralValue(literalContent);
      } else {
        setLiteralType('string');
        // Remover comillas si las tiene (pueden ser simples o dobles)
        const cleanedValue = literalContent.replace(/^["']|["']$/g, '');
        setLiteralValue(cleanedValue);
      }
    } else {
      // Valores por defecto
      setLiteralType('string');
      setLiteralValue('');
      setLiteralObjectValue('{}');
      setLiteralArrayValue('[]');
      setUseTemplate(false);
    }
    
    setShowLiteralModal(index);
  };

  const handleCloseLiteralModal = () => {
    setShowLiteralModal(null);
    setLiteralType('string');
    setLiteralValue('');
    setLiteralObjectValue('{}');
    setLiteralArrayValue('[]');
    setUseTemplate(false);
  };

  const handleSaveLiteral = () => {
    if (showLiteralModal === null) return;

    let finalValue = '';
    
    switch (literalType) {
      case 'string':
        // Agregar comillas para strings
        finalValue = `"${literalValue}"`;
        break;
      case 'number':
        finalValue = literalValue.trim();
        break;
      case 'boolean':
        finalValue = literalValue === 'true' ? 'true' : 'false';
        break;
      case 'null':
        finalValue = 'null';
        break;
      case 'object':
        finalValue = literalObjectValue.trim();
        break;
      case 'array':
        finalValue = literalArrayValue.trim();
        break;
      default:
        finalValue = literalValue;
    }
    
    // Construir el literal completo
    const literalString = `literal:${finalValue}`;
    handleMappingChange(showLiteralModal, 'src', literalString);
    
    handleCloseLiteralModal();
  };

  const getLiteralPreview = () => {
    let value = '';
    switch (literalType) {
      case 'string':
        // Agregar comillas para strings en la vista previa
        value = `"${literalValue}"`;
        break;
      case 'number':
        value = literalValue.trim();
        break;
      case 'boolean':
        value = literalValue === 'true' ? 'true' : 'false';
        break;
      case 'null':
        value = 'null';
        break;
      case 'object':
        value = literalObjectValue.trim();
        break;
      case 'array':
        value = literalArrayValue.trim();
        break;
    }
    return `literal:${value}`;
  };

  const loadExamplesAutomatically = async () => {
    setLoadingExamples(true);
    
    try {
      // 1. Obtener ejemplo de origen desde el historial de webhooks
      if (flow?.id) {
        try {
          const webhooksResponse = await fetch(`/api/webhooks?flowId=${flow.id}&limit=1`);
          if (webhooksResponse.ok) {
            const webhooksData = await webhooksResponse.json();
            if (webhooksData.webhooks && webhooksData.webhooks.length > 0) {
              const latestWebhook = webhooksData.webhooks[0];
              if (latestWebhook.incomingData) {
                setSourceExample(JSON.stringify(latestWebhook.incomingData, null, 2));
              }
            }
          }
        } catch (error) {
          console.error('Error obteniendo ejemplo de origen:', error);
        }
      }

      // 2. Intentar obtener estructura del destino desde la URL
      if (formData.destino) {
        try {
          const destResponse = await fetch('/api/ai/map-fields', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sourceExample: '{}', // Solo necesitamos obtener el destino
              destinationUrl: formData.destino,
              getDestinationOnly: true,
            }),
          });

          if (destResponse.ok) {
            const destData = await destResponse.json();
            if (destData.destinationExample) {
              setDestinationExample(JSON.stringify(destData.destinationExample, null, 2));
            }
          }
        } catch (error) {
          console.error('Error obteniendo estructura del destino:', error);
        }
      }
    } finally {
      setLoadingExamples(false);
    }
  };

  const handleOpenAIModal = () => {
    setShowAIModal(true);
    // Cargar ejemplos automáticamente cuando se abre el modal
    loadExamplesAutomatically();
  };

  const handleAIMapping = async () => {
    if (!sourceExample.trim()) {
      alert('Por favor, ingresa un ejemplo de webhook de origen');
      return;
    }

    setAiLoading(true);
    try {
      const response = await fetch('/api/ai/map-fields', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceExample,
          destinationUrl: formData.destino || null,
          destinationExample: destinationExample.trim() || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al generar mapeo inteligente');
      }

      const data = await response.json();
      
      if (data.mappings && data.mappings.length > 0) {
        // Convertir los mapeos al formato de mappingEntries
        const newMappings = data.mappings.map(m => ({
          src: m.src,
          dest: m.dest,
          confidence: m.confidence,
        }));
        
        // Agregar los nuevos mapeos a los existentes (sin duplicados)
        const existingDests = new Set(mappingEntries.map(e => e.dest));
        const filteredMappings = newMappings.filter(m => !existingDests.has(m.dest));
        
        setMappingEntries([...mappingEntries, ...filteredMappings]);
        setShowAIModal(false);
        setSourceExample('');
        setDestinationExample('');
        alert(`Se generaron ${filteredMappings.length} mapeos inteligentes`);
      } else {
        alert('No se pudieron generar mapeos automáticos. Intenta con ejemplos más detallados.');
      }
    } catch (error) {
      console.error('Error en mapeo inteligente:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Construir el objeto de mapeo
    const map = {};
    mappingEntries.forEach((entry) => {
      if (entry.dest && entry.src) {
        map[entry.dest] = entry.src;
      }
    });

    const flowData = {
      ...formData,
      map,
    };

    try {
      const response = await fetch('/api/flows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(flowData),
      });

      if (response.ok) {
        onSave();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Error al guardar el flujo'}`);
      }
    } catch (error) {
      console.error('Error saving flow:', error);
      alert('Error al guardar el flujo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {flow ? 'Editar Flujo' : 'Nuevo Flujo'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="id" className="block text-sm font-medium text-gray-700 mb-1">
              ID del Flujo *
            </label>
            <input
              type="text"
              id="id"
              name="id"
              value={formData.id}
              onChange={handleInputChange}
              required
              disabled={!!flow}
              className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                flow ? 'bg-gray-100 cursor-not-allowed' : ''
              }`}
              placeholder="ej: erp-client"
            />
            <p className="mt-1 text-xs text-gray-500">
              Solo letras, números, guiones y guiones bajos. No se puede cambiar después de crear.
            </p>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre Descriptivo *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="ej: Alta cliente ERP"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-3">
              <label htmlFor="destino" className="block text-sm font-medium text-gray-700 mb-1">
                URL Destino *
              </label>
              <input
                type="url"
                id="destino"
                name="destino"
                value={formData.destino}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="https://api.crm.com/clientes"
              />
            </div>
            <div>
              <label htmlFor="method" className="block text-sm font-medium text-gray-700 mb-1">
                Método HTTP *
              </label>
              <select
                id="method"
                name="method"
                value={formData.method}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Mapeo de Datos
              </label>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={handleOpenAIModal}
                  className="flex items-center space-x-1 text-sm bg-purple-100 text-purple-700 px-3 py-1.5 rounded-md hover:bg-purple-200 transition-colors"
                  title="Mapeo inteligente con IA"
                >
                  <span>🤖</span>
                  <span>Mapeo IA</span>
                </button>
                <button
                  type="button"
                  onClick={addMappingEntry}
                  className="text-sm text-indigo-600 hover:text-indigo-700"
                >
                  + Agregar Campo
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Define cómo se mapean los campos del webhook entrante a los campos del destino. 
              Para valores fijos, usa <code className="bg-gray-100 px-1 rounded">literal:valor</code>.
              Para mapear valores (ej: "OBR"→1), usa <code className="bg-gray-100 px-1 rounded text-xs">data.campo::map{'{'}OBR:1,PRO:2{'}'}</code>.
              Para convertir a número, usa <code className="bg-gray-100 px-1 rounded">::number</code> o <code className="bg-gray-100 px-1 rounded">::int</code>.
            </p>

            {mappingEntries.length === 0 ? (
              <div className="text-center py-4 border-2 border-dashed border-gray-300 rounded-md">
                <p className="text-gray-500 text-sm">No hay campos de mapeo configurados</p>
                <button
                  type="button"
                  onClick={addMappingEntry}
                  className="mt-2 text-sm text-indigo-600 hover:text-indigo-700"
                >
                  Agregar el primer campo
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {mappingEntries.map((entry, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={entry.src}
                          onChange={(e) => handleMappingChange(index, 'src', e.target.value)}
                          placeholder='data.nombre o data.categoria::map{OBR:1} o literal:valor'
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono text-xs"
                          title='Campo del webhook. Usa ::map{key:val} para mapear valores. Usa ::number para convertir a número. Usa literal:valor para valores fijos.'
                        />
                        <button
                          type="button"
                          onClick={() => handleOpenMappingModal(index, entry.src)}
                          className="px-2 py-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
                          title="Configurar mapeo de valores"
                        >
                          🔗
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenLiteralModal(index, entry.src)}
                          className="px-2 py-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-md transition-colors"
                          title="Configurar valor literal"
                        >
                          ✏️
                        </button>
                      </div>
                    </div>
                    <div className="text-gray-500">→</div>
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={entry.dest}
                        onChange={(e) => handleMappingChange(index, 'dest', e.target.value)}
                        placeholder="Campo destino (ej: nombre)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                      {entry.confidence && (
                        <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded" title={`Confianza: ${entry.confidence}%`}>
                          {entry.confidence}%
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMappingEntry(index)}
                      className="px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal de mapeo de valores */}
          {showMappingModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900">
                    🔗 Configurar Mapeo de Valores
                  </h3>
                  <button
                    type="button"
                    onClick={handleCloseMappingModal}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Campo base del webhook
                    </label>
                    <input
                      type="text"
                      value={showMappingModal.baseKey}
                      onChange={(e) => setShowMappingModal({ ...showMappingModal, baseKey: e.target.value })}
                      placeholder="ej: data.categoria"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Campo del webhook que contiene el valor a mapear (ej: data.categoria)
                    </p>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Mapeo de valores
                      </label>
                      <button
                        type="button"
                        onClick={handleAddMappingPair}
                        className="text-sm text-indigo-600 hover:text-indigo-700"
                      >
                        + Agregar par
                      </button>
                    </div>
                    <div className="space-y-2">
                      {mappingPairs.map((pair, pairIndex) => (
                        <div key={pairIndex} className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={pair.key}
                            onChange={(e) => handleMappingPairChange(pairIndex, 'key', e.target.value)}
                            placeholder="Valor origen (ej: OBR)"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          />
                          <span className="text-gray-500">→</span>
                          <input
                            type="text"
                            value={pair.value}
                            onChange={(e) => handleMappingPairChange(pairIndex, 'value', e.target.value)}
                            placeholder="Valor destino (ej: 1)"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveMappingPair(pairIndex)}
                            disabled={mappingPairs.length === 1}
                            className="px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Define cómo se mapean los valores del campo origen a valores numéricos. 
                      Ejemplo: Si el campo origen tiene "OBR", se enviará 1 al destino.
                    </p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <p className="text-xs text-blue-800">
                      <strong>Vista previa:</strong>{' '}
                      <code className="bg-blue-100 px-1 rounded">
                        {showMappingModal.baseKey || 'campo'}::map{'{'}
                        {mappingPairs.filter(p => p.key && p.value).map(p => `${p.key}:${p.value}`).join(',') || '...'}
                        {'}'}
                      </code>
                    </p>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleCloseMappingModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveMapping}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                  >
                    Guardar Mapeo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de valor literal */}
          {showLiteralModal !== null && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900">
                    ✏️ Configurar Valor Literal
                  </h3>
                  <button
                    type="button"
                    onClick={handleCloseLiteralModal}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo de valor
                    </label>
                    <select
                      value={literalType}
                      onChange={(e) => setLiteralType(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                    >
                      <option value="string">Texto (String)</option>
                      <option value="number">Número (Number)</option>
                      <option value="boolean">Booleano (true/false)</option>
                      <option value="null">Null</option>
                      <option value="object">Objeto JSON</option>
                      <option value="array">Array JSON</option>
                    </select>
                  </div>

                  {literalType === 'string' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Valor de texto
                      </label>
                      <input
                        type="text"
                        value={literalValue}
                        onChange={(e) => setLiteralValue(e.target.value)}
                        placeholder="Ingresa el texto"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        El texto se enviará como string al destino. Se agregarán comillas automáticamente.
                      </p>
                    </div>
                  )}

                  {literalType === 'number' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Valor numérico
                      </label>
                      <input
                        type="number"
                        value={literalValue}
                        onChange={(e) => setLiteralValue(e.target.value)}
                        placeholder="Ingresa un número"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        El número se enviará como valor numérico al destino
                      </p>
                    </div>
                  )}

                  {literalType === 'boolean' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Valor booleano
                      </label>
                      <select
                        value={literalValue}
                        onChange={(e) => setLiteralValue(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        Selecciona true o false
                      </p>
                    </div>
                  )}

                  {literalType === 'null' && (
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                      <p className="text-sm text-gray-700">
                        Se enviará el valor <code className="bg-gray-100 px-1 rounded">null</code> al destino
                      </p>
                    </div>
                  )}

                  {literalType === 'object' && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Objeto JSON
                        </label>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={useTemplate}
                            onChange={(e) => setUseTemplate(e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-xs text-gray-600">Usar templates {TEMPLATE_PLACEHOLDER}</span>
                        </label>
                      </div>
                      <textarea
                        value={literalObjectValue}
                        onChange={(e) => setLiteralObjectValue(e.target.value)}
                        placeholder='{"campo1": "valor1", "campo2": "valor2"}'
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                        rows={6}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        {useTemplate 
                          ? `Puedes usar ${TEMPLATE_PLACEHOLDER} para insertar valores del webhook (ej: {"nombre": "{{data.nombre}}"})`
                          : 'Ingresa un objeto JSON válido (ej: {"campo": "valor"})'}
                      </p>
                    </div>
                  )}

                  {literalType === 'array' && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Array JSON
                        </label>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={useTemplate}
                            onChange={(e) => setUseTemplate(e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-xs text-gray-600">Usar templates {TEMPLATE_PLACEHOLDER}</span>
                        </label>
                      </div>
                      <textarea
                        value={literalArrayValue}
                        onChange={(e) => setLiteralArrayValue(e.target.value)}
                        placeholder='[{"campo1": "valor1"}, {"campo2": "valor2"}]'
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                        rows={6}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        {useTemplate 
                          ? `Puedes usar ${TEMPLATE_PLACEHOLDER} para insertar valores del webhook (ej: [{"nombre": "{{data.nombre}}"}]`
                          : 'Ingresa un array JSON válido (ej: [{"campo": "valor"}])'}
                      </p>
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <p className="text-xs text-blue-800">
                      <strong>Vista previa:</strong>{' '}
                      <code className="bg-blue-100 px-1 rounded break-all">
                        {getLiteralPreview()}
                      </code>
                    </p>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleCloseLiteralModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveLiteral}
                    className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
                  >
                    Guardar Valor
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de IA */}
          {showAIModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900">
                    🤖 Mapeo Inteligente con IA
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAIModal(false);
                      setSourceExample('');
                      setDestinationExample('');
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  {loadingExamples && (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                      🔄 Obteniendo ejemplos automáticamente...
                    </div>
                  )}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Ejemplo de Webhook de Origen (JSON) *
                      </label>
                      {flow?.id && (
                        <button
                          type="button"
                          onClick={loadExamplesAutomatically}
                          disabled={loadingExamples}
                          className="text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50"
                        >
                          {loadingExamples ? 'Cargando...' : '🔄 Obtener del historial'}
                        </button>
                      )}
                    </div>
                    <textarea
                      value={sourceExample}
                      onChange={(e) => setSourceExample(e.target.value)}
                      placeholder='{"customer_name": "Juan Pérez", "customer_email": "juan@example.com", "phone": "123456789"}'
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                      rows={6}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {flow?.id 
                        ? 'Se intentará obtener automáticamente del historial de webhooks. Puedes editarlo manualmente.'
                        : 'Ingresa un ejemplo del JSON que recibirás en el webhook'}
                    </p>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Ejemplo de Respuesta del Destino (JSON) - Opcional
                      </label>
                      {formData.destino && (
                        <button
                          type="button"
                          onClick={async () => {
                            setLoadingExamples(true);
                            try {
                              const destResponse = await fetch('/api/ai/map-fields', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  sourceExample: '{}',
                                  destinationUrl: formData.destino,
                                  getDestinationOnly: true,
                                }),
                              });
                              if (destResponse.ok) {
                                const destData = await destResponse.json();
                                if (destData.destinationExample) {
                                  setDestinationExample(JSON.stringify(destData.destinationExample, null, 2));
                                }
                              }
                            } catch (error) {
                              console.error('Error obteniendo destino:', error);
                            } finally {
                              setLoadingExamples(false);
                            }
                          }}
                          disabled={loadingExamples}
                          className="text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50"
                        >
                          {loadingExamples ? 'Cargando...' : '🔄 Obtener de la API'}
                        </button>
                      )}
                    </div>
                    <textarea
                      value={destinationExample}
                      onChange={(e) => setDestinationExample(e.target.value)}
                      placeholder='{"nombre": "", "email": "", "telefono": ""}'
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                      rows={4}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Opcional: Se intentará obtener automáticamente de la URL destino. Puedes editarlo manualmente.
                    </p>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAIModal(false);
                        setSourceExample('');
                        setDestinationExample('');
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleAIMapping}
                      disabled={aiLoading || !sourceExample.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {aiLoading ? 'Generando mapeo...' : 'Generar Mapeo Inteligente'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

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
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

