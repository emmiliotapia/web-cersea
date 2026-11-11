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

export interface ResumenDiaDisponibilidad {
  fecha: string;
  nombre_dia: string;
  activo: boolean;
  total_bloques_libres: number;
  total_cupos_libres: number;
  horas_disponibles: string[];
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
  mensajes_limite_mes?: number;
  mensajes_consumidos_mes?: number;
  fecha_renovacion_ciclo?: number;
}

export interface TenantCreditsStatus {
  tenant_id: string;
  tenant_name: string;
  mensajes_limite_mes: number;
  mensajes_consumidos_mes: number;
  mensajes_restantes: number;
  porcentaje_uso: number;
  fecha_renovacion_ciclo: number;
  usa_master_key: boolean;
  plan_nombre: string;
  upsell_oferta: string;
}

export interface McpToolSchema {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ConversationMessage {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
}
