import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Database,
  Calendar,
  MessageSquare,
  Save,
  RefreshCw,
  Plus,
  Trash2,
  Activity,
  Zap,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { cerseaApi } from '../services/api';
import {
  AgentConfigData,
  TenantCreditsStatus,
  KnowledgeItem,
  VisitaRecord,
  HorarioConfigItem,
  McpToolSchema,
  ConversationMessage
} from '../types/cersea';
import { AdminAgendaManager } from './AdminAgendaManager';
import { ChatMarkdownRenderer } from './ChatMarkdownRenderer';

export const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'visitas' | 'agent' | 'knowledge' | 'logs'>('visitas');
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [agentConfig, setAgentConfig] = useState<AgentConfigData | null>(null);
  const [creditsStatus, setCreditsStatus] = useState<TenantCreditsStatus | null>(null);
  const [savingAgent, setSavingAgent] = useState(false);
  const [requestingUpsell, setRequestingUpsell] = useState(false);
  const [upsellRequestedOk, setUpsellRequestedOk] = useState(false);

  const [knowledgeList, setKnowledgeList] = useState<KnowledgeItem[]>([]);
  const [newCat, setNewCat] = useState('Ingreso');
  const [newPreg, setNewPreg] = useState('');
  const [newResp, setNewResp] = useState('');
  const [syncingRag, setSyncingRag] = useState(false);

  const [visitasList, setVisitasList] = useState<VisitaRecord[]>([]);
  const [horariosConfig, setHorariosConfig] = useState<HorarioConfigItem[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolSchema[]>([]);

  const [conversations, setConversations] = useState<ConversationMessage[]>([]);

  const notify = (type: 'ok' | 'err', msg: string) => {
    setStatusBanner({ type, msg });
    setTimeout(() => setStatusBanner(null), 6000);
  };

  const loadAllData = async () => {
    try {
      const [cfg, cred, know, vis, hor, conv, mcpRes] = await Promise.all([
        cerseaApi.getAgentConfig(),
        cerseaApi.getCreditsStatus(),
        cerseaApi.listKnowledge(),
        cerseaApi.listVisitas(),
        cerseaApi.listHorariosConfig(),
        cerseaApi.listConversations(),
        cerseaApi.listMcpTools().catch(() => ({ server: 'cersea-agenda-mcp', version: '1.0.0', tools: [] }))
      ]);
      setAgentConfig(cfg);
      setCreditsStatus(cred);
      setKnowledgeList(know);
      setVisitasList(vis);
      setHorariosConfig(hor);
      setConversations(conv);
      setMcpTools(mcpRes.tools || []);
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
      await cerseaApi.saveAgentConfig(agentConfig);
      const refreshed = await cerseaApi.getAgentConfig();
      setAgentConfig(refreshed);
      notify('ok', 'Configuración del asistente virtual guardada correctamente.');
    } catch (err: any) {
      notify('err', err.message || 'Error guardando configuración');
    } finally {
      setSavingAgent(false);
    }
  };

  const handleRequestUpsell = async () => {
    setRequestingUpsell(true);
    try {
      const res = await cerseaApi.requestCreditsUpsell({
        solicitante: 'Administración CERSEA, A.C.',
        telefono_contacto: '653 123 2800',
        paquete_solicitado: '+1,000 créditos adicionales por $500 MXN'
      });
      setUpsellRequestedOk(true);
      notify('ok', res.message || 'Solicitud enviada a SmartOps. En breve ampliaremos tu paquete de créditos.');
    } catch (err: any) {
      notify('err', err.message || 'Error al solicitar más créditos');
    } finally {
      setRequestingUpsell(false);
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
      notify('ok', 'Pregunta agregada. Presiona "Sincronizar Memoria del Chatbot (RAG)" para indexarla.');
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

  const usados = creditsStatus?.mensajes_consumidos_mes ?? 0;
  const limite = creditsStatus?.mensajes_limite_mes ?? 1500;
  const porcentaje =
    creditsStatus?.porcentaje_uso ?? Math.min(100, Math.round((usados / Math.max(limite, 1)) * 100));
  const isNearLimit = porcentaje >= 80;
  const isOut = usados >= limite;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Encabezado del Panel */}
      <div className="clinical-card-highlight rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-[#6D28D9] mb-2">
            Panel Administrativo • CERSEA, A.C. S.C.
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Gestión de Agendas, Citas y Asistente MCP
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Administra y reprograma las citas agendadas, configura horarios/cupos por día, monitorea tus créditos de IA y gestiona la memoria del bot.
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

      {/* DASHBOARD DE CONSUMO DE IA (SERVICIO LLAVE EN MANO SMARTOPS) */}
      <div className="clinical-card rounded-3xl p-6 sm:p-8 border-2 border-purple-200/80 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-[#0D9488] border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                Servicio IA Llave en Mano + MCP Server Activo
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Renovación automática: Día {creditsStatus?.fecha_renovacion_ciclo ?? 10} de cada mes
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pt-1">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#6D28D9]" />
                <span>
                  Interacciones de IA este mes:{' '}
                  <strong className="text-[#6D28D9]">
                    {usados.toLocaleString('es-MX')} / {limite.toLocaleString('es-MX')}
                  </strong>
                </span>
              </h2>
              <span className="text-xs font-bold text-slate-600">
                {creditsStatus?.mensajes_restantes?.toLocaleString('es-MX') ?? limite - usados} interacciones
                disponibles ({porcentaje}% utilizado)
              </span>
            </div>

            <div className="w-full h-4 rounded-full bg-slate-100 border border-slate-200 overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isOut
                    ? 'bg-red-500'
                    : isNearLimit
                    ? 'bg-amber-500'
                    : 'bg-gradient-to-r from-[#6D28D9] to-[#0D9488]'
                }`}
                style={{ width: `${Math.max(2, Math.min(100, porcentaje))}%` }}
              />
            </div>

            {isOut ? (
              <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5 pt-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Has alcanzado el límite mensual. El bot responde automáticamente redirigiendo a las familias al teléfono 653 123 2800.
              </p>
            ) : (
              <p className="text-xs text-slate-500 pt-0.5">
                Cada respuesta generada por el asistente virtual a las familias cuenta como 1 interacción. Infraestructura IA gestionada por SmartOps.
              </p>
            )}
          </div>

          <div className="lg:border-l lg:border-slate-200 lg:pl-6 flex flex-col justify-center items-start lg:items-end shrink-0 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              ¿Necesitas ampliar tu capacidad este mes?
            </span>
            <button
              type="button"
              onClick={handleRequestUpsell}
              disabled={requestingUpsell}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-[#6D28D9] to-[#0D9488] hover:opacity-95 shadow-md shadow-purple-500/15 transition-all cursor-pointer disabled:opacity-60"
            >
              <Zap className="w-4 h-4" />
              <span>
                {requestingUpsell
                  ? 'Enviando solicitud...'
                  : upsellRequestedOk
                  ? 'Solicitud enviada • Solicitar de nuevo'
                  : 'Solicitar más créditos'}
              </span>
            </button>
            <span className="text-[11px] text-slate-500 font-medium">
              Paquete de expansión inmediata por <strong className="text-slate-700">$500 MXN extra</strong>
            </span>
          </div>
        </div>
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

      {/* Pestañas de Navegación (Agenda como Primera Pestaña para Gestión Rápida) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { id: 'visitas', label: `1. Gestión de Agendas y Citas (${visitasList.length})`, icon: Calendar },
          { id: 'agent', label: '2. Asistente e Instrucciones', icon: Sparkles },
          { id: 'knowledge', label: `3. Base de Conocimiento (${knowledgeList.length})`, icon: Database },
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

      {/* CONTENIDO PESTAÑA 1: GESTIÓN Y MANIPULACIÓN DE AGENDAS, HORARIOS Y MCP SERVER */}
      {activeTab === 'visitas' && (
        <AdminAgendaManager
          visitasList={visitasList}
          horariosConfig={horariosConfig}
          mcpTools={mcpTools}
          onRefresh={loadAllData}
          notify={notify}
        />
      )}

      {/* CONTENIDO PESTAÑA 2: PERSONALIDAD E INSTRUCCIONES DEL AGENTE */}
      {activeTab === 'agent' && agentConfig && (
        <form onSubmit={handleSaveAgentConfig} className="clinical-card rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#6D28D9]" />
                Personalidad, Bienvenida e Instrucciones del Asistente
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ajusta el mensaje de bienvenida y las directrices humanistas y cristianas con las que el asistente orienta a las familias.
              </p>
            </div>
            <button
              type="submit"
              disabled={savingAgent}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#6D28D9] to-[#0D9488] hover:opacity-95 shadow-md cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{savingAgent ? 'Guardando...' : 'Guardar Cambios'}</span>
            </button>
          </div>

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
              Instrucciones Operativas del Asistente
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

      {/* CONTENIDO PESTAÑA 3: BASE DE CONOCIMIENTO */}
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
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold mb-1.5">
                    <span>
                      {c.role === 'user' ? 'Familiar / Visitante' : 'Asistente CERSEA'} • Sesión: {c.session_id}
                    </span>
                    <span>{c.timestamp}</span>
                  </div>
                  <div className="text-xs sm:text-sm">
                    <ChatMarkdownRenderer content={c.content} isUser={c.role === 'user'} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
