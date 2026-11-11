import {
  DisponibilidadDiaResponse,
  ResumenDiaDisponibilidad,
  HorarioConfigItem,
  VisitaRecord,
  KnowledgeItem,
  AgentConfigData,
  TenantCreditsStatus,
  McpToolSchema,
  ConversationMessage
} from '../types/cersea';

const DEFAULT_VPS_HTTP = 'https://api-core.smartopsia.com';
const DEFAULT_VPS_WS = 'wss://api-core.smartopsia.com';
const LOCAL_BACKEND_HTTP = 'http://localhost:8000';

export function getApiBaseUrl(): string {
  const stored = localStorage.getItem('cersea_api_base_url');
  if (stored && stored.trim()) return stored.trim().replace(/\/$/, '');
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '');
  }
  // En desarrollo local con Vite (npm run dev / puerto 5173) usar el backend local en :8000;
  // en builds de producción (Docker / puerto 3500 / VPS) usar siempre https://api-core.smartopsia.com
  if (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return LOCAL_BACKEND_HTTP;
  }
  return DEFAULT_VPS_HTTP;
}

export function getWsBaseUrl(): string {
  const httpUrl = getApiBaseUrl();
  if (httpUrl.startsWith('https://')) {
    return httpUrl.replace('https://', 'wss://');
  }
  if (httpUrl.startsWith('http://')) {
    return httpUrl.replace('http://', 'ws://');
  }
  return DEFAULT_VPS_WS;
}

export const cerseaApi = {
  async getHealth() {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/health`);
    if (!res.ok) throw new Error('Error conectando con el servidor CERSEA');
    return res.json();
  },

  async getAvailableSlots(fecha: string): Promise<DisponibilidadDiaResponse> {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/horarios/disponibles?fecha=${encodeURIComponent(fecha)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Error al consultar horarios disponibles');
    }
    return res.json();
  },

  async getUpcomingAvailabilitySummary(dias = 10, fechaInicio?: string): Promise<ResumenDiaDisponibilidad[]> {
    const q = new URLSearchParams({ dias: String(dias) });
    if (fechaInicio) q.set('fecha_inicio', fechaInicio);
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/horarios/resumen?${q.toString()}`);
    if (!res.ok) return [];
    return res.json();
  },

  async createVisita(payload: {
    nombre_visitante: string;
    telefono: string;
    nombre_interno_prospecto?: string;
    tipo_visita: 'Primer Ingreso' | 'Familiar';
    fecha_hora: string;
    notas?: string;
    origen?: string;
  }): Promise<VisitaRecord> {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/visitas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origen: 'web_ui', ...payload })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'No se pudo reservar el horario');
    }
    return res.json();
  },

  async listVisitas(filters?: {
    estado?: string;
    fecha?: string;
    tipo_visita?: string;
    q?: string;
  }): Promise<VisitaRecord[]> {
    const params = new URLSearchParams();
    if (filters?.estado && filters.estado !== 'Todos') params.set('estado', filters.estado);
    if (filters?.fecha) params.set('fecha', filters.fecha);
    if (filters?.tipo_visita && filters.tipo_visita !== 'Todos') params.set('tipo_visita', filters.tipo_visita);
    if (filters?.q) params.set('q', filters.q);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/visitas${qs}`);
    if (!res.ok) throw new Error('Error al listar visitas');
    return res.json();
  },

  async updateOrRescheduleVisita(
    idOrFolio: string,
    payload: {
      nueva_fecha_hora?: string;
      nombre_visitante?: string;
      telefono?: string;
      nombre_interno_prospecto?: string;
      tipo_visita?: 'Primer Ingreso' | 'Familiar';
      estado?: 'Pendiente' | 'Confirmada' | 'Cancelada';
      notas?: string;
    }
  ): Promise<VisitaRecord> {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/visitas/${encodeURIComponent(idOrFolio)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Error al reprogramar o actualizar la cita');
    }
    return res.json();
  },

  async updateVisitaEstado(id: string, estado: 'Pendiente' | 'Confirmada' | 'Cancelada') {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/visitas/${id}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado })
    });
    if (!res.ok) throw new Error('Error al actualizar estado de visita');
    return res.json();
  },

  async deleteVisita(id: string) {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/visitas/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Error al eliminar visita');
    return res.json();
  },

  async listHorariosConfig(): Promise<HorarioConfigItem[]> {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/horarios/config`);
    if (!res.ok) throw new Error('Error al cargar configuración de horarios');
    return res.json();
  },

  async updateHorarioDia(diaSemana: number, payload: Partial<HorarioConfigItem>) {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/horarios/config/${diaSemana}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Error al guardar horario');
    return res.json();
  },

  async listMcpTools(): Promise<{ server: string; version: string; tools: McpToolSchema[] }> {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/mcp/tools`);
    if (!res.ok) throw new Error('Error al consultar herramientas del MCP Server');
    return res.json();
  },

  async executeMcpTool(name: string, args: Record<string, any>) {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/mcp/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args })
    });
    if (!res.ok) throw new Error('Error al ejecutar herramienta MCP');
    return res.json();
  },

  async listKnowledge(): Promise<KnowledgeItem[]> {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/knowledge`);
    if (!res.ok) throw new Error('Error al cargar base de conocimiento');
    return res.json();
  },

  async createKnowledge(payload: Omit<KnowledgeItem, 'id' | 'updated_at'>) {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Error al crear registro de conocimiento');
    return res.json();
  },

  async updateKnowledge(id: string, payload: Omit<KnowledgeItem, 'id' | 'updated_at'>) {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/knowledge/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Error al actualizar conocimiento');
    return res.json();
  },

  async deleteKnowledge(id: string) {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/knowledge/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Error al eliminar conocimiento');
    return res.json();
  },

  async syncRagVectors() {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/knowledge/sync-rag`, {
      method: 'POST'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Error al sincronizar vectores RAG');
    }
    return res.json();
  },

  async getAgentConfig(): Promise<AgentConfigData> {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/agent-config`);
    if (!res.ok) throw new Error('Error al obtener configuración del agente');
    return res.json();
  },

  async saveAgentConfig(payload: Partial<AgentConfigData>) {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/agent-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Error al guardar configuración del agente');
    return res.json();
  },

  async getCreditsStatus(): Promise<TenantCreditsStatus> {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/credits`);
    if (!res.ok) throw new Error('Error al consultar consumo de IA');
    return res.json();
  },

  async requestCreditsUpsell(payload?: {
    solicitante?: string;
    telefono_contacto?: string;
    paquete_solicitado?: string;
    notas?: string;
  }) {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/credits/request-upsell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        solicitante: payload?.solicitante || 'Administración CERSEA, A.C.',
        telefono_contacto: payload?.telefono_contacto || '653 123 2800',
        paquete_solicitado: payload?.paquete_solicitado || '+1,000 mensajes adicionales ($500 MXN)',
        notas: payload?.notas || 'Solicitud enviada desde el Dashboard de Consumo en /admin'
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Error al enviar solicitud de créditos');
    }
    return res.json();
  },

  async listConversations(): Promise<ConversationMessage[]> {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/conversations`);
    if (!res.ok) throw new Error('Error al cargar historial de conversaciones');
    return res.json();
  },

  async sendRestChatMessage(userId: string, message: string) {
    const res = await fetch(`${getApiBaseUrl()}/api/gateway/inbound/webchat/CERSEA`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, message })
    });
    if (!res.ok) throw new Error('Error en comunicación con el asistente');
    return res.json();
  }
};
