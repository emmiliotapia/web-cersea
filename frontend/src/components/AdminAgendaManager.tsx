import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Search,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
  Save,
  User,
  Phone,
  Users,
  Cpu,
  Play,
  Filter
} from 'lucide-react';
import { cerseaApi } from '../services/api';
import { VisitaRecord, HorarioConfigItem, McpToolSchema } from '../types/cersea';

interface AdminAgendaManagerProps {
  visitasList: VisitaRecord[];
  horariosConfig: HorarioConfigItem[];
  mcpTools: McpToolSchema[];
  onRefresh: () => Promise<void>;
  notify: (type: 'ok' | 'err', msg: string) => void;
}

function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export const AdminAgendaManager: React.FC<AdminAgendaManagerProps> = ({
  visitasList,
  horariosConfig,
  mcpTools,
  onRefresh,
  notify
}) => {
  // Filtros de la agenda
  const [searchFilter, setSearchFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Todos');
  const [typeFilter, setTypeFilter] = useState<string>('Todos');

  // Formulario para Crear o Editar/Reprogramar Cita
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCita, setEditingCita] = useState<VisitaRecord | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formInterna, setFormInterna] = useState('');
  const [formTipo, setFormTipo] = useState<'Familiar' | 'Primer Ingreso'>('Familiar');
  const [formFecha, setFormFecha] = useState(getTodayIso());
  const [formHora, setFormHora] = useState('11:00');
  const [formEstado, setFormEstado] = useState<'Pendiente' | 'Confirmada' | 'Cancelada'>('Confirmada');
  const [formNotas, setFormNotas] = useState('');
  const [savingCita, setSavingCita] = useState(false);

  // Estado editable local para Horarios de Atención por Día
  const [localHorarios, setLocalHorarios] = useState<HorarioConfigItem[]>(horariosConfig);
  const [savingDayId, setSavingDayId] = useState<number | null>(null);

  // Consola rápida de prueba del MCP Server
  const [selectedMcpTool, setSelectedMcpTool] = useState<string>('consulta_agenda');
  const [mcpArgsJson, setMcpArgsJson] = useState<string>('{"dias_adelante": 5}');
  const [mcpResultOutput, setMcpResultOutput] = useState<string>('');
  const [runningMcp, setRunningMcp] = useState(false);

  React.useEffect(() => {
    setLocalHorarios(horariosConfig);
  }, [horariosConfig]);

  const openCreateModal = () => {
    setEditingCita(null);
    setFormNombre('');
    setFormTelefono('');
    setFormInterna('');
    setFormTipo('Familiar');
    setFormFecha(getTodayIso());
    setFormHora('11:00');
    setFormEstado('Confirmada');
    setFormNotas('');
    setShowFormModal(true);
  };

  const openEditModal = (v: VisitaRecord) => {
    setEditingCita(v);
    setFormNombre(v.nombre_visitante);
    setFormTelefono(v.telefono);
    setFormInterna(v.nombre_interno_prospecto === '—' ? '' : v.nombre_interno_prospecto);
    setFormTipo(v.tipo_visita);
    setFormFecha(v.fecha || v.fecha_hora?.slice(0, 10) || getTodayIso());
    setFormHora(v.hora || v.fecha_hora?.slice(11, 16) || '11:00');
    setFormEstado(v.estado);
    setFormNotas(v.notas || '');
    setShowFormModal(true);
  };

  const handleSaveCitaForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCita(true);
    try {
      const isoDateTime = `${formFecha}T${formHora}:00-07:00`;
      if (editingCita) {
        await cerseaApi.updateOrRescheduleVisita(editingCita.id, {
          nueva_fecha_hora: isoDateTime,
          nombre_visitante: formNombre,
          telefono: formTelefono,
          nombre_interno_prospecto: formInterna,
          tipo_visita: formTipo,
          estado: formEstado,
          notas: formNotas
        });
        notify('ok', `Cita ${editingCita.folio} actualizada / reprogramada correctamente.`);
      } else {
        const created = await cerseaApi.createVisita({
          nombre_visitante: formNombre,
          telefono: formTelefono,
          nombre_interno_prospecto: formInterna,
          tipo_visita: formTipo,
          fecha_hora: isoDateTime,
          notas: formNotas,
          origen: 'panel_admin'
        });
        notify('ok', `Nueva cita creada en la agenda con Folio ${created.folio}.`);
      }
      setShowFormModal(false);
      await onRefresh();
    } catch (err: any) {
      notify('err', err.message || 'Error al guardar la cita');
    } finally {
      setSavingCita(false);
    }
  };

  const handleQuickEstado = async (id: string, nuevoEstado: 'Pendiente' | 'Confirmada' | 'Cancelada') => {
    try {
      await cerseaApi.updateVisitaEstado(id, nuevoEstado);
      await onRefresh();
      notify('ok', `Estado actualizado a ${nuevoEstado}.`);
    } catch (err: any) {
      notify('err', err.message);
    }
  };

  const handleDeleteCita = async (v: VisitaRecord) => {
    try {
      await cerseaApi.deleteVisita(v.id);
      await onRefresh();
      notify('ok', `Cita ${v.folio} eliminada de la agenda.`);
    } catch (err: any) {
      notify('err', err.message);
    }
  };

  const handleHorarioChange = (diaSemana: number, field: keyof HorarioConfigItem, value: any) => {
    setLocalHorarios((prev) =>
      prev.map((h) => (h.dia_semana === diaSemana ? { ...h, [field]: value } : h))
    );
  };

  const handleSaveHorarioRow = async (h: HorarioConfigItem) => {
    setSavingDayId(h.dia_semana);
    try {
      await cerseaApi.updateHorarioDia(h.dia_semana, {
        hora_inicio: h.hora_inicio,
        hora_fin: h.hora_fin,
        duracion_slot_min: Number(h.duracion_slot_min),
        capacidad_por_slot: Number(h.capacidad_por_slot),
        activo: h.activo
      });
      await onRefresh();
      notify('ok', `Regla de horario de ${h.nombre_dia} actualizada.`);
    } catch (err: any) {
      notify('err', err.message);
    } finally {
      setSavingDayId(null);
    }
  };

  const handleExecuteMcpTest = async () => {
    setRunningMcp(true);
    try {
      const parsed = JSON.parse(mcpArgsJson || '{}');
      const res = await cerseaApi.executeMcpTool(selectedMcpTool, parsed);
      setMcpResultOutput(JSON.stringify(res, null, 2));
      await onRefresh();
    } catch (err: any) {
      setMcpResultOutput(`Error: ${err.message}`);
    } finally {
      setRunningMcp(false);
    }
  };

  // Filtrado en tiempo real de las visitas
  const filteredVisitas = visitasList.filter((v) => {
    if (statusFilter !== 'Todos' && v.estado !== statusFilter) return false;
    if (typeFilter !== 'Todos' && v.tipo_visita !== typeFilter) return false;
    const vDate = v.fecha || v.fecha_hora?.slice(0, 10) || '';
    if (dateFilter && vDate !== dateFilter) return false;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      const match =
        v.folio.toLowerCase().includes(q) ||
        v.nombre_visitante.toLowerCase().includes(q) ||
        v.telefono.toLowerCase().includes(q) ||
        (v.nombre_interno_prospecto || '').toLowerCase().includes(q) ||
        (v.notas || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const totalConfirmadas = visitasList.filter((v) => v.estado === 'Confirmada').length;
  const totalPendientes = visitasList.filter((v) => v.estado === 'Pendiente').length;
  const totalPrimerIngreso = visitasList.filter((v) => v.tipo_visita === 'Primer Ingreso' && v.estado !== 'Cancelada').length;

  return (
    <div className="space-y-6">
      {/* KPIs Rápidos de la Agenda */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="clinical-card rounded-2xl p-4 bg-white">
          <span className="text-xs font-semibold text-slate-500">Total Citas en Agenda</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{visitasList.length}</p>
        </div>
        <div className="clinical-card rounded-2xl p-4 bg-white">
          <span className="text-xs font-semibold text-emerald-700">Confirmadas Activas</span>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{totalConfirmadas}</p>
        </div>
        <div className="clinical-card rounded-2xl p-4 bg-white">
          <span className="text-xs font-semibold text-amber-700">Pendientes por Confirmar</span>
          <p className="text-2xl font-bold text-amber-700 mt-1">{totalPendientes}</p>
        </div>
        <div className="clinical-card rounded-2xl p-4 bg-white">
          <span className="text-xs font-semibold text-[#6D28D9]">Valoración 1er Ingreso</span>
          <p className="text-2xl font-bold text-[#6D28D9] mt-1">{totalPrimerIngreso}</p>
        </div>
      </div>

      {/* Modal / Panel Desplegable para Agendar o Reprogramar Cita Manualmente */}
      {showFormModal && (
        <form
          onSubmit={handleSaveCitaForm}
          className="clinical-card-highlight rounded-3xl p-6 sm:p-8 border-2 border-[#6D28D9]/40 bg-white space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#6D28D9]" />
              <span>
                {editingCita
                  ? `Editar / Reprogramar Cita (${editingCita.folio})`
                  : 'Agendar Nueva Cita desde Recepción'}
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setShowFormModal(false)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              ✕ Cerrar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre del Familiar *
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  placeholder="Ej. María López"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Teléfono *
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={formTelefono}
                  onChange={(e) => setFormTelefono(e.target.value)}
                  placeholder="653 123 4567"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Interna / Prospecto
              </label>
              <div className="relative">
                <Users className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={formInterna}
                  onChange={(e) => setFormInterna(e.target.value)}
                  placeholder="Nombre de la interna"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tipo de Visita
              </label>
              <select
                value={formTipo}
                onChange={(e) => setFormTipo(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
              >
                <option value="Familiar">Familiar</option>
                <option value="Primer Ingreso">Primer Ingreso (Valoración)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Fecha de la Cita *
              </label>
              <input
                type="date"
                required
                value={formFecha}
                onChange={(e) => setFormFecha(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Hora del Bloque *
              </label>
              <select
                value={formHora}
                onChange={(e) => setFormHora(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
              >
                {['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'].map((h) => (
                  <option key={h} value={h}>
                    {h} hrs
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Estado
              </label>
              <select
                value={formEstado}
                onChange={(e) => setFormEstado(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
              >
                <option value="Confirmada">Confirmada</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Cancelada">Cancelada</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notas Clínicas / Recepción
              </label>
              <input
                type="text"
                value={formNotas}
                onChange={(e) => setFormNotas(e.target.value)}
                placeholder="Observaciones..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowFormModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingCita}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#6D28D9] to-[#0D9488] hover:opacity-95 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingCita ? 'Guardando...' : editingCita ? 'Guardar Cambios' : 'Confirmar y Agendar'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Grilla Principal: Lista Manipulable de Citas (Izquierda) + Editor de Reglas Horarias (Derecha) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Agenda Manipulable con Filtros */}
        <div className="lg:col-span-8 clinical-card rounded-3xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Control y Manipulación de Citas Agendadas
              </h2>
              <p className="text-xs text-slate-500">
                Filtra, busca por folio o teléfono, reprograma horarios o registra nuevas citas manualmente.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="self-start sm:self-auto flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Agendar Cita Manual</span>
            </button>
          </div>

          {/* Barra de Filtros y Búsqueda */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="sm:col-span-2 relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Buscar por folio, familiar, interna o teléfono..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900"
              />
            </div>

            <div>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-700"
                title="Filtrar por fecha"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-700"
              >
                <option value="Todos">Todos los estados</option>
                <option value="Confirmada">Confirmada</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Cancelada">Cancelada</option>
              </select>
              {(searchFilter || dateFilter || statusFilter !== 'Todos' || typeFilter !== 'Todos') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchFilter('');
                    setDateFilter('');
                    setStatusFilter('Todos');
                    setTypeFilter('Todos');
                  }}
                  className="px-2.5 py-2 rounded-xl bg-slate-200/80 text-[11px] font-bold text-slate-700 hover:bg-slate-300 cursor-pointer"
                  title="Limpiar filtros"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Lista de Tarjetas de Cita */}
          {filteredVisitas.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Filter className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-xs font-medium text-slate-500">
                No se encontraron citas con los filtros seleccionados.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
              {filteredVisitas.map((v) => {
                const displayDate = v.fecha || (v.fecha_hora ? v.fecha_hora.slice(0, 10) : '');
                const displayTime = v.hora || (v.fecha_hora ? v.fecha_hora.slice(11, 16) : '');
                return (
                  <div
                    key={v.id}
                    className="p-4 rounded-2xl bg-slate-50/90 hover:bg-white border border-slate-200/90 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-[#6D28D9] bg-purple-50 px-2.5 py-0.5 rounded-lg border border-purple-200">
                          {v.folio}
                        </span>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-[#0D9488] border border-teal-200">
                          {displayDate} • {displayTime} hrs
                        </span>
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-[#5B21B6] border border-purple-200">
                          {v.tipo_visita}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-600">
                          vía {v.origen}
                        </span>
                      </div>

                      <p className="text-sm font-bold text-slate-900">
                        Familiar: {v.nombre_visitante} •{' '}
                        <span className="text-xs font-semibold text-[#0D9488]">{v.telefono}</span>
                      </p>

                      <p className="text-xs text-slate-600">
                        Interna/Prospecto: <strong>{v.nombre_interno_prospecto}</strong>
                        {v.notas ? ` • Notas: ${v.notas}` : ''}
                      </p>
                    </div>

                    {/* Botonera de Manipulación Directa */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          v.estado === 'Confirmada'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : v.estado === 'Cancelada'
                            ? 'bg-red-50 text-red-600 border border-red-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {v.estado}
                      </span>

                      <button
                        type="button"
                        onClick={() => openEditModal(v)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-purple-50 text-[#6D28D9] hover:bg-purple-100 border border-purple-200 text-xs font-semibold cursor-pointer"
                        title="Editar o reprogramar fecha/hora"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Editar / Mover</span>
                      </button>

                      {v.estado !== 'Confirmada' && (
                        <button
                          type="button"
                          onClick={() => handleQuickEstado(v.id, 'Confirmada')}
                          className="p-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                          title="Confirmar cita"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}

                      {v.estado !== 'Cancelada' && (
                        <button
                          type="button"
                          onClick={() => handleQuickEstado(v.id, 'Cancelada')}
                          className="p-1.5 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 cursor-pointer"
                          title="Cancelar cita y liberar cupo"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteCita(v)}
                        className="p-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 cursor-pointer"
                        title="Eliminar registro permanentemente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Columna Derecha: Editor Completo de Horarios y Cupos por Día */}
        <div className="lg:col-span-4 space-y-6">
          <div className="clinical-card rounded-3xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#0D9488]" />
                Configuración de Horarios y Cupos
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ajusta la hora de apertura, cierre, capacidad simultánea por bloque y días abiertos.
              </p>
            </div>

            <div className="space-y-3">
              {localHorarios.map((h) => (
                <div
                  key={h.id}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{h.nombre_dia}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = { ...h, activo: !h.activo };
                        handleHorarioChange(h.dia_semana, 'activo', !h.activo);
                        handleSaveHorarioRow(updated);
                      }}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border cursor-pointer ${
                        h.activo
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-200 text-slate-500 border-slate-300'
                      }`}
                    >
                      {h.activo ? 'Abierto' : 'Cerrado'}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <label className="block text-slate-500 mb-0.5">Inicio</label>
                      <input
                        type="time"
                        value={h.hora_inicio}
                        onChange={(e) => handleHorarioChange(h.dia_semana, 'hora_inicio', e.target.value)}
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-0.5">Fin</label>
                      <input
                        type="time"
                        value={h.hora_fin}
                        onChange={(e) => handleHorarioChange(h.dia_semana, 'hora_fin', e.target.value)}
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-0.5">Cupos/hr</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={h.capacidad_por_slot}
                        onChange={(e) =>
                          handleHorarioChange(h.dia_semana, 'capacidad_por_slot', Number(e.target.value))
                        }
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={savingDayId === h.dia_semana}
                    onClick={() => handleSaveHorarioRow(h)}
                    className="w-full py-1.5 rounded-xl bg-white hover:bg-purple-50 text-[#6D28D9] border border-purple-200 text-[11px] font-bold transition-all cursor-pointer"
                  >
                    {savingDayId === h.dia_semana ? 'Guardando...' : `Guardar ${h.nombre_dia}`}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Inspector y Consola del MCP Server (`cersea-agenda-mcp`) */}
          <div className="clinical-card rounded-3xl p-6 space-y-3 border border-purple-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#6D28D9]" />
                <span>MCP Server (`cersea-agenda-mcp`)</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {mcpTools.length} Tools Activas
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Herramientas conectadas al agente para consultar disponibilidad, agendar, reprogramar y cancelar citas:
            </p>

            <div className="flex flex-wrap gap-1.5">
              {mcpTools.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => {
                    setSelectedMcpTool(t.name);
                    if (t.name === 'consulta_agenda') setMcpArgsJson('{"dias_adelante": 5}');
                    if (t.name === 'agendar')
                      setMcpArgsJson(
                        `{"nombre_visitante": "Ana García", "telefono": "6531002030", "fecha_hora": "${getTodayIso()} 12:00", "tipo_visita": "Familiar"}`
                      );
                    if (t.name === 'buscar_cita') setMcpArgsJson('{"busqueda": "CERSEA-"}');
                    if (t.name === 'reprogramar_cita')
                      setMcpArgsJson(`{"folio_o_id": "CERSEA-", "nueva_fecha_hora": "${getTodayIso()} 13:00"}`);
                    if (t.name === 'cancelar_cita') setMcpArgsJson('{"folio_o_id": "CERSEA-"}');
                    if (t.name === 'consultar_informacion_cersea') setMcpArgsJson('{"tema": "ingreso"}');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                    selectedMcpTool === t.name
                      ? 'bg-[#6D28D9] text-white border-[#6D28D9]'
                      : 'bg-purple-50/60 text-[#6D28D9] border-purple-200'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>

            <div className="space-y-2 pt-1">
              <label className="block text-[11px] font-semibold text-slate-600">
                Argumentos JSON para `{selectedMcpTool}`:
              </label>
              <textarea
                rows={2}
                value={mcpArgsJson}
                onChange={(e) => setMcpArgsJson(e.target.value)}
                className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-800"
              />
              <button
                type="button"
                disabled={runningMcp}
                onClick={handleExecuteMcpTest}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#6D28D9] to-[#0D9488] cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{runningMcp ? 'Ejecutando Tool MCP...' : `Probar Tool MCP: ${selectedMcpTool}`}</span>
              </button>
            </div>

            {mcpResultOutput && (
              <pre className="p-2.5 rounded-xl bg-slate-900 text-emerald-300 text-[10px] overflow-x-auto max-h-40">
                {mcpResultOutput}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

