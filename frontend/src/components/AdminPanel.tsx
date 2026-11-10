import React, { useState, useEffect } from 'react';
import {
  Key,
  Database,
  Calendar,
  MessageSquare,
  Save,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Sparkles,
  Clock
} from 'lucide-react';
import { cerseaApi } from '../services/api';
import {
  AgentConfigData,
  KnowledgeItem,
  VisitaRecord,
  HorarioConfigItem,
  ConversationMessage
} from '../types/cersea';

export const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'agent' | 'knowledge' | 'visitas' | 'logs'>('agent');
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [agentConfig, setAgentConfig] = useState<AgentConfigData | null>(null);
  const [newApiKeyInput, setNewApiKeyInput] = useState('');
  const [savingAgent, setSavingAgent] = useState(false);

  const [knowledgeList, setKnowledgeList] = useState<KnowledgeItem[]>([]);
  const [newCat, setNewCat] = useState('Ingreso');
  const [newPreg, setNewPreg] = useState('');
  const [newResp, setNewResp] = useState('');
  const [syncingRag, setSyncingRag] = useState(false);

  const [visitasList, setVisitasList] = useState<VisitaRecord[]>([]);
  const [horariosConfig, setHorariosConfig] = useState<HorarioConfigItem[]>([]);

  const [conversations, setConversations] = useState<ConversationMessage[]>([]);

  const notify = (type: 'ok' | 'err', msg: string) => {
    setStatusBanner({ type, msg });
    setTimeout(() => setStatusBanner(null), 5000);
  };

  const loadAllData = async () => {
    try {
      const [cfg, know, vis, hor, conv] = await Promise.all([
        cerseaApi.getAgentConfig(),
        cerseaApi.listKnowledge(),
        cerseaApi.listVisitas(),
        cerseaApi.listHorariosConfig(),
        cerseaApi.listConversations()
      ]);
      setAgentConfig(cfg);
      setKnowledgeList(know);
      setVisitasList(vis);
      setHorariosConfig(hor);
      setConversations(conv);
    } catch (e: any) {
      notify('err', e.message || 'Error al cargar datos del panel');
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleSaveAgentConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentConfig) return;
    setSavingAgent(true);
    try {
      await cerseaApi.saveAgentConfig({
        ...agentConfig,
        custom_openai_api_key: newApiKeyInput.trim() ? newApiKeyInput.trim() : undefined
      });
      setNewApiKeyInput('');
      const refreshed = await cerseaApi.getAgentConfig();
      setAgentConfig(refreshed);
      notify('ok', 'Configuración del Agente y API Key guardada correctamente.');
    } catch (err: any) {
      notify('err', err.message || 'Error guardando configuración');
    } finally {
      setSavingAgent(false);
    }
  };

  const handleAddKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPreg.trim() || !newResp.trim()) return;
    try {
      await cerseaApi.createKnowledge({
        categoria: newCat,
        pregunta: newPreg,
        respuesta: newResp,
        activo: true
      });
      setNewPreg('');
      setNewResp('');
      const updated = await cerseaApi.listKnowledge();
      setKnowledgeList(updated);
      notify('ok', 'Pregunta agregada. Presiona "Sincronizar Vectores RAG" para indexarla en el bot.');
    } catch (err: any) {
      notify('err', err.message);
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    try {
      await cerseaApi.deleteKnowledge(id);
      setKnowledgeList((prev) => prev.filter((k) => k.id !== id));
      notify('ok', 'Registro eliminado.');
    } catch (err: any) {
      notify('err', err.message);
    }
  };

  const handleSyncRag = async () => {
    setSyncingRag(true);
    try {
      const res = await cerseaApi.syncRagVectors();
      notify('ok', `Vectores RAG sincronizados en la base de datos (${res.chunks_synced} fragmentos activos).`);
    } catch (err: any) {
      notify('err', err.message);
    } finally {
      setSyncingRag(false);
    }
  };

  const handleEstadoVisita = async (id: string, estado: 'Pendiente' | 'Confirmada' | 'Cancelada') => {
    try {
      await cerseaApi.updateVisitaEstado(id, estado);
      const updated = await cerseaApi.listVisitas();
      setVisitasList(updated);
      notify('ok', `Visita actualizada a estado: ${estado}`);
    } catch (err: any) {
      notify('err', err.message);
    }
  };

  const handleToggleDiaHorario = async (item: HorarioConfigItem) => {
    try {
      await cerseaApi.updateHorarioDia(item.dia_semana, {
        hora_inicio: item.hora_inicio,
        hora_fin: item.hora_fin,
        duracion_slot_min: item.duracion_slot_min,
        capacidad_por_slot: item.capacidad_por_slot,
        activo: !item.activo
      });
      const updated = await cerseaApi.listHorariosConfig();
      setHorariosConfig(updated);
      notify('ok', `Horario de ${item.nombre_dia} actualizado.`);
    } catch (err: any) {
      notify('err', err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Encabezado del Panel */}
      <div className="clinical-card-highlight rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-[#6D28D9] mb-2">
            Panel Administrativo • CERSEA A.C. S.C.
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Gestión del Asistente Virtual y Agenda Clínica
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Administra la OpenAI API Key, las preguntas frecuentes del chatbot, las citas agendadas y el historial de conversaciones.
          </p>
        </div>

        <button
          onClick={loadAllData}
          className="self-start md:self-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-[#6D28D9] bg-white border border-purple-200 hover:bg-purple-50 shadow-2xs transition-all cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Actualizar Panel</span>
        </button>
      </div>

      {/* Notificación Flotante */}
      {statusBanner && (
        <div
          className={`p-4 rounded-2xl text-xs font-semibold flex items-center justify-between border ${
            statusBanner.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <span>{statusBanner.msg}</span>
          <button onClick={() => setStatusBanner(null)} className="text-slate-500 hover:text-slate-800">
            ✕
          </button>
        </div>
      )}

      {/* Pestañas de Navegación */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { id: 'agent', label: '1. API Key y Asistente', icon: Key },
          { id: 'knowledge', label: `2. Base de Conocimiento (${knowledgeList.length})`, icon: Database },
          { id: 'visitas', label: `3. Citas y Horarios (${visitasList.length})`, icon: Calendar },
          { id: 'logs', label: `4. Conversaciones (${conversations.length})`, icon: MessageSquare }
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2.5 p-3.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
                active
                  ? 'bg-[#6D28D9] text-white border-[#6D28D9] shadow-md shadow-purple-500/20'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:text-[#6D28D9]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* CONTENIDO PESTAÑA 1: CONFIGURACIÓN DEL AGENTE & API KEY */}
      {activeTab === 'agent' && agentConfig && (
        <form onSubmit={handleSaveAgentConfig} className="clinical-card rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#6D28D9]" />
                Credenciales OpenAI y Personalidad del Asistente
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Usa la API Key maestra de SmartOps o ingresa una API Key propia para el centro CERSEA.
              </p>
            </div>
            <button
              type="submit"
              disabled={savingAgent}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#6D28D9] to-[#0D9488] hover:opacity-95 shadow-md cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{savingAgent ? 'Guardando...' : 'Guardar Configuración'}</span>
            </button>
          </div>

          {/* Bloque de Selección de API Key */}
          <div className="p-5 rounded-2xl bg-purple-50/50 border border-purple-200/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-[#6D28D9] uppercase tracking-wider block">
                  Conexión con OpenAI API
                </span>
                <p className="text-xs text-slate-600 mt-0.5">
                  Modo activo:{' '}
                  <strong className="text-slate-900">
                    {agentConfig.use_master_api_key
                      ? 'API Key Maestra del Servidor (SmartOps)'
                      : `API Key Propia del Cliente (${agentConfig.masked_custom_api_key || 'Sin configurar'})`}
                  </strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAgentConfig({ ...agentConfig, use_master_api_key: true })}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    agentConfig.use_master_api_key
                      ? 'bg-[#6D28D9] text-white border-[#6D28D9]'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  Usar Key SmartOps
                </button>
                <button
                  type="button"
                  onClick={() => setAgentConfig({ ...agentConfig, use_master_api_key: false })}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    !agentConfig.use_master_api_key
                      ? 'bg-[#6D28D9] text-white border-[#6D28D9]'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  Usar Key Propia CERSEA
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subir / Actualizar OpenAI API Key del Cliente (sk-...)
                </label>
                <input
                  type="password"
                  value={newApiKeyInput}
                  onChange={(e) => setNewApiKeyInput(e.target.value)}
                  placeholder={
                    agentConfig.has_custom_api_key
                      ? `Key guardada: ${agentConfig.masked_custom_api_key} (escribe otra para reemplazarla)`
                      : 'Pega aquí la API Key sk-proj-... cuando el cliente tenga la suya'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#6D28D9]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Modelo de IA</label>
                <select
                  value={agentConfig.model}
                  onChange={(e) => setAgentConfig({ ...agentConfig, model: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#6D28D9]"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Recomendado / Rápido)</option>
                  <option value="gpt-4o">gpt-4o (Avanzado)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Configuración de Mensaje de Bienvenida, Rol y Tono */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Rol del Asistente
              </label>
              <input
                type="text"
                value={agentConfig.role}
                onChange={(e) => setAgentConfig({ ...agentConfig, role: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-[#6D28D9]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tono de Comunicación (Cristiano y Humanista)
              </label>
              <input
                type="text"
                value={agentConfig.tone}
                onChange={(e) => setAgentConfig({ ...agentConfig, tone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-[#6D28D9]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mensaje de Bienvenida en el Chat
            </label>
            <input
              type="text"
              value={agentConfig.welcome_message}
              onChange={(e) => setAgentConfig({ ...agentConfig, welcome_message: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-[#6D28D9]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Instrucciones del Asistente (System Prompt)
            </label>
            <textarea
              rows={6}
              value={agentConfig.custom_instructions}
              onChange={(e) =>
                setAgentConfig({ ...agentConfig, custom_instructions: e.target.value })
              }
              className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-[#6D28D9]"
            />
          </div>
        </form>
      )}

      {/* CONTENIDO PESTAÑA 2: BASE DE CONOCIMIENTO */}
      {activeTab === 'knowledge' && (
        <div className="space-y-6">
          <div className="clinical-card rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Base de Conocimiento de la Clínica (`cersea_knowledge`)
              </h2>
              <p className="text-xs text-slate-500">
                Agrega o edita respuestas oficiales y presiona sincronizar para actualizar la memoria del chatbot.
              </p>
            </div>
            <button
              onClick={handleSyncRag}
              disabled={syncingRag}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#6D28D9] to-[#0D9488] hover:opacity-95 shadow-md cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${syncingRag ? 'animate-spin' : ''}`} />
              <span>
                {syncingRag ? 'Sincronizando con IA...' : 'Sincronizar Memoria del Chatbot (RAG)'}
              </span>
            </button>
          </div>

          <form onSubmit={handleAddKnowledge} className="clinical-card rounded-3xl p-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6D28D9]">
              + Agregar Nueva Pregunta Frecuente
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Categoría</label>
                <select
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
                >
                  <option value="Ingreso">Ingreso y Requisitos</option>
                  <option value="Ubicaciones">Ubicaciones</option>
                  <option value="Servicios">Servicios Clínicos</option>
                  <option value="Convenios">Convenios (CUSON / ISEA)</option>
                  <option value="Contactos">Contactos y Horarios</option>
                  <option value="Identidad y Pilares">Identidad y Pilares</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Pregunta Frecuente
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. ¿Qué días se puede visitar a una interna?"
                  value={newPreg}
                  onChange={(e) => setNewPreg(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Respuesta Oficial para las Familias
              </label>
              <textarea
                rows={3}
                required
                placeholder="Escribe la respuesta que dará el asistente..."
                value={newResp}
                onChange={(e) => setNewResp(e.target.value)}
                className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900"
              />
            </div>
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-[#6D28D9] bg-purple-50 border border-purple-200 hover:bg-purple-100 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Guardar Pregunta</span>
            </button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {knowledgeList.map((item) => (
              <div
                key={item.id}
                className="clinical-card rounded-2xl p-5 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-[#6D28D9] border border-purple-200">
                      {item.categoria}
                    </span>
                    <button
                      onClick={() => handleDeleteKnowledge(item.id)}
                      className="text-slate-400 hover:text-red-500 p-1 cursor-pointer"
                      title="Eliminar pregunta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1.5">{item.pregunta}</h4>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                    {item.respuesta}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CONTENIDO PESTAÑA 3: VISITAS AGENDADAS Y HORARIOS */}
      {activeTab === 'visitas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 clinical-card rounded-3xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Citas y Visitas Registradas (`visitas`)
            </h2>
            {visitasList.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                Aún no hay visitas registradas.
              </p>
            ) : (
              <div className="space-y-3">
                {visitasList.map((v) => (
                  <div
                    key={v.id}
                    className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#6D28D9]">
                          {v.folio}
                        </span>
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-[#5B21B6] border border-purple-200">
                          {v.tipo_visita}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-600">
                          vía {v.origen}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-900">
                        Familiar: {v.nombre_visitante} •{' '}
                        <span className="text-xs font-semibold text-[#0D9488]">{v.telefono}</span>
                      </p>
                      <p className="text-xs text-slate-600">
                        Interna/Prospecto: <strong>{v.nombre_interno_prospecto}</strong> | Fecha y Hora:{' '}
                        {v.fecha_hora ? new Date(v.fecha_hora).toLocaleString('es-MX') : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold ${
                          v.estado === 'Confirmada'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : v.estado === 'Cancelada'
                            ? 'bg-red-50 text-red-600 border border-red-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {v.estado}
                      </span>
                      {v.estado !== 'Confirmada' && (
                        <button
                          onClick={() => handleEstadoVisita(v.id, 'Confirmada')}
                          className="p-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                          title="Confirmar visita"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {v.estado !== 'Cancelada' && (
                        <button
                          onClick={() => handleEstadoVisita(v.id, 'Cancelada')}
                          className="p-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 cursor-pointer"
                          title="Cancelar visita"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 clinical-card rounded-3xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0D9488]" />
              Horarios de Atención
            </h2>
            <p className="text-xs text-slate-500">
              Activa o desactiva los días permitidos para agendar visitas en la clínica.
            </p>
            <div className="space-y-2.5">
              {horariosConfig.map((h) => (
                <div
                  key={h.id}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-900">{h.nombre_dia}</p>
                    <p className="text-[11px] text-slate-500">
                      {h.hora_inicio} - {h.hora_fin} ({h.capacidad_por_slot} cupos/hora)
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleDiaHorario(h)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                      h.activo
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-200 text-slate-500 border-slate-300'
                    }`}
                  >
                    {h.activo ? 'Abierto' : 'Cerrado'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO PESTAÑA 4: HISTORIAL DE CONVERSACIONES */}
      {activeTab === 'logs' && (
        <div className="clinical-card rounded-3xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">
            Historial de Conversaciones del Chatbot
          </h2>
          {conversations.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              Aún no hay mensajes registrados.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-2">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={`p-4 rounded-2xl border text-xs ${
                    c.role === 'user'
                      ? 'bg-slate-50 border-slate-200 text-slate-800'
                      : 'bg-purple-50/50 border-purple-200 text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold mb-1">
                    <span>
                      {c.role === 'user' ? 'Familiar / Visitante' : 'Asistente CERSEA'} • Sesión: {c.session_id}
                    </span>
                    <span>{c.timestamp}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-xs sm:text-sm">{c.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
