import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  User,
  Phone,
  Users,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Edit3,
  XCircle,
  MessageSquare,
  FileText
} from 'lucide-react';
import { cerseaApi } from '../services/api';
import { DisponibilidadDiaResponse, ResumenDiaDisponibilidad, VisitaRecord } from '../types/cersea';

interface BookingCalendarProps {
  onOpenChatWithPrompt?: (promptText?: string) => void;
}

function getTodayIsoString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const BookingCalendar: React.FC<BookingCalendarProps> = ({ onOpenChatWithPrompt }) => {
  const [modeTab, setModeTab] = useState<'reservar' | 'gestionar'>('reservar');

  const [selectedDate, setSelectedDate] = useState<string>(getTodayIsoString());
  const [upcomingDays, setUpcomingDays] = useState<ResumenDiaDisponibilidad[]>([]);
  const [availability, setAvailability] = useState<DisponibilidadDiaResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [selectedSlotIso, setSelectedSlotIso] = useState<string>('');

  const [nombreVisitante, setNombreVisitante] = useState('');
  const [telefono, setTelefono] = useState('');
  const [nombreInterno, setNombreInterno] = useState('');
  const [tipoVisita, setTipoVisita] = useState<'Primer Ingreso' | 'Familiar'>('Familiar');
  const [notas, setNotas] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedVisita, setConfirmedVisita] = useState<VisitaRecord | null>(null);

  // Estado para "Consultar / Reprogramar mi Cita" desde el Home
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingCita, setSearchingCita] = useState(false);
  const [foundCitas, setFoundCitas] = useState<VisitaRecord[]>([]);
  const [rescheduleTarget, setRescheduleTarget] = useState<VisitaRecord | null>(null);
  const [newRescheduleDate, setNewRescheduleDate] = useState<string>(getTodayIsoString());
  const [newRescheduleTime, setNewRescheduleTime] = useState<string>('11:00');
  const [manageFeedback, setManageFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadSummaryAndSlots = async (fechaStr: string) => {
    setLoadingSlots(true);
    setErrorMsg(null);
    setSelectedSlotIso('');
    try {
      const [data, summary] = await Promise.all([
        cerseaApi.getAvailableSlots(fechaStr),
        cerseaApi.getUpcomingAvailabilitySummary(10)
      ]);
      setAvailability(data);
      setUpcomingDays(summary);
      const firstFree = data.slots.find((s) => s.disponible);
      if (firstFree) {
        setSelectedSlotIso(firstFree.fecha_hora_iso);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudieron cargar los horarios');
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    loadSummaryAndSlots(selectedDate);
  }, [selectedDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlotIso) {
      setErrorMsg('Por favor selecciona un horario disponible en el paso 2.');
      return;
    }
    if (!nombreVisitante.trim() || !telefono.trim()) {
      setErrorMsg('Por favor ingresa tu nombre completo y teléfono de contacto.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const record = await cerseaApi.createVisita({
        nombre_visitante: nombreVisitante,
        telefono,
        nombre_interno_prospecto: nombreInterno,
        tipo_visita: tipoVisita,
        fecha_hora: selectedSlotIso,
        notas,
        origen: 'home_ui'
      });
      setConfirmedVisita(record);
      await loadSummaryAndSlots(selectedDate);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al registrar la visita');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSearchMyCita = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchingCita(true);
    setManageFeedback(null);
    try {
      const results = await cerseaApi.listVisitas({ q: searchQuery.trim() });
      setFoundCitas(results);
      if (results.length === 0) {
        setManageFeedback({
          type: 'err',
          msg: 'No encontramos ninguna cita con ese Folio o Teléfono. Verifica tus datos.'
        });
      }
    } catch (err: any) {
      setManageFeedback({ type: 'err', msg: err.message || 'Error al buscar cita' });
    } finally {
      setSearchingCita(false);
    }
  };

  const handleRescheduleFromHome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;
    try {
      const updated = await cerseaApi.updateOrRescheduleVisita(rescheduleTarget.id, {
        nueva_fecha_hora: `${newRescheduleDate}T${newRescheduleTime}:00-07:00`,
        estado: 'Confirmada'
      });
      setFoundCitas((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setRescheduleTarget(null);
      setManageFeedback({
        type: 'ok',
        msg: `¡Cita ${updated.folio} reprogramada exitosamente para el ${updated.fecha} a las ${updated.hora} hrs!`
      });
      loadSummaryAndSlots(selectedDate);
    } catch (err: any) {
      setManageFeedback({ type: 'err', msg: err.message });
    }
  };

  const handleCancelFromHome = async (cita: VisitaRecord) => {
    try {
      await cerseaApi.updateVisitaEstado(cita.id, 'Cancelada');
      setFoundCitas((prev) =>
        prev.map((c) => (c.id === cita.id ? { ...c, estado: 'Cancelada' } : c))
      );
      setManageFeedback({
        type: 'ok',
        msg: `La cita ${cita.folio} fue cancelada y el horario quedó liberado.`
      });
      loadSummaryAndSlots(selectedDate);
    } catch (err: any) {
      setManageFeedback({ type: 'err', msg: err.message });
    }
  };

  return (
    <section id="agendamiento-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="clinical-card-highlight rounded-3xl p-6 sm:p-10">
        {/* Encabezado y Selector de Modo (Agendar Cita vs Consultar/Reprogramar Folio) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-[#0D9488] border border-teal-200 mb-2">
              Sistema Interactivo de Agenda Clínica • En Tiempo Real
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Agenda tu Visita Familiar o Cita de Valoración
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Reserva directamente aquí en 3 pasos, consulta tu folio o pídele al asistente en el chat que agende por ti.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setModeTab('reservar')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                modeTab === 'reservar'
                  ? 'bg-[#6D28D9] text-white border-[#6D28D9] shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Agendar Nueva Cita</span>
            </button>

            <button
              type="button"
              onClick={() => setModeTab('gestionar')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                modeTab === 'gestionar'
                  ? 'bg-[#6D28D9] text-white border-[#6D28D9] shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Consultar / Reprogramar mi Cita</span>
            </button>

            {onOpenChatWithPrompt && (
              <button
                type="button"
                onClick={() =>
                  onOpenChatWithPrompt(
                    'Hola, ¿me muestras qué horarios tienen disponibles en la agenda para programar una cita?'
                  )
                }
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-[#0D9488] bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-all cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Agendar con el Asistente IA</span>
              </button>
            )}
          </div>
        </div>

        {/* MODO 2: CONSULTAR, REPROGRAMAR O CANCELAR CITA CON FOLIO O TELÉFONO */}
        {modeTab === 'gestionar' ? (
          <div className="mt-8 space-y-6">
            <form onSubmit={handleSearchMyCita} className="flex flex-col sm:flex-row gap-3 max-w-2xl">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ingresa tu Folio (ej. CERSEA-...) o tu número de teléfono..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#6D28D9]"
                />
              </div>
              <button
                type="submit"
                disabled={searchingCita}
                className="px-6 py-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#6D28D9] to-[#0D9488] hover:opacity-95 cursor-pointer"
              >
                {searchingCita ? 'Buscando...' : 'Buscar mi Cita'}
              </button>
            </form>

            {manageFeedback && (
              <div
                className={`p-4 rounded-2xl text-xs font-semibold border ${
                  manageFeedback.type === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {manageFeedback.msg}
              </div>
            )}

            {rescheduleTarget && (
              <form
                onSubmit={handleRescheduleFromHome}
                className="p-5 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-4 max-w-xl"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">
                    Reprogramar Cita Folio <span className="text-[#6D28D9]">{rescheduleTarget.folio}</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setRescheduleTarget(null)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Cancelar
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nueva Fecha</label>
                    <input
                      type="date"
                      value={newRescheduleDate}
                      onChange={(e) => setNewRescheduleDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nueva Hora</label>
                    <select
                      value={newRescheduleTime}
                      onChange={(e) => setNewRescheduleTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs"
                    >
                      {['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'].map((h) => (
                        <option key={h} value={h}>
                          {h} hrs
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] cursor-pointer"
                >
                  Confirmar Nuevo Horario
                </button>
              </form>
            )}

            {foundCitas.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {foundCitas.map((c) => (
                  <div
                    key={c.id}
                    className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#6D28D9] bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200">
                          {c.folio}
                        </span>
                        <span
                          className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                            c.estado === 'Confirmada'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : c.estado === 'Cancelada'
                              ? 'bg-red-50 text-red-600 border border-red-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {c.estado}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-900">{c.nombre_visitante}</p>
                      <p className="text-xs text-slate-600">
                        Interna/Prospecto: <strong>{c.nombre_interno_prospecto}</strong> ({c.tipo_visita})
                      </p>
                      <p className="text-xs font-semibold text-[#0D9488]">
                        Fecha: {c.fecha || c.fecha_hora?.slice(0, 10)} • Hora: {c.hora || c.fecha_hora?.slice(11, 16)} hrs
                      </p>
                    </div>

                    {c.estado !== 'Cancelada' && (
                      <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setRescheduleTarget(c);
                            setNewRescheduleDate(c.fecha || getTodayIsoString());
                            setNewRescheduleTime(c.hora || '11:00');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-50 text-[#6D28D9] hover:bg-purple-100 border border-purple-200 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Reprogramar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelFromHome(c)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancelar Cita</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : confirmedVisita ? (
          /* TARJETA DE CONFIRMACIÓN DE CITA */
          <div className="mt-8 p-6 sm:p-8 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-5">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-700" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                  Cita Confirmada en CERSEA A.C. S.C.
                </span>
                <h3 className="text-xl font-bold text-slate-900">
                  Folio de Reservación: <span className="text-[#6D28D9]">{confirmedVisita.folio}</span>
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs">
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                <span className="text-slate-500 font-medium block">Familiar / Visitante</span>
                <span className="text-slate-900 font-bold text-sm mt-1 block">
                  {confirmedVisita.nombre_visitante}
                </span>
                <span className="text-[#0D9488] font-semibold block mt-0.5">{confirmedVisita.telefono}</span>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                <span className="text-slate-500 font-medium block">Fecha y Hora Reservada</span>
                <span className="text-slate-900 font-bold text-sm mt-1 block">
                  {confirmedVisita.fecha || selectedDate} • {confirmedVisita.hora || selectedSlotIso.slice(11, 16)} hrs
                </span>
                <span className="text-[#6D28D9] font-semibold block mt-0.5">{confirmedVisita.tipo_visita}</span>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                <span className="text-slate-500 font-medium block">Interna / Prospecto</span>
                <span className="text-slate-900 font-bold text-sm mt-1 block">
                  {confirmedVisita.nombre_interno_prospecto || 'Por especificar en recepción'}
                </span>
                <span className="text-emerald-700 font-semibold block mt-0.5">Estado: {confirmedVisita.estado}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-emerald-200/70">
              <p className="text-xs text-slate-600">
                Guarda tu folio <strong>{confirmedVisita.folio}</strong> por si deseas reprogramar tu cita más adelante.
              </p>
              <button
                type="button"
                onClick={() => {
                  setConfirmedVisita(null);
                  setNombreVisitante('');
                  setTelefono('');
                  setNombreInterno('');
                  setNotas('');
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] cursor-pointer"
              >
                Agendar otra visita
              </button>
            </div>
          </div>
        ) : (
          /* MODO 1: AGENDAR NUEVA CITA DESDE EL HOME */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
            {/* Columna Izquierda: Selector de Fecha con Indicador de Cupos Reales y Grilla de Horarios */}
            <div className="lg:col-span-7 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    1. Selecciona el Día en la Agenda
                  </label>
                  <button
                    type="button"
                    onClick={() => loadSummaryAndSlots(selectedDate)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6D28D9] hover:underline cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingSlots ? 'animate-spin' : ''}`} />
                    <span>Sincronizar cupos</span>
                  </button>
                </div>

                {/* Carrusel de Próximos Días con Cupos Reales */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-4">
                  {(upcomingDays.length > 0
                    ? upcomingDays.slice(0, 10)
                    : Array.from({ length: 5 }, (_, idx) => {
                        const d = new Date();
                        d.setDate(d.getDate() + idx);
                        const iso = d.toISOString().split('T')[0];
                        return {
                          fecha: iso,
                          nombre_dia: d.toLocaleDateString('es-MX', { weekday: 'long' }),
                          activo: true,
                          total_bloques_libres: 6,
                          total_cupos_libres: 12,
                          horas_disponibles: []
                        };
                      })
                  ).map((dayInfo) => {
                    const isSelected = selectedDate === dayInfo.fecha;
                    const dayNum = dayInfo.fecha.slice(8, 10);
                    const monthShort = new Date(`${dayInfo.fecha}T12:00:00`).toLocaleDateString('es-MX', {
                      month: 'short'
                    });
                    return (
                      <button
                        key={dayInfo.fecha}
                        type="button"
                        onClick={() => setSelectedDate(dayInfo.fecha)}
                        className={`p-3 rounded-2xl text-left border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#6D28D9] text-white border-[#6D28D9] shadow-md shadow-purple-500/20'
                            : !dayInfo.activo
                            ? 'bg-slate-100 text-slate-400 border-slate-200'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase truncate">
                            {dayInfo.nombre_dia.slice(0, 3)}
                          </span>
                          <span className="text-[10px] opacity-80 uppercase">{monthShort}</span>
                        </div>
                        <span className="block text-xl font-bold leading-tight my-0.5">{dayNum}</span>
                        <span
                          className={`block text-[10px] font-semibold truncate ${
                            isSelected
                              ? 'text-purple-100'
                              : dayInfo.activo && dayInfo.total_cupos_libres > 0
                              ? 'text-[#0D9488]'
                              : 'text-red-500'
                          }`}
                        >
                          {dayInfo.activo
                            ? `${dayInfo.total_cupos_libres} cupos libres`
                            : 'Cerrado'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Selector de Fecha Manual para cualquier día del calendario */}
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Calendar className="w-4 h-4 text-[#6D28D9] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 font-medium focus:outline-none focus:border-[#6D28D9]"
                    />
                  </div>
                  {availability && (
                    <span className="px-4 py-2.5 rounded-xl bg-purple-50 border border-purple-200 text-xs font-bold text-[#6D28D9]">
                      {availability.nombre_dia} ({selectedDate})
                    </span>
                  )}
                </div>
              </div>

              {/* Grilla de Horarios Disponibles */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
                  2. Elige un Bloque de Horario Disponible
                </label>

                {loadingSlots ? (
                  <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs font-medium text-slate-500">
                    Consultando agenda en tiempo real...
                  </div>
                ) : availability && availability.slots.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {availability.slots.map((slot) => {
                      const isChosen = selectedSlotIso === slot.fecha_hora_iso;
                      return (
                        <button
                          key={slot.fecha_hora_iso}
                          type="button"
                          disabled={!slot.disponible}
                          onClick={() => setSelectedSlotIso(slot.fecha_hora_iso)}
                          className={`p-3.5 rounded-2xl text-left border transition-all cursor-pointer ${
                            !slot.disponible
                              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                              : isChosen
                              ? 'bg-purple-50 border-2 border-[#6D28D9] text-slate-900 shadow-sm'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-purple-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-sm font-bold">
                              <Clock className="w-4 h-4 text-[#6D28D9]" />
                              {slot.hora} hrs
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                slot.disponible
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-red-50 text-red-600 border border-red-200'
                              }`}
                            >
                              {slot.disponible ? `${slot.cupos_disponibles} disp.` : 'Lleno'}
                            </span>
                          </div>
                          <div className="mt-1.5 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#0D9488]"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round((slot.ocupados / Math.max(1, slot.capacidad_maxima)) * 100)
                                )}%`
                              }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                    No hay bloques de visita habilitados para este día. Por favor selecciona otro día en el calendario.
                  </div>
                )}
              </div>
            </div>

            {/* Columna Derecha: Formulario de Datos del Familiar */}
            <form
              onSubmit={handleSubmit}
              className="lg:col-span-5 space-y-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#6D28D9] border-b border-slate-100 pb-3">
                3. Datos para Confirmar tu Cita
              </h3>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-red-700 font-medium">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tipo de Visita o Cita *
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['Familiar', 'Primer Ingreso'] as const).map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setTipoVisita(tipo)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        tipoVisita === tipo
                          ? 'bg-purple-50 border-[#6D28D9] text-[#6D28D9] font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {tipo === 'Familiar' ? 'Visita Familiar' : 'Valoración / 1er Ingreso'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nombre Completo del Familiar *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Ej. María Guadalupe López"
                    value={nombreVisitante}
                    onChange={(e) => setNombreVisitante(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50/70 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-[#6D28D9]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Teléfono de Contacto (WhatsApp) *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    placeholder="Ej. 653 123 4567"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50/70 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-[#6D28D9]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nombre de la Interna o Prospecto
                </label>
                <div className="relative">
                  <Users className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Nombre de tu familiar"
                    value={nombreInterno}
                    onChange={(e) => setNombreInterno(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50/70 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-[#6D28D9]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Notas o Comentarios Opcionales
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder="Ej. Solicito informes de valoración médica..."
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50/70 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-[#6D28D9]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !selectedSlotIso}
                className="w-full py-3.5 px-6 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#6D28D9] to-[#0D9488] hover:opacity-95 disabled:opacity-40 shadow-md shadow-purple-500/20 transition-all cursor-pointer"
              >
                {submitting
                  ? 'Confirmando tu cita en la agenda...'
                  : selectedSlotIso
                  ? `Confirmar Cita (${selectedDate} • ${selectedSlotIso.slice(11, 16)} hrs)`
                  : 'Selecciona un horario disponible'}
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
};
