import {
  DisponibilidadDiaResponse,
  HorarioConfigItem,
  VisitaRecord,
  KnowledgeItem,
  AgentConfigData,
  ConversationMessage
} from '../types/cersea';

const DEFAULT_VPS_HTTP = 'https://api-core.smartopsia.com';
const DEFAULT_VPS_WS = 'wss://api-core.smartopsia.com';

export function getApiBaseUrl(): string {
  const stored = localStorage.getItem('cersea_api_base_url');
  if (stored && stored.trim()) return stored.trim().replace(/\/$/, '');
  return import.meta.env.VITE_API_BASE_URL || DEFAULT_VPS_HTTP;
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

  async createVisita(payload: {
    nombre_visitante: string;
    telefono: string;
    nombre_interno_prospecto?: string;
    tipo_visita: 'Primer Ingreso' | 'Familiar';
    fecha_hora: string;
    notas?: string;
  }): Promise<VisitaRecord> {
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/visitas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, origen: 'web_ui' })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'No se pudo reservar el horario');
    }
    return res.json();
  },

  async listVisitas(estado?: string): Promise<VisitaRecord[]> {
    const q = estado ? `?estado=${encodeURIComponent(estado)}` : '';
    const res = await fetch(`${getApiBaseUrl()}/api/cersea/visitas${q}`);
    if (!res.ok) throw new Error('Error al listar visitas');
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

