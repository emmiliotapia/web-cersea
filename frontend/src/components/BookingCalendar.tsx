import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Phone, Users, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { cerseaApi } from '../services/api';
import { DisponibilidadDiaResponse, VisitaRecord } from '../types/cersea';

function getNextSaturdayDateString(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = (6 - day + 7) % 7;
  const target = new Date(now);
  target.setDate(now.getDate() + diff);
  return target.toISOString().split('T')[0];
}

export const BookingCalendar: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(getNextSaturdayDateString());
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

  const loadSlots = async (fechaStr: string) => {
    setLoadingSlots(true);
    setErrorMsg(null);
    setSelectedSlotIso('');
    try {
      const data = await cerseaApi.getAvailableSlots(fechaStr);
      setAvailability(data);
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
    loadSlots(selectedDate);
  }, [selectedDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlotIso) {
      setErrorMsg('Por favor selecciona un horario disponible.');
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
        notas
      });
      setConfirmedVisita(record);
      await loadSlots(selectedDate);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al registrar la visita');
    } finally {
      setSubmitting(false);
    }
  };

  const nextDays = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() + idx);
    const iso = d.toISOString().split('T')[0];
    const labelDia = d.toLocaleDateString('es-MX', { weekday: 'short' }).toUpperCase();
    const numDia = d.getDate();
    const mes = d.toLocaleDateString('es-MX', { month: 'short' }).toUpperCase();
    return { iso, labelDia, numDia, mes };
  });

  return (
    <section id="agendamiento-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="clinical-card-highlight rounded-3xl p-6 sm:p-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-8 border-b border-slate-200/80">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-[#0D9488] border border-teal-200 mb-2">
              Agenda de Citas y Visitas en Línea
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Reserva una Visita Familiar o Cita de Valoración
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Elige el día y horario que mejor se adapte a tu familia, o solicita apoyo en el chat de orientación.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadSlots(selectedDate)}
            className="self-start md:self-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-[#6D28D9] bg-white border border-slate-200 hover:border-purple-300 shadow-2xs transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingSlots ? 'animate-spin text-[#6D28D9]' : ''}`} />
            <span>Actualizar Horarios</span>
          </button>
        </div>

        {confirmedVisita ? (
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
                Ubicación: Cjon. Oaxaca y 23 #2301 / Cjon. Jalisco, San Luis Río Colorado • Tel: 653 534 6760
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
            {/* Columna Izquierda: Selector de Fecha y Bloques de Horario */}
            <div className="lg:col-span-7 space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
                  1. Selecciona el Día de tu Visita
                </label>

                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-4">
                  {nextDays.map((d) => {
                    const isSelected = selectedDate === d.iso;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => setSelectedDate(d.iso)}
                        className={`p-2.5 rounded-2xl text-center border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#6D28D9] text-white border-[#6D28D9] font-bold shadow-md shadow-purple-500/20'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                        }`}
                      >
                        <span className="block text-[10px] opacity-80 font-semibold">{d.labelDia}</span>
                        <span className="block text-lg font-bold leading-tight">{d.numDia}</span>
                        <span className="block text-[10px] opacity-80">{d.mes}</span>
                      </button>
                    );
                  })}
                </div>

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
                      {availability.nombre_dia}
                    </span>
                  )}
                </div>
              </div>

              {/* Grilla de Horarios Disponibles */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
                  2. Elige un Horario Disponible ({selectedDate})
                </label>

                {loadingSlots ? (
                  <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs font-medium text-slate-500">
                    Consultando horarios disponibles...
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
                              {slot.disponible ? `${slot.cupos_disponibles} disp.` : 'Ocupado'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                    No hay bloques de visita habilitados para este día. Por favor selecciona otro día de la semana.
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
                3. Datos del Familiar o Solicitante
              </h3>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-red-700 font-medium">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tipo de Visita *
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
                      {tipo}
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

              <button
                type="submit"
                disabled={submitting || !selectedSlotIso}
                className="w-full py-3.5 px-6 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#6D28D9] to-[#0D9488] hover:opacity-95 disabled:opacity-40 shadow-md shadow-purple-500/20 transition-all cursor-pointer"
              >
                {submitting
                  ? 'Confirmando tu cita...'
                  : selectedSlotIso
                  ? `Confirmar Cita (${selectedSlotIso.slice(11, 16)} hrs)`
                  : 'Selecciona un horario disponible'}
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
};
