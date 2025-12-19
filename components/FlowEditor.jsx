'use client';

import { useState, useEffect } from 'react';
import {
  Settings,
  Link as LinkIcon,
  X,
  Lightbulb,
  ArrowLeft,
  Bot,
  RefreshCw,
  GitBranch,
  Filter,
  Zap,
} from 'lucide-react';

// Constantes para evitar problemas con llaves en JSX
const TEMPLATE_PLACEHOLDER = '{{ruta}}';
const TEMPLATE_PLACEHOLDER_QUOTED = `"${TEMPLATE_PLACEHOLDER}"`;

export default function FlowEditor({ flow, projectId, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    destino: '',
    method: 'POST',
    map: {},
    erpEndpoints: null,
  });
  const [prevEndpoints, setPrevEndpoints] = useState([]); // Array de endpoints previos
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
  const [activeTab, setActiveTab] = useState('config'); // 'config', 'prev', 'conditions', 'mapping', 'actions'
  const [testingEndpoint, setTestingEndpoint] = useState(null); // {index, loading, result, error}
  const [testWebhookData, setTestWebhookData] = useState('{}'); // Datos de ejemplo para probar
  const [destinationHeaders, setDestinationHeaders] = useState([]); // Headers del destino
  const [conditions, setConditions] = useState([]); // Array de condiciones
  const [conditionFailureAction, setConditionFailureAction] = useState('error'); // 'error' o 'skip'
  const [postResponseActions, setPostResponseActions] = useState([]); // Array de acciones post-respuesta

  useEffect(() => {
    if (flow) {
      setFormData({
        id: flow.id || '',
        name: flow.name || '',
        destino: flow.destino || '',
        method: flow.method || 'POST',
        map: flow.map || {},
        erpEndpoint: flow.erpEndpoint || null,
      });
      setMappingEntries(
        Object.entries(flow.map || {}).map(([dest, src]) => ({
          dest,
          src,
        }))
      );
      
      // Configurar headers del destino si existen
      if (flow.headers && typeof flow.headers === 'object') {
        setDestinationHeaders(
          Object.entries(flow.headers).map(([key, value]) => ({
            key,
            value,
          }))
        );
      } else {
        setDestinationHeaders([]);
      }
      
      // Configurar endpoints previos si existen
      // Soporte para array (múltiples) o objeto único (retrocompatibilidad)
      let endpointsToLoad = [];
      if (flow.erpEndpoints && Array.isArray(flow.erpEndpoints)) {
        endpointsToLoad = flow.erpEndpoints;
      } else if (flow.erpEndpoint) {
        // Retrocompatibilidad: convertir objeto único a array
        endpointsToLoad = [flow.erpEndpoint];
      }
      
      if (endpointsToLoad.length > 0) {
        setPrevEndpoints(
          endpointsToLoad.map((endpoint) => ({
            name: endpoint.name || '',
            url: endpoint.url || '',
            method: endpoint.method || 'GET',
            required: endpoint.required || false,
            bodyMapEntries: Object.entries(endpoint.bodyMap || {}).map(([key, value]) => ({
              key,
              value,
            })),
            headerEntries: Object.entries(endpoint.headers || {}).map(([key, value]) => ({
              key,
              value,
            })),
          }))
        );
      }
      
      // Configurar condiciones si existen
      if (flow.conditions && Array.isArray(flow.conditions)) {
        setConditions(flow.conditions);
      } else {
        setConditions([]);
      }
      
      // Configurar acción cuando falla la condición
      if (flow.conditionFailureAction) {
        setConditionFailureAction(flow.conditionFailureAction);
      } else {
        setConditionFailureAction('error');
      }
      
      // Configurar acciones post-respuesta si existen
      if (flow.postResponseActions && Array.isArray(flow.postResponseActions)) {
        setPostResponseActions(
          flow.postResponseActions.map((action) => ({
            name: action.name || '',
            url: action.url || '',
            method: action.method || 'POST',
            onlyOnSuccess: action.onlyOnSuccess !== undefined ? action.onlyOnSuccess : true,
            required: action.required || false,
            bodyMapEntries: Object.entries(action.bodyMap || {}).map(([key, value]) => ({
              key,
              value,
            })),
            headerEntries: Object.entries(action.headers || {}).map(([key, value]) => ({
              key,
              value,
            })),
          }))
        );
      } else {
        setPostResponseActions([]);
      }
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

  // Funciones para manejar condiciones
  const addCondition = () => {
    setConditions([
      ...conditions,
      {
        field: '',
        operator: 'equals',
        value: '',
        logicalOperator: conditions.length > 0 ? 'AND' : undefined,
      },
    ]);
  };

  const updateCondition = (index, field, value) => {
    const newConditions = [...conditions];
    newConditions[index] = {
      ...newConditions[index],
      [field]: value,
    };
    setConditions(newConditions);
  };

  const removeCondition = (index) => {
    setConditions(conditions.filter((_, i) => i !== index));
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

  const handleTestEndpoint = async (endpointIndex) => {
    const endpoint = prevEndpoints[endpointIndex];
    
    if (!endpoint.url) {
      alert('Por favor, ingresa una URL para el endpoint');
      return;
    }

    setTestingEndpoint({ index: endpointIndex, loading: true, result: null, error: null });

    try {
      // Parsear los datos de ejemplo del webhook
      let webhookData = {};
      try {
        webhookData = JSON.parse(testWebhookData || '{}');
      } catch (e) {
        alert('Los datos de ejemplo del webhook no son JSON válido');
        setTestingEndpoint(null);
        return;
      }

      // Construir la URL con templates
      let testUrl = endpoint.url;
      testUrl = testUrl.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const keys = path.trim().split('.');
        let value = webhookData;
        for (const key of keys) {
          if (value === null || value === undefined) {
            return '';
          }
          value = value[key];
        }
        if (value === undefined || value === null) {
          return '';
        }
        return encodeURIComponent(String(value));
      });

      // Construir el body o query params según el método
      const method = (endpoint.method || 'GET').toUpperCase();
      let requestBody = {};
      let queryParams = {};

      if (endpoint.bodyMapEntries && endpoint.bodyMapEntries.length > 0) {
        // Si hay bodyMap, usar esos mapeos
        endpoint.bodyMapEntries.forEach((entry) => {
          if (entry.key && entry.value) {
            const keys = entry.value.split('.');
            let value = webhookData;
            for (const key of keys) {
              if (value === null || value === undefined) {
                return;
              }
              value = value[key];
            }
            if (value !== undefined) {
              if (['GET', 'DELETE'].includes(method)) {
                queryParams[entry.key] = value;
              } else {
                requestBody[entry.key] = value;
              }
            }
          }
        });
      } else if (!['GET', 'DELETE'].includes(method)) {
        // Si no hay bodyMap y es POST/PUT/PATCH, enviar todo el webhookData
        requestBody = webhookData;
      }

      // Construir headers
      const headers = {
        'Content-Type': 'application/json',
      };
      if (endpoint.headerEntries && endpoint.headerEntries.length > 0) {
        endpoint.headerEntries.forEach((entry) => {
          if (entry.key && entry.value) {
            headers[entry.key] = entry.value;
          }
        });
      }

      // Realizar la petición
      const axios = (await import('axios')).default;
      const response = await axios({
        method: method.toLowerCase(),
        url: testUrl,
        data: ['POST', 'PUT', 'PATCH'].includes(method) && Object.keys(requestBody).length > 0 ? requestBody : undefined,
        params: ['GET', 'DELETE'].includes(method) && Object.keys(queryParams).length > 0 ? queryParams : undefined,
        headers,
        timeout: 30000,
      });

      setTestingEndpoint({
        index: endpointIndex,
        loading: false,
        result: {
          status: response.status,
          data: response.data,
          headers: response.headers,
        },
        error: null,
      });
    } catch (error) {
      setTestingEndpoint({
        index: endpointIndex,
        loading: false,
        result: null,
        error: {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
        },
      });
    }
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

    // Construir los endpoints previos
    const prevEndpointsData = prevEndpoints
      .filter((endpoint) => endpoint.url) // Solo incluir endpoints con URL
      .map((endpoint) => {
        const bodyMap = {};
        endpoint.bodyMapEntries.forEach((entry) => {
          if (entry.key && entry.value) {
            bodyMap[entry.key] = entry.value;
          }
        });
        
        const headers = {};
        endpoint.headerEntries.forEach((entry) => {
          if (entry.key && entry.value) {
            headers[entry.key] = entry.value;
          }
        });
        
        return {
          name: endpoint.name || undefined,
          url: endpoint.url,
          method: endpoint.method,
          required: endpoint.required,
          bodyMap: Object.keys(bodyMap).length > 0 ? bodyMap : undefined,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        };
      });

    // Construir los headers del destino
    const destinationHeadersObj = {};
    destinationHeaders.forEach((entry) => {
      if (entry.key && entry.value) {
        destinationHeadersObj[entry.key] = entry.value;
      }
    });

    // Construir las condiciones (solo si tienen campo, operador y valor)
    const validConditions = conditions.filter(
      (condition) => condition.field && condition.operator && condition.value !== undefined && condition.value !== ''
    );

    // Construir las acciones post-respuesta
    const postResponseActionsData = postResponseActions
      .filter((action) => action.url) // Solo incluir acciones con URL
      .map((action) => {
        const bodyMap = {};
        action.bodyMapEntries.forEach((entry) => {
          if (entry.key && entry.value) {
            bodyMap[entry.key] = entry.value;
          }
        });
        
        const headers = {};
        action.headerEntries.forEach((entry) => {
          if (entry.key && entry.value) {
            headers[entry.key] = entry.value;
          }
        });
        
        return {
          name: action.name || undefined,
          url: action.url,
          method: action.method,
          onlyOnSuccess: action.onlyOnSuccess !== undefined ? action.onlyOnSuccess : true,
          required: action.required || false,
          bodyMap: Object.keys(bodyMap).length > 0 ? bodyMap : undefined,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        };
      });

    const flowData = {
      ...formData,
      map,
      headers: Object.keys(destinationHeadersObj).length > 0 ? destinationHeadersObj : undefined,
      erpEndpoints: prevEndpointsData.length > 0 ? prevEndpointsData : null,
      conditions: validConditions.length > 0 ? validConditions : undefined,
      conditionFailureAction: conditionFailureAction || 'error',
      postResponseActions: postResponseActionsData.length > 0 ? postResponseActionsData : null,
      projectId: projectId || flow?.projectId,
    };

    if (!flowData.projectId) {
      alert('Error: No se especificó el proyecto. Por favor, selecciona un proyecto.');
      return;
    }

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

  if (!projectId && !flow?.projectId) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={onCancel}
          className="mb-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver</span>
        </button>
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">Error: No se especificó el proyecto.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={onCancel}
        className="mb-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-1"
      >
        <span>←</span>
        <span>Volver</span>
      </button>
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {flow ? 'Editar Flujo' : 'Nuevo Flujo'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Pestañas */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              <button
                type="button"
                onClick={() => setActiveTab('config')}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                  ${
                    activeTab === 'config'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Settings className="w-4 h-4 mr-2" />
                Configuración General
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('prev')}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                  ${
                    activeTab === 'prev'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <LinkIcon className="w-4 h-4 mr-2" />
                Acciones Previas
                {prevEndpoints.length > 0 && (
                  <span className="ml-2 bg-indigo-100 text-indigo-600 py-0.5 px-2 rounded-full text-xs">
                    {prevEndpoints.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('conditions')}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                  ${
                    activeTab === 'conditions'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Filter className="w-4 h-4 mr-2" />
                Condiciones
                {conditions.length > 0 && (
                  <span className="ml-2 bg-indigo-100 text-indigo-600 py-0.5 px-2 rounded-full text-xs">
                    {conditions.filter(c => c.field && c.operator && c.value).length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('mapping')}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                  ${
                    activeTab === 'mapping'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <GitBranch className="w-4 h-4 mr-2" />
                Mapeo de Datos
                {mappingEntries.length > 0 && (
                  <span className="ml-2 bg-indigo-100 text-indigo-600 py-0.5 px-2 rounded-full text-xs">
                    {mappingEntries.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('actions')}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                  ${
                    activeTab === 'actions'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Zap className="w-4 h-4 mr-2" />
                Acciones
                {postResponseActions.length > 0 && (
                  <span className="ml-2 bg-indigo-100 text-indigo-600 py-0.5 px-2 rounded-full text-xs">
                    {postResponseActions.length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          {/* Contenido de las pestañas */}
          <div className="min-h-[400px]">
            {/* Pestaña: Configuración General */}
            {activeTab === 'config' && (
              <div className="space-y-6 transition-all duration-200">
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
                      placeholder="ej: cliente-api"
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
                      placeholder="ej: Alta cliente"
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

                {/* Headers del Destino */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Headers del Destino
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Configura headers personalizados que se enviarán en la llamada al destino (ej: X-Tenant-ID, Authorization, etc.)
                  </p>
                  {destinationHeaders.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDestinationHeaders([{ key: '', value: '' }]);
                      }}
                      className="text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      + Agregar Header
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {destinationHeaders.map((entry, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={entry.key}
                            onChange={(e) => {
                              const newHeaders = [...destinationHeaders];
                              newHeaders[index].key = e.target.value;
                              setDestinationHeaders(newHeaders);
                            }}
                            placeholder="Nombre del header (ej: X-Tenant-ID)"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          />
                          <span className="text-gray-500">:</span>
                          <input
                            type="text"
                            value={entry.value}
                            onChange={(e) => {
                              const newHeaders = [...destinationHeaders];
                              newHeaders[index].value = e.target.value;
                              setDestinationHeaders(newHeaders);
                            }}
                            placeholder="Valor (ej: pablobruno)"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setDestinationHeaders(destinationHeaders.filter((_, i) => i !== index));
                            }}
                            className="text-red-600 hover:text-red-700 px-2"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setDestinationHeaders([...destinationHeaders, { key: '', value: '' }]);
                        }}
                        className="text-sm text-indigo-600 hover:text-indigo-700"
                      >
                        + Agregar Header
                      </button>
                    </div>
                  )}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <Lightbulb className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">Información</h3>
                      <div className="mt-2 text-sm text-blue-700">
                        <p>
                          Configura los datos básicos del flujo. Puedes agregar llamadas previas a endpoints y 
                          configurar el mapeo de datos en las otras pestañas.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pestaña: Acciones Previas */}
            {activeTab === 'prev' && (
              <div className="space-y-6 transition-all duration-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Acciones Previas a Endpoints
                    </h3>
                    <p className="text-sm text-gray-500">
                      Configura una o más llamadas previas a endpoints para obtener datos (ej: idCliente, idItem) antes de enviar al destino.
                      Los datos obtenidos estarán disponibles como <code className="bg-gray-100 px-1 rounded text-xs">prev.nombreEndpoint.campo</code> en el mapeo.
                      Si no especificas un nombre, se usará <code className="bg-gray-100 px-1 rounded text-xs">endpoint1</code>, <code className="bg-gray-100 px-1 rounded text-xs">endpoint2</code>, etc.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPrevEndpoints([...prevEndpoints, {
                      name: '',
                      url: '',
                      method: 'GET',
                      required: false,
                      bodyMapEntries: [],
                      headerEntries: [],
                    }])}
                    className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors font-medium ml-4"
                  >
                    + Agregar Endpoint
                  </button>
                </div>
                
                {/* Panel de ayuda para acciones previas dinámicas */}
                <details className="mb-4 bg-blue-50 border border-blue-200 rounded-md p-3">
                  <summary className="text-sm font-medium text-blue-800 cursor-pointer hover:text-blue-900">
                    💡 ¿Cómo usar acciones previas dinámicas en arrays?
                  </summary>
                  <div className="mt-3 text-xs text-blue-700 space-y-3">
                    <div>
                          <p className="font-medium mb-2">Para obtener un campo de cada elemento de un array:</p>
                      <ol className="list-decimal list-inside space-y-2 ml-2">
                            <li>
                              <strong>Configura una acción previa:</strong>
                              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                                <li>Nombre: <code className="bg-blue-100 px-1 rounded">obtenerId</code></li>
                                <li>URL: <code className="bg-blue-100 px-1 rounded">https://api.ejemplo.com/items/{'{{'}codigo{'}}'}</code></li>
                                <li>Método: <code className="bg-blue-100 px-1 rounded">GET</code></li>
                              </ul>
                            </li>
                            <li>
                              <strong>En el mapeo del array literal, usa:</strong>
                              <pre className="bg-blue-100 p-2 rounded mt-1 text-xs overflow-x-auto">
{`literal:[
  {
    "idItem": prev.obtenerId({{data.data.items[0].codigo}}).id,
    "descripcion": "{{data.data.items[0].nombre}}",
    "cantidad": {{data.data.items[0].cantidad}}
  }
]`}
                              </pre>
                              <p className="text-xs text-blue-600 mt-1">
                                Nota: Usa <code className="bg-blue-200 px-1 rounded">.id</code> (o el campo que necesites) después del paréntesis para extraer ese campo específico de la respuesta.
                              </p>
                            </li>
                        <li>
                          <strong>El sistema automáticamente:</strong>
                          <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                            <li>Itera sobre cada elemento del array (ej: <code className="bg-blue-100 px-1 rounded">data.data.items</code>)</li>
                            <li>Ejecuta la acción previa con el código de producto de cada elemento</li>
                                <li>Obtiene el campo especificado (ej: <code className="bg-blue-100 px-1 rounded">.id</code>) de la respuesta</li>
                            <li>Cachea los resultados para evitar llamadas duplicadas</li>
                          </ul>
                        </li>
                      </ol>
                    </div>
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                          <p className="font-medium text-yellow-800 mb-1">⚠️ Importante:</p>
                          <ul className="list-disc list-inside text-yellow-700 space-y-1 text-xs">
                            <li>El endpoint debe retornar un objeto con los campos que necesites</li>
                            <li>En el mapeo, especifica el campo a extraer usando notación de punto (ej: <code className="bg-yellow-100 px-1 rounded">.id</code>, <code className="bg-yellow-100 px-1 rounded">.data.id</code>)</li>
                            <li>La URL debe usar <code className="bg-yellow-100 px-1 rounded">{'{{'}parametro{'}}'}</code> como placeholder (reemplaza "parametro" con el nombre que uses)</li>
                            <li>El nombre del endpoint debe coincidir exactamente con el usado en el mapeo</li>
                          </ul>
                        </div>
                  </div>
                </details>

                {prevEndpoints.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-md bg-gray-50">
                    <span className="text-4xl mb-4 block">🔗</span>
                    <p className="text-gray-500 text-sm mb-4">No hay llamadas previas configuradas</p>
                    <button
                      type="button"
                      onClick={() => setPrevEndpoints([...prevEndpoints, {
                        name: '',
                        url: '',
                        method: 'GET',
                        required: false,
                        bodyMapEntries: [],
                        headerEntries: [],
                      }])}
                      className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors font-medium"
                    >
                      + Agregar Primer Endpoint
                    </button>
                  </div>
                  ) : (
                  <div className="space-y-4">
                {prevEndpoints.map((endpoint, endpointIndex) => (
                  <div key={endpointIndex} className="bg-gray-50 p-4 rounded-md border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-medium text-gray-700">
                        Endpoint {endpointIndex + 1} {endpoint.name && `(${endpoint.name})`}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => handleTestEndpoint(endpointIndex)}
                          disabled={testingEndpoint?.index === endpointIndex && testingEndpoint?.loading}
                          className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {testingEndpoint?.index === endpointIndex && testingEndpoint?.loading ? 'Probando...' : '🧪 Probar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrevEndpoints(prevEndpoints.filter((_, i) => i !== endpointIndex))}
                          className="text-red-600 hover:text-red-700 text-sm"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nombre del Endpoint (opcional)
                          </label>
                          <input
                            type="text"
                            value={endpoint.name}
                            onChange={(e) => {
                              const newEndpoints = [...prevEndpoints];
                              newEndpoints[endpointIndex].name = e.target.value;
                              setPrevEndpoints(newEndpoints);
                            }}
                            placeholder="ej: clientes, productos, obtenerId"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            Si no especificas un nombre, se usará <code className="bg-gray-200 px-1 rounded">endpoint{endpointIndex + 1}</code>
                          </p>
                          <p className="mt-1 text-xs text-indigo-600">
                            💡 <strong>Para acciones dinámicas:</strong> Usa un nombre descriptivo (ej: <code className="bg-indigo-100 px-1 rounded">obtenerId</code>). 
                            Luego podrás usarlo en arrays como <code className="bg-indigo-100 px-1 rounded">prev.obtenerId({'{{'}valor{'}}'})</code>
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              URL del Endpoint *
                            </label>
                            <input
                              type="url"
                              value={endpoint.url}
                              onChange={(e) => {
                                const newEndpoints = [...prevEndpoints];
                                newEndpoints[endpointIndex].url = e.target.value;
                                setPrevEndpoints(newEndpoints);
                              }}
                              placeholder="https://api.ejemplo.com/clientes/buscar o https://api.ejemplo.com/clientes/{{email}}"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                              Usa <code className="bg-gray-200 px-1 rounded">{'{{campo}}'}</code> para inyectar valores del webhook en la URL
                            </p>
                            <p className="mt-1 text-xs text-indigo-600">
                              💡 <strong>Para acciones dinámicas en arrays:</strong> Usa un placeholder en la URL (ej: <code className="bg-indigo-100 px-1 rounded">{'{{'}parametro{'}}'}</code>). 
                              El valor se reemplazará automáticamente cuando se ejecute desde un array.
                            </p>
                            <p className="mt-1 text-xs text-gray-600">
                              <strong>Ejemplo:</strong> <code className="bg-gray-200 px-1 rounded">https://api.ejemplo.com/items/{'{{'}codigo{'}}'}</code>
                            </p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Método HTTP *
                            </label>
                            <select
                              value={endpoint.method}
                              onChange={(e) => {
                                const newEndpoints = [...prevEndpoints];
                                newEndpoints[endpointIndex].method = e.target.value;
                                setPrevEndpoints(newEndpoints);
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                            >
                              <option value="GET">GET</option>
                              <option value="POST">POST</option>
                              <option value="PUT">PUT</option>
                              <option value="PATCH">PATCH</option>
                              <option value="DELETE">DELETE</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={endpoint.required}
                            onChange={(e) => {
                              const newEndpoints = [...prevEndpoints];
                              newEndpoints[endpointIndex].required = e.target.checked;
                              setPrevEndpoints(newEndpoints);
                            }}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          />
                          <label className="text-sm text-gray-700 cursor-pointer">
                            Requerido (el flujo fallará si este endpoint no responde)
                          </label>
                        </div>

                        {/* Mapeo del Body para el Endpoint */}
                        {['POST', 'PUT', 'PATCH'].includes(endpoint.method) && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Mapeo del Body para el Endpoint
                            </label>
                            <p className="text-xs text-gray-500 mb-2">
                              Define qué campos del webhook se envían al endpoint. Si está vacío, se envía todo el body.
                            </p>
                            {endpoint.bodyMapEntries.length === 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const newEndpoints = [...prevEndpoints];
                                  newEndpoints[endpointIndex].bodyMapEntries.push({ key: '', value: '' });
                                  setPrevEndpoints(newEndpoints);
                                }}
                                className="text-sm text-indigo-600 hover:text-indigo-700"
                              >
                                + Agregar Campo
                              </button>
                            ) : (
                              <div className="space-y-2">
                                {endpoint.bodyMapEntries.map((entry, index) => (
                                  <div key={index} className="flex items-center space-x-2">
                                    <input
                                      type="text"
                                      value={entry.key}
                                      onChange={(e) => {
                                        const newEndpoints = [...prevEndpoints];
                                        newEndpoints[endpointIndex].bodyMapEntries[index].key = e.target.value;
                                        setPrevEndpoints(newEndpoints);
                                      }}
                                      placeholder="Campo en el endpoint"
                                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                    />
                                    <span className="text-gray-500">→</span>
                                    <input
                                      type="text"
                                      value={entry.value}
                                      onChange={(e) => {
                                        const newEndpoints = [...prevEndpoints];
                                        newEndpoints[endpointIndex].bodyMapEntries[index].value = e.target.value;
                                        setPrevEndpoints(newEndpoints);
                                      }}
                                      placeholder="Campo del webhook"
                                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newEndpoints = [...prevEndpoints];
                                        newEndpoints[endpointIndex].bodyMapEntries = newEndpoints[endpointIndex].bodyMapEntries.filter((_, i) => i !== index);
                                        setPrevEndpoints(newEndpoints);
                                      }}
                                      className="text-red-600 hover:text-red-700 px-2"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newEndpoints = [...prevEndpoints];
                                    newEndpoints[endpointIndex].bodyMapEntries.push({ key: '', value: '' });
                                    setPrevEndpoints(newEndpoints);
                                  }}
                                  className="text-sm text-indigo-600 hover:text-indigo-700"
                                >
                                  + Agregar Campo
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Headers del Endpoint */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Headers del Endpoint
                          </label>
                          {endpoint.headerEntries.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                const newEndpoints = [...prevEndpoints];
                                newEndpoints[endpointIndex].headerEntries.push({ key: '', value: '' });
                                setPrevEndpoints(newEndpoints);
                              }}
                              className="text-sm text-indigo-600 hover:text-indigo-700"
                            >
                              + Agregar Header
                            </button>
                          ) : (
                            <div className="space-y-2">
                              {endpoint.headerEntries.map((entry, index) => (
                                <div key={index} className="flex items-center space-x-2">
                                  <input
                                    type="text"
                                    value={entry.key}
                                    onChange={(e) => {
                                      const newEndpoints = [...prevEndpoints];
                                      newEndpoints[endpointIndex].headerEntries[index].key = e.target.value;
                                      setPrevEndpoints(newEndpoints);
                                    }}
                                    placeholder="Nombre del header (ej: Authorization)"
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                  />
                                  <span className="text-gray-500">:</span>
                                  <input
                                    type="text"
                                    value={entry.value}
                                    onChange={(e) => {
                                      const newEndpoints = [...prevEndpoints];
                                      newEndpoints[endpointIndex].headerEntries[index].value = e.target.value;
                                      setPrevEndpoints(newEndpoints);
                                    }}
                                    placeholder="Valor (ej: Bearer token123)"
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newEndpoints = [...prevEndpoints];
                                      newEndpoints[endpointIndex].headerEntries = newEndpoints[endpointIndex].headerEntries.filter((_, i) => i !== index);
                                      setPrevEndpoints(newEndpoints);
                                    }}
                                    className="text-red-600 hover:text-red-700 px-2"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const newEndpoints = [...prevEndpoints];
                                  newEndpoints[endpointIndex].headerEntries.push({ key: '', value: '' });
                                  setPrevEndpoints(newEndpoints);
                                }}
                                className="text-sm text-indigo-600 hover:text-indigo-700"
                              >
                                + Agregar Header
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Resultado de la prueba */}
                        {testingEndpoint?.index === endpointIndex && (
                          <div className="mt-4 border-t border-gray-300 pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-medium text-gray-700">Resultado de la Prueba</h4>
                              <button
                                type="button"
                                onClick={() => setTestingEndpoint(null)}
                                className="text-gray-500 hover:text-gray-700 text-sm"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            
                            {testingEndpoint.loading ? (
                              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                                <RefreshCw className="w-4 h-4 mr-1 inline animate-spin" />
                                Probando endpoint...
                              </div>
                            ) : testingEndpoint.error ? (
                              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                                <div className="text-sm font-medium text-red-800 mb-2">❌ Error</div>
                                <div className="text-xs text-red-700 space-y-1">
                                  <div><strong>Mensaje:</strong> {testingEndpoint.error.message}</div>
                                  {testingEndpoint.error.status && (
                                    <div><strong>Status:</strong> {testingEndpoint.error.status}</div>
                                  )}
                                  {testingEndpoint.error.data && (
                                    <div className="mt-2">
                                      <strong>Respuesta:</strong>
                                      <pre className="mt-1 bg-red-100 p-2 rounded text-xs overflow-auto max-h-40">
                                        {typeof testingEndpoint.error.data === 'string' 
                                          ? testingEndpoint.error.data 
                                          : JSON.stringify(testingEndpoint.error.data, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : testingEndpoint.result ? (
                              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                                <div className="text-sm font-medium text-green-800 mb-2">✅ Éxito</div>
                                <div className="text-xs text-green-700 space-y-2">
                                  <div><strong>Status:</strong> {testingEndpoint.result.status}</div>
                                  <div>
                                    <strong>Respuesta:</strong>
                                    <pre className="mt-1 bg-green-100 p-2 rounded text-xs overflow-auto max-h-60">
                                      {JSON.stringify(testingEndpoint.result.data, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )}
                    </div>
                  </div>
                  ))}
                </div>
                )}

                {/* Datos de ejemplo para probar endpoints */}
                {prevEndpoints.length > 0 && (
                  <div className="mt-6 bg-gray-50 border border-gray-200 rounded-md p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Datos de Ejemplo del Webhook (para probar endpoints)
                    </label>
                    <textarea
                      value={testWebhookData}
                      onChange={(e) => setTestWebhookData(e.target.value)}
                      placeholder='{"cuit": "55468", "email": "test@example.com", "nombre": "Juan"}'
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
                      rows={4}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Ingresa un JSON de ejemplo que simule los datos que recibirá el webhook. 
                      Estos datos se usarán para reemplazar los placeholders <code className="bg-gray-200 px-1 rounded">{'{{campo}}'}</code> en las URLs y bodyMap.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Pestaña: Condiciones */}
            {activeTab === 'conditions' && (
              <div className="space-y-6 transition-all duration-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Condiciones y Filtros
                    </h3>
                    <p className="text-sm text-gray-500">
                      Configura condiciones para evaluar los datos antes de ejecutar el endpoint final.
                      Si las condiciones no se cumplen, el flujo se puede cancelar o devolver un error.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addCondition}
                    className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors font-medium"
                  >
                    + Agregar Condición
                  </button>
                </div>

                {conditions.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-md bg-gray-50">
                    <span className="text-4xl mb-4 block">🔍</span>
                    <p className="text-gray-500 text-sm mb-4">No hay condiciones configuradas</p>
                    <button
                      type="button"
                      onClick={addCondition}
                      className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors font-medium"
                    >
                      + Agregar Primera Condición
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {conditions.map((condition, index) => (
                      <div key={index} className="bg-gray-50 p-4 rounded-md border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-medium text-gray-700">
                            Condición {index + 1}
                            {index > 0 && (
                              <span className="ml-2 text-xs text-gray-500">
                                ({condition.logicalOperator || 'AND'})
                              </span>
                            )}
                          </h3>
                          <button
                            type="button"
                            onClick={() => removeCondition(index)}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Eliminar
                          </button>
                        </div>

                        <div className="space-y-4">
                          {index > 0 && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Operador Lógico
                              </label>
                              <select
                                value={condition.logicalOperator || 'AND'}
                                onChange={(e) => updateCondition(index, 'logicalOperator', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                              >
                                <option value="AND">Y (AND) - Todas las condiciones deben cumplirse</option>
                                <option value="OR">O (OR) - Al menos una condición debe cumplirse</option>
                              </select>
                            </div>
                          )}

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Campo a Evaluar *
                            </label>
                            <input
                              type="text"
                              value={condition.field}
                              onChange={(e) => updateCondition(index, 'field', e.target.value)}
                              placeholder="data.estado o prev.endpoint1.estado"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                              Ruta del campo. Usa <code className="bg-gray-200 px-1 rounded">data.campo</code> para datos del webhook o <code className="bg-gray-200 px-1 rounded">prev.nombreEndpoint.campo</code> para datos de llamadas previas.
                            </p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Operador *
                            </label>
                            <select
                              value={condition.operator}
                              onChange={(e) => updateCondition(index, 'operator', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                            >
                              <option value="equals">Igual a</option>
                              <option value="notEquals">Diferente de</option>
                              <option value="greaterThan">Mayor que</option>
                              <option value="lessThan">Menor que</option>
                              <option value="contains">Contiene (strings)</option>
                              <option value="startsWith">Empieza con</option>
                              <option value="endsWith">Termina con</option>
                              <option value="isEmpty">Está vacío</option>
                              <option value="isNotEmpty">No está vacío</option>
                            </select>
                          </div>

                          {!['isEmpty', 'isNotEmpty'].includes(condition.operator) && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Valor a Comparar *
                              </label>
                              <input
                                type="text"
                                value={condition.value || ''}
                                onChange={(e) => updateCondition(index, 'value', e.target.value)}
                                placeholder="AUTORIZADO"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                              <p className="mt-1 text-xs text-gray-500">
                                Valor con el que se comparará el campo. Para números, ingresa solo el número.
                              </p>
                            </div>
                          )}

                          {/* Preview de la condición */}
                          {condition.field && condition.operator && (
                            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                              <p className="text-xs text-blue-800">
                                <strong>Vista previa:</strong>{' '}
                                <code className="bg-blue-100 px-1 rounded">
                                  {condition.field}{' '}
                                  {condition.operator === 'equals' && '==='}
                                  {condition.operator === 'notEquals' && '!=='}
                                  {condition.operator === 'greaterThan' && '>'}
                                  {condition.operator === 'lessThan' && '<'}
                                  {condition.operator === 'contains' && 'contiene'}
                                  {condition.operator === 'startsWith' && 'empieza con'}
                                  {condition.operator === 'endsWith' && 'termina con'}
                                  {condition.operator === 'isEmpty' && 'está vacío'}
                                  {condition.operator === 'isNotEmpty' && 'no está vacío'}{' '}
                                  {!['isEmpty', 'isNotEmpty'].includes(condition.operator) && (
                                    <span>"{condition.value}"</span>
                                  )}
                                </code>
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Configuración de acción cuando falla */}
                {conditions.filter(c => c.field && c.operator).length > 0 && (
                  <div className="mt-6 bg-gray-50 border border-gray-200 rounded-md p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Acción cuando las condiciones NO se cumplen
                    </label>
                    <select
                      value={conditionFailureAction}
                      onChange={(e) => setConditionFailureAction(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                    >
                      <option value="error">Devolver error HTTP 400 (Bad Request)</option>
                      <option value="skip">Cancelar silenciosamente (no enviar al destino)</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Define qué ocurre cuando las condiciones no se cumplen. Si eliges "error", el webhook devolverá un error HTTP 400. Si eliges "skip", el flujo simplemente no enviará datos al destino.
                    </p>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <Lightbulb className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">Información</h3>
                      <div className="mt-2 text-sm text-blue-700">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Las condiciones se evalúan después de las llamadas previas pero antes del mapeo y envío al destino</li>
                          <li>Puedes usar datos del webhook con <code className="bg-blue-100 px-1 rounded">data.campo</code></li>
                          <li>Puedes usar datos de llamadas previas con <code className="bg-blue-100 px-1 rounded">prev.nombreEndpoint.campo</code></li>
                          <li>Las condiciones se evalúan en orden con los operadores lógicos especificados</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pestaña: Mapeo de Datos */}
            {activeTab === 'mapping' && (
              <div className="space-y-6 transition-all duration-200">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Mapeo de Datos
                    </h3>
                    <p className="text-sm text-gray-500">
                      Define cómo se mapean los campos del webhook entrante a los campos del destino.
                    </p>
                  </div>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={handleOpenAIModal}
                  className="flex items-center space-x-1 text-sm bg-purple-100 text-purple-700 px-3 py-1.5 rounded-md hover:bg-purple-200 transition-colors"
                  title="Mapeo inteligente con IA"
                >
                  <Bot className="w-4 h-4" />
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
                <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Guía de Mapeo:</h4>
                  <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                    <li>Para mapear un campo normal, usa <code className="bg-gray-200 px-1 rounded">data.campo</code> (ej: <code className="bg-gray-200 px-1 rounded">data.nombreCompleto</code>)</li>
                    <li>Para valores fijos, usa <code className="bg-gray-200 px-1 rounded">literal:valor</code></li>
                    <li>Para mapear valores (ej: "OBR"→1), usa <code className="bg-gray-200 px-1 rounded">data.campo::map{'{'}OBR:1,PRO:2{'}'}</code></li>
                    <li>Para convertir a número, usa <code className="bg-gray-200 px-1 rounded">::number</code> o <code className="bg-gray-200 px-1 rounded">::int</code></li>
                    <li>Si configuraste llamadas previas, usa <code className="bg-gray-200 px-1 rounded">prev.nombreEndpoint.campo</code> (ej: <code className="bg-gray-200 px-1 rounded">prev.clientes.idCliente</code>)</li>
                    <li><strong>Acciones previas dinámicas:</strong> usa <code className="bg-gray-200 px-1 rounded">prev.nombreEndpoint({'{{'}valor{'}}'})</code> para ejecutar acciones previas con valores del array (ej: <code className="bg-gray-200 px-1 rounded">prev.obtenerId({'{{'}data.items[0].codigo{'}}'})</code>)</li>
                    <li><strong>Para arrays:</strong> usa <code className="bg-gray-200 px-1 rounded">data.array[0].campo</code> para el primer elemento (ej: <code className="bg-gray-200 px-1 rounded">data.items[0].codigo</code>)</li>
                  </ul>
                  <details className="mt-3">
                    <summary className="text-xs font-medium text-indigo-600 cursor-pointer hover:text-indigo-700">
                      Ver más ejemplos de arrays
                    </summary>
                    <div className="mt-2 p-3 bg-white border border-gray-200 rounded text-xs space-y-2">
                      <div>
                        <p className="font-medium text-gray-700 mb-1">Acceder a elementos de un array:</p>
                        <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
                          <li>Primer elemento: <code className="bg-gray-100 px-1 rounded">data.items[0].codigo</code></li>
                          <li>Segundo elemento: <code className="bg-gray-100 px-1 rounded">data.items[1].cantidad</code></li>
                          <li>Con transformación: <code className="bg-gray-100 px-1 rounded">data.items[0].cantidad::number</code></li>
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-gray-700 mb-1">Mapear array completo automáticamente:</p>
                        <p className="text-gray-600 mb-1">Si la fuente es un array, puedes mapearlo directamente:</p>
                        <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
                          <li>Campo destino: <code className="bg-gray-100 px-1 rounded">documentoDetalle</code></li>
                          <li>Valor fuente: <code className="bg-gray-100 px-1 rounded">data.items</code> o <code className="bg-gray-100 px-1 rounded">data.items[]</code></li>
                          <li>El sistema detectará automáticamente que es un array y lo mapeará completo</li>
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-gray-700 mb-1">Mapear array completo con literal (transformación):</p>
                        <p className="text-gray-600 mb-1">Para transformar cada elemento, usa un literal:</p>
                        <p className="text-gray-600 mb-1">Campo destino: <code className="bg-gray-100 px-1 rounded">documentoDetalle</code></p>
                        <p className="text-gray-600 mb-1">Valor fuente:</p>
                        <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
{`literal:[
  {
    "idItem": "{{data.items[0].codigo}}",
    "descripcion": "{{data.items[0].nombre}}",
    "cantidad": {{data.items[0].cantidad}},
    "precioUnitario": {{data.items[0].precioUnitario}}
  }
]`}
                        </pre>
                        <p className="text-gray-500 text-xs mt-1">Nota: Este ejemplo mapea solo el primer elemento. Para todos los elementos, usa el mapeo automático o itera en el literal.</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-700 mb-1">Acciones previas dinámicas en arrays:</p>
                        <p className="text-gray-600 mb-1">Para obtener datos de endpoints previos con valores del array, usa <code className="bg-gray-100 px-1 rounded">prev.nombreEndpoint({'{{'}valor{'}}'})</code>:</p>
                        
                        <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-2">
                          <p className="text-xs font-medium text-blue-800 mb-2">📋 Ejemplo completo paso a paso:</p>
                          <ol className="text-xs text-blue-700 space-y-2 list-decimal list-inside">
                            <li>
                              <strong>Configura la acción previa:</strong>
                              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                                <li>Ve a la pestaña "Acciones Previas"</li>
                                <li>Nombre: <code className="bg-blue-100 px-1 rounded">obtenerId</code></li>
                                <li>URL: <code className="bg-blue-100 px-1 rounded">https://api.ejemplo.com/items/{'{{'}codigo{'}}'}</code></li>
                                <li>Método: <code className="bg-blue-100 px-1 rounded">GET</code></li>
                              </ul>
                            </li>
                            <li>
                              <strong>En el mapeo, usa el array literal:</strong>
                              <pre className="bg-blue-100 p-2 rounded mt-1 text-xs overflow-x-auto">
{`Campo destino: documentoDetalle
Valor fuente: literal:[
  {
    "idItem": prev.obtenerId({{data.data.items[0].codigo}}).id,
    "descripcion": "{{data.data.items[0].nombre}}",
    "cantidad": {{data.data.items[0].cantidad}},
    "precioUnitario": {{data.data.lineasPedido[0].precioUnitario}}
  }
]`}
                              </pre>
                              <p className="text-xs text-blue-600 mt-1">
                                Nota: El <code className="bg-blue-200 px-1 rounded">.id</code> extrae ese campo específico de la respuesta de la acción previa.
                              </p>
                            </li>
                            <li>
                              <strong>El sistema automáticamente:</strong>
                              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                                <li>Detecta que el array fuente (ej: <code className="bg-blue-100 px-1 rounded">data.data.items</code>) es un array</li>
                                <li>Itera sobre cada elemento (reemplaza <code className="bg-blue-100 px-1 rounded">[0]</code> con <code className="bg-blue-100 px-1 rounded">[0]</code>, <code className="bg-blue-100 px-1 rounded">[1]</code>, <code className="bg-blue-100 px-1 rounded">[2]</code>...)</li>
                                <li>Para cada elemento, ejecuta la acción previa con el valor correspondiente de ese elemento</li>
                                <li>Obtiene el campo especificado (ej: <code className="bg-blue-100 px-1 rounded">.id</code>) de la respuesta y lo asigna al campo destino</li>
                              </ul>
                            </li>
                          </ol>
                        </div>

                        <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-2">
                          <p className="text-xs font-medium text-yellow-800 mb-1">⚠️ Requisitos importantes:</p>
                          <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
                            <li>El endpoint debe retornar un objeto. En el mapeo, especifica el campo a extraer usando notación de punto (ej: <code className="bg-yellow-100 px-1 rounded">prev.obtenerId({'{{'}codigo{'}}'}).id</code>)</li>
                            <li>La URL debe usar <code className="bg-yellow-100 px-1 rounded">{'{{'}parametro{'}}'}</code> como placeholder (reemplaza "parametro" con el nombre que uses)</li>
                            <li>El nombre del endpoint en la acción previa debe coincidir exactamente con el usado en el mapeo</li>
                            <li>El array fuente (ej: <code className="bg-yellow-100 px-1 rounded">data.data.items</code>) debe existir en el webhook</li>
                          </ul>
                        </div>

                        <div className="bg-green-50 border border-green-200 rounded p-2">
                          <p className="text-xs font-medium text-green-800 mb-1">✅ Ventajas:</p>
                          <ul className="text-xs text-green-700 space-y-1 list-disc list-inside">
                            <li><strong>Cache automático:</strong> Si varios elementos tienen el mismo código, solo se hace una llamada</li>
                            <li><strong>Ejecución en paralelo:</strong> Las llamadas se ejecutan simultáneamente para mejor rendimiento</li>
                            <li><strong>Manejo de errores:</strong> Si una llamada falla, el elemento queda con <code className="bg-green-100 px-1 rounded">null</code> (si no es requerido)</li>
                          </ul>
                        </div>
                      </div>
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                        <p className="font-medium text-yellow-800 mb-1">⚠️ Errores comunes:</p>
                        <ul className="list-disc list-inside text-yellow-700 space-y-1 text-xs">
                          <li>❌ <code className="bg-yellow-100 px-1 rounded">data.items.campo</code> (falta el índice [0])</li>
                          <li>✅ <code className="bg-yellow-100 px-1 rounded">data.items[0].campo</code> (correcto)</li>
                          <li>❌ <code className="bg-yellow-100 px-1 rounded">data.items[0]campo</code> (falta el punto)</li>
                          <li>✅ <code className="bg-yellow-100 px-1 rounded">data.items[0].campo</code> (correcto)</li>
                        </ul>
                      </div>
                    </div>
                  </details>
                </div>

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
                          placeholder='data.nombre o data.array[0].campo o literal:valor'
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono text-xs"
                          title='Campo del webhook. Usa data.array[0].campo para arrays. Usa ::map{key:val} para mapear valores. Usa ::number para convertir a número. Usa literal:valor para valores fijos.'
                        />
                        <button
                          type="button"
                          onClick={() => handleOpenMappingModal(index, entry.src)}
                          className="px-2 py-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
                          title="Configurar mapeo de valores"
                        >
                          <LinkIcon className="w-4 h-4" />
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
            )}

            {/* Pestaña: Acciones */}
            {activeTab === 'actions' && (
              <div className="space-y-6 transition-all duration-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Acciones Post-Respuesta
                    </h3>
                    <p className="text-sm text-gray-500">
                      Configura acciones que se ejecutarán después de recibir la respuesta del endpoint destino.
                      Puedes usar datos de la respuesta como <code className="bg-gray-100 px-1 rounded text-xs">response.id</code>, 
                      datos del webhook como <code className="bg-gray-100 px-1 rounded text-xs">data.email</code>, 
                      y datos de llamadas previas como <code className="bg-gray-100 px-1 rounded text-xs">prev.nombreEndpoint.campo</code>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPostResponseActions([...postResponseActions, {
                      name: '',
                      url: '',
                      method: 'POST',
                      onlyOnSuccess: true,
                      required: false,
                      bodyMapEntries: [],
                      headerEntries: [],
                    }])}
                    className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors font-medium"
                  >
                    + Agregar Acción
                  </button>
                </div>

                {postResponseActions.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-md bg-gray-50">
                    <span className="text-4xl mb-4 block">⚡</span>
                    <p className="text-gray-500 text-sm mb-4">No hay acciones configuradas</p>
                    <button
                      type="button"
                      onClick={() => setPostResponseActions([...postResponseActions, {
                        name: '',
                        url: '',
                        method: 'POST',
                        onlyOnSuccess: true,
                        required: false,
                        bodyMapEntries: [],
                        headerEntries: [],
                      }])}
                      className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors font-medium"
                    >
                      + Agregar Primera Acción
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {postResponseActions.map((action, actionIndex) => (
                      <div key={actionIndex} className="bg-gray-50 p-4 rounded-md border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-medium text-gray-700">
                            Acción {actionIndex + 1} {action.name && `(${action.name})`}
                          </h3>
                          <button
                            type="button"
                            onClick={() => setPostResponseActions(postResponseActions.filter((_, i) => i !== actionIndex))}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Eliminar
                          </button>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Nombre de la Acción (opcional)
                            </label>
                            <input
                              type="text"
                              value={action.name}
                              onChange={(e) => {
                                const newActions = [...postResponseActions];
                                newActions[actionIndex].name = e.target.value;
                                setPostResponseActions(newActions);
                              }}
                              placeholder="ej: actualizar-id-externo"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                              Nombre descriptivo para identificar esta acción
                            </p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="md:col-span-3">
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                URL del Endpoint *
                              </label>
                              <input
                                type="url"
                                value={action.url}
                                onChange={(e) => {
                                  const newActions = [...postResponseActions];
                                  newActions[actionIndex].url = e.target.value;
                                  setPostResponseActions(newActions);
                                }}
                                placeholder="https://api.ejemplo.com/clientes/{{data.idCliente}}"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                              <p className="mt-1 text-xs text-gray-500">
                                Usa <code className="bg-gray-200 px-1 rounded">{'{{response.id}}'}</code>, <code className="bg-gray-200 px-1 rounded">{'{{data.campo}}'}</code> o <code className="bg-gray-200 px-1 rounded">{'{{prev.nombreEndpoint.campo}}'}</code> para inyectar valores
                              </p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Método HTTP *
                              </label>
                              <select
                                value={action.method}
                                onChange={(e) => {
                                  const newActions = [...postResponseActions];
                                  newActions[actionIndex].method = e.target.value;
                                  setPostResponseActions(newActions);
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                              >
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="PATCH">PATCH</option>
                                <option value="DELETE">DELETE</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={action.onlyOnSuccess}
                              onChange={(e) => {
                                const newActions = [...postResponseActions];
                                newActions[actionIndex].onlyOnSuccess = e.target.checked;
                                setPostResponseActions(newActions);
                              }}
                              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <label className="text-sm text-gray-700 cursor-pointer">
                              Ejecutar solo si el endpoint destino fue exitoso
                            </label>
                          </div>

                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={action.required}
                              onChange={(e) => {
                                const newActions = [...postResponseActions];
                                newActions[actionIndex].required = e.target.checked;
                                setPostResponseActions(newActions);
                              }}
                              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <label className="text-sm text-gray-700 cursor-pointer">
                              Requerido (si falla, se registrará el error pero el flujo continuará)
                            </label>
                          </div>

                          {/* Mapeo del Body para la Acción */}
                          {['POST', 'PUT', 'PATCH'].includes(action.method) && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Mapeo del Body para la Acción
                              </label>
                              <p className="text-xs text-gray-500 mb-2">
                              Define qué campos se envían al endpoint. Puedes usar <code className="bg-gray-200 px-1 rounded">response.campo</code>, <code className="bg-gray-200 px-1 rounded">data.campo</code> o <code className="bg-gray-200 px-1 rounded">prev.nombreEndpoint.campo</code>.
                            </p>
                              {action.bodyMapEntries.length === 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newActions = [...postResponseActions];
                                    newActions[actionIndex].bodyMapEntries.push({ key: '', value: '' });
                                    setPostResponseActions(newActions);
                                  }}
                                  className="text-sm text-indigo-600 hover:text-indigo-700"
                                >
                                  + Agregar Campo
                                </button>
                              ) : (
                                <div className="space-y-2">
                                  {action.bodyMapEntries.map((entry, index) => (
                                    <div key={index} className="flex items-center space-x-2">
                                      <input
                                        type="text"
                                        value={entry.key}
                                        onChange={(e) => {
                                          const newActions = [...postResponseActions];
                                          newActions[actionIndex].bodyMapEntries[index].key = e.target.value;
                                          setPostResponseActions(newActions);
                                        }}
                                        placeholder="Campo en el endpoint"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                      />
                                      <span className="text-gray-500">→</span>
                                      <input
                                        type="text"
                                        value={entry.value}
                                        onChange={(e) => {
                                          const newActions = [...postResponseActions];
                                          newActions[actionIndex].bodyMapEntries[index].value = e.target.value;
                                          setPostResponseActions(newActions);
                                        }}
                                        placeholder="response.id o data.email"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newActions = [...postResponseActions];
                                          newActions[actionIndex].bodyMapEntries = newActions[actionIndex].bodyMapEntries.filter((_, i) => i !== index);
                                          setPostResponseActions(newActions);
                                        }}
                                        className="text-red-600 hover:text-red-700 px-2"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newActions = [...postResponseActions];
                                      newActions[actionIndex].bodyMapEntries.push({ key: '', value: '' });
                                      setPostResponseActions(newActions);
                                    }}
                                    className="text-sm text-indigo-600 hover:text-indigo-700"
                                  >
                                    + Agregar Campo
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Headers de la Acción */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Headers de la Acción
                            </label>
                            {action.headerEntries.length === 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const newActions = [...postResponseActions];
                                  newActions[actionIndex].headerEntries.push({ key: '', value: '' });
                                  setPostResponseActions(newActions);
                                }}
                                className="text-sm text-indigo-600 hover:text-indigo-700"
                              >
                                + Agregar Header
                              </button>
                            ) : (
                              <div className="space-y-2">
                                {action.headerEntries.map((entry, index) => (
                                  <div key={index} className="flex items-center space-x-2">
                                    <input
                                      type="text"
                                      value={entry.key}
                                      onChange={(e) => {
                                        const newActions = [...postResponseActions];
                                        newActions[actionIndex].headerEntries[index].key = e.target.value;
                                        setPostResponseActions(newActions);
                                      }}
                                      placeholder="Nombre del header (ej: Authorization)"
                                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                    />
                                    <span className="text-gray-500">:</span>
                                    <input
                                      type="text"
                                      value={entry.value}
                                      onChange={(e) => {
                                        const newActions = [...postResponseActions];
                                        newActions[actionIndex].headerEntries[index].value = e.target.value;
                                        setPostResponseActions(newActions);
                                      }}
                                      placeholder="Valor (ej: Bearer token123)"
                                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newActions = [...postResponseActions];
                                        newActions[actionIndex].headerEntries = newActions[actionIndex].headerEntries.filter((_, i) => i !== index);
                                        setPostResponseActions(newActions);
                                      }}
                                      className="text-red-600 hover:text-red-700 px-2"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newActions = [...postResponseActions];
                                    newActions[actionIndex].headerEntries.push({ key: '', value: '' });
                                    setPostResponseActions(newActions);
                                  }}
                                  className="text-sm text-indigo-600 hover:text-indigo-700"
                                >
                                  + Agregar Header
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <Lightbulb className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">Información</h3>
                      <div className="mt-2 text-sm text-blue-700">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Las acciones se ejecutan después de recibir la respuesta del endpoint destino</li>
                          <li>Puedes usar <code className="bg-blue-100 px-1 rounded">response.campo</code> para acceder a datos de la respuesta del destino</li>
                          <li>Puedes usar <code className="bg-blue-100 px-1 rounded">data.campo</code> para acceder a datos del webhook original</li>
                          <li>Puedes usar <code className="bg-blue-100 px-1 rounded">prev.nombreEndpoint.campo</code> para acceder a datos de llamadas previas</li>
                          <li>Las acciones se ejecutan secuencialmente en el orden configurado</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Botones de acción - siempre visibles */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>

          {/* Modal de mapeo de valores */}
          {showMappingModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900 flex items-center">
                    <LinkIcon className="w-5 h-5 mr-2" />
                    <span>Configurar Mapeo de Valores</span>
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
                            <X className="w-4 h-4" />
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
                    <Bot className="w-5 h-5 mr-2 inline" />
                    Mapeo Inteligente con IA
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
                      <RefreshCw className="w-4 h-4 mr-1 inline animate-spin" />
                      Obteniendo ejemplos automáticamente...
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
                          {loadingExamples ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                              <span>Cargando...</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-1" />
                              <span>Obtener del historial</span>
                            </>
                          )}
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
                          {loadingExamples ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                              <span>Cargando...</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-1" />
                              <span>Obtener de la API</span>
                            </>
                          )}
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
        </form>
      </div>
    </div>
  );
}


