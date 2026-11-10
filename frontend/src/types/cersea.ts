export interface SlotItem {
  hora: string;
  fecha_hora_iso: string;
  capacidad_maxima: number;
  ocupados: number;
  cupos_disponibles: number;
  disponible: boolean;
}

export interface DisponibilidadDiaResponse {
  fecha: string;
  dia_semana: number;
  nombre_dia: string;
  activo: boolean;
  slots: SlotItem[];
  slots_disponibles: string[];
}

export interface HorarioConfigItem {
  id: string;
  dia_semana: number;
  nombre_dia: string;
  hora_inicio: string;
  hora_fin: string;
  duracion_slot_min: number;
  capacidad_por_slot: number;
  activo: boolean;
}

export interface VisitaRecord {
  id: string;
  folio: string;
  nombre_visitante: string;
  telefono: string;
  nombre_interno_prospecto: string;
  tipo_visita: 'Primer Ingreso' | 'Familiar';
  fecha_hora: string;
  fecha?: string;
  hora?: string;
  estado: 'Pendiente' | 'Confirmada' | 'Cancelada';
  notas?: string;
  origen: string;
  created_at?: string;
}

export interface KnowledgeItem {
  id: string;
  categoria: string;
  pregunta: string;
  respuesta: string;
  activo: boolean;
  updated_at?: string;
}

export interface AgentConfigData {
  tenant_id: string;
  name: string;
  role: string;
  tone: string;
  mission: string;
  vision: string;
  objective: string;
  welcome_message: string;
  custom_instructions: string;
  model: string;
  temperature: number;
  use_master_api_key: boolean;
  has_custom_api_key: boolean;
  masked_custom_api_key: string;
  custom_openai_api_key?: string;
}

export interface ConversationMessage {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
}

