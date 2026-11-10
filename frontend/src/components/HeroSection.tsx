import React from 'react';
import {
  Brain,
  GraduationCap,
  Heart,
  Shield,
  MapPin,
  Phone,
  Stethoscope,
  MessageSquare,
  CalendarCheck,
  CheckCircle2,
  ArrowRight,
  Award,
  Sparkles,
  UserCheck
} from 'lucide-react';

interface HeroSectionProps {
  onOpenChatWithPrompt: (promptText?: string) => void;
  onScrollToBooking: () => void;
}

const PILARES = [
  {
    badge: 'Atención Clínica',
    title: 'Psicología, Psiquiatría y Doctora',
    subtitle: 'Profesionales de la Salud Titulados',
    description:
      'Valoración médica continua, terapia psicológica individual y familiar, psiquiatría especializada y consejería certificada en adicciones.',
    icon: Brain,
    accent: 'bg-purple-50 text-[#6D28D9] border-purple-100',
    naturalQuestion: 'Hola, me gustaría saber cómo funciona la atención psicológica y médica para una familiar.'
  },
  {
    badge: 'Desarrollo Femenino',
    title: 'Convenio CUSON y Emprendimiento',
    subtitle: 'Talleres de Emprendimiento para la Mujer',
    description:
      'Capacitación práctica y herramientas laborales para que cada mujer reconstruya su proyecto de vida con autonomía y seguridad.',
    icon: Shield,
    accent: 'bg-teal-50 text-[#0D9488] border-teal-100',
    naturalQuestion: 'Hola, ¿qué talleres de emprendimiento y actividades tienen para las mujeres?'
  },
  {
    badge: 'Educación Oficial',
    title: 'Convenio Educativo ISEA',
    subtitle: 'Primaria y Secundaria Certificada',
    description:
      'Acompañamiento pedagógico dentro del centro para iniciar, continuar o concluir estudios con validez oficial mientras avanza su recuperación.',
    icon: GraduationCap,
    accent: 'bg-purple-50 text-[#6D28D9] border-purple-100',
    naturalQuestion: 'Hola, ¿cómo pueden continuar sus estudios de primaria o secundaria con ISEA?'
  },
  {
    badge: 'Restauración Espiritual',
    title: 'Doctrina Cristiana y Valores',
    subtitle: 'Sembrando Amor y Esperanza',
    description:
      'Un entorno cálido, humano y respetuoso cimentado en el amor cristiano, el perdón y la restauración profunda del vínculo familiar.',
    icon: Heart,
    accent: 'bg-rose-50 text-rose-600 border-rose-100',
    naturalQuestion: 'Hola, ¿cómo es el acompañamiento espiritual y familiar dentro del centro?'
  }
];

const SERVICIOS_CERTIFICADOS = [
  'Tratamiento con profesionales de la salud titulados y certificados',
  'Consejería especializada en adicciones',
  'Psicología clínica individual, grupal y familiar',
  'Doctora (Valoración y seguimiento médico general)',
  'Psiquiatra especialista en salud mental',
  'Análisis de laboratorios clínicos',
  'Doctrina cristiana y acompañamiento espiritual',
  'Alimentación sana, balanceada y supervisada',
  'Estudios con validez oficial ISEA y Convenio CUSON',
  'Talleres de emprendimiento para la mujer'
];

export const HeroSection: React.FC<HeroSectionProps> = ({
  onOpenChatWithPrompt,
  onScrollToBooking
}) => {
  return (
    <div className="space-y-20 pb-16">
      {/* HERO CLÍNICO CÁLIDO Y LUMINOSO */}
      <section className="relative pt-8 sm:pt-14 pb-8 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Columna Izquierda: Mensaje de Confianza, Empatía y Esperanza */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-50 border border-purple-200/80 text-[#5B21B6]">
                <UserCheck className="w-4 h-4 text-[#0D9488]" />
                <span className="text-xs font-semibold tracking-wide">
                  Clínica y Centro de Rehabilitación Exclusivo para Mujeres
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-bold text-slate-900 leading-[1.12]">
                Un refugio profesional y humano para{' '}
                <span className="text-[#6D28D9] italic">sanar el corazón</span> y recuperar tu vida.
              </h1>

              <p className="text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
                En <strong className="text-slate-900 font-semibold">CERSEA A.C. S.C. ("Sembrando Amor")</strong>{' '}
                acompañamos a cada mujer y a su familia con un equipo multidisciplinario de{' '}
                <strong className="text-[#0D9488] font-semibold">
                  profesionales de la salud titulados y certificados
                </strong>{' '}
                (Doctora, Psiquiatra, Psicología y Consejería), nutrición, estudios ISEA y principios cristianos en San Luis Río Colorado.
              </p>

              {/* Botones Principales de Acción */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  onClick={() => onOpenChatWithPrompt()}
                  className="flex items-center gap-3 px-6 py-4 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-[#6D28D9] to-[#5B21B6] hover:from-[#5B21B6] hover:to-[#4C1D95] shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Hablar con Orientación Familiar (24/7)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={onScrollToBooking}
                  className="flex items-center gap-3 px-6 py-4 rounded-2xl text-sm font-semibold text-slate-800 bg-white hover:bg-purple-50/60 border border-slate-200 hover:border-purple-300 shadow-xs transition-all cursor-pointer"
                >
                  <CalendarCheck className="w-4 h-4 text-[#0D9488]" />
                  <span>Agendar Cita de Valoración o Visita</span>
                </button>
              </div>

              {/* Preguntas Frecuentes Rápidas Naturales */}
              <div className="pt-5 border-t border-slate-200/80">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  ¿En qué podemos ayudarte hoy? Toca una opción para conversar:
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      label: '¿Cómo puedo ingresar a una familiar?',
                      prompt: 'Hola, quisiera pedir informes sobre cómo es el proceso para ingresar a una familiar.'
                    },
                    {
                      label: '¿Qué cosas debemos llevar el primer día?',
                      prompt: 'Hola, ¿qué ropa o artículos personales necesitamos llevar para un primer ingreso?'
                    },
                    {
                      label: '¿Dónde están y a qué teléfono marco?',
                      prompt: 'Hola, ¿me podrías compartir su dirección exacta y los teléfonos de contacto?'
                    },
                    {
                      label: 'Agendar una visita este fin de semana',
                      prompt: 'Hola, me gustaría agendar una visita familiar para este fin de semana.'
                    }
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => onOpenChatWithPrompt(item.prompt)}
                      className="text-xs font-medium px-3.5 py-2 rounded-xl bg-white text-slate-700 border border-slate-200/90 hover:border-[#6D28D9] hover:text-[#6D28D9] hover:bg-purple-50/40 shadow-2xs transition-all cursor-pointer"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Columna Derecha: Tarjeta Clínica con Fotografía de Instalaciones y Especialidades */}
            <div className="lg:col-span-5">
              <div className="clinical-card-highlight rounded-3xl overflow-hidden">
                {/* Fotografía Real de Instalaciones CERSEA */}
                <div className="relative h-64 sm:h-72 w-full bg-slate-100 overflow-hidden">
                  <img
                    src="/assets/portada.jpg"
                    alt="Instalaciones de CERSEA A.C. S.C. en San Luis Río Colorado"
                    className="w-full h-full object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/15 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                    <div className="px-3.5 py-2 rounded-xl bg-white/95 backdrop-blur-md shadow-md">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#0D9488] block">
                        Instalaciones Seguras y Dignas
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        Cjon. Oaxaca y 23 #2301 • Cjon. Jalisco
                      </span>
                    </div>
                    <img
                      src="/assets/logo.jpg"
                      alt="Logo CERSEA"
                      className="w-16 h-16 rounded-2xl bg-white p-1 border-2 border-purple-200 shadow-lg object-contain shrink-0"
                    />
                  </div>
                </div>

                {/* Detalles Médicos y Contacto */}
                <div className="p-6 sm:p-7 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                    <div className="flex items-center gap-2">
                      <Stethoscope className="w-5 h-5 text-[#6D28D9]" />
                      <span className="text-sm font-bold text-slate-900">
                        Atención Médica y Terapéutica Integral
                      </span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Certificado
                    </span>
                  </div>

                  {/* Especialidades Clave */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      'Doctora y Psiquiatra',
                      'Psicología Clínica',
                      'Consejería en Adicciones',
                      'Laboratorios Clínicos',
                      'Talleres para la Mujer',
                      'Estudios ISEA y CUSON'
                    ].map((srv) => (
                      <div
                        key={srv}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-700 text-xs font-medium"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                        <span className="truncate">{srv}</span>
                      </div>
                    ))}
                  </div>

                  {/* Direcciones y Teléfonos Directos */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                    <div className="p-3.5 rounded-2xl bg-purple-50/50 border border-purple-100">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#6D28D9] mb-1">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Ubicaciones SLRC</span>
                      </div>
                      <p className="text-xs text-slate-800 font-semibold">• Cjon. Oaxaca y 23 #2301</p>
                      <p className="text-xs text-slate-600">• Callejón Jalisco</p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-teal-50/50 border border-teal-100">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#0D9488] mb-1">
                        <Phone className="w-3.5 h-3.5" />
                        <span>Líneas de Apoyo</span>
                      </div>
                      <a
                        href="tel:6535346760"
                        className="block text-xs font-bold text-slate-900 hover:text-[#6D28D9]"
                      >
                        653 534 6760
                      </a>
                      <a
                        href="tel:6531232800"
                        className="block text-xs font-medium text-slate-600 hover:text-[#6D28D9] mt-0.5"
                      >
                        653 123 2800
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN DE LOS 4 PILARES DE REHABILITACIÓN */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
          <span className="inline-block px-3.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-[#6D28D9] border border-purple-200">
            Modelo de Sanación Integral
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
            Los 4 Pilares de Restauración en CERSEA
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Un programa diseñado especialmente para la mujer, integrando salud médica, emocional, educación oficial y acompañamiento espiritual.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PILARES.map((pilar) => {
            const IconComponent = pilar.icon;
            return (
              <div
                key={pilar.title}
                className="clinical-card rounded-3xl p-6 hover:border-purple-300 transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${pilar.accent}`}>
                      {pilar.badge}
                    </span>
                    <div className="w-11 h-11 rounded-2xl bg-purple-50/70 border border-purple-100 flex items-center justify-center group-hover:bg-[#6D28D9] group-hover:text-white text-[#6D28D9] transition-colors">
                      <IconComponent className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{pilar.title}</h3>
                  <p className="text-xs font-semibold text-[#0D9488] mb-3">{pilar.subtitle}</p>
                  <p className="text-sm text-slate-600 leading-relaxed">{pilar.description}</p>
                </div>

                <button
                  onClick={() => onOpenChatWithPrompt(pilar.naturalQuestion)}
                  className="mt-6 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#6D28D9] group-hover:text-[#4C1D95] transition-colors cursor-pointer"
                >
                  <span>Preguntar sobre esta área</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECCIÓN DETALLADA DE SERVICIOS CLÍNICOS Y FLYER OFICIAL */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="clinical-card rounded-3xl p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-gradient-to-br from-white via-purple-50/30 to-teal-50/30">
          <div className="lg:col-span-6 space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0D9488]">
              <Award className="w-4 h-4" />
              <span>Atención Profesional y Certificada</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Terapia Integral para Liberarte de Problemas de Adicción
            </h3>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              En nuestras sedes de <strong className="text-slate-900">Callejón Oaxaca y 23 #2301</strong> y{' '}
              <strong className="text-slate-900">Callejón Jalisco</strong> brindamos todas las áreas clínicas y formativas bajo un mismo techo:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
              {SERVICIOS_CERTIFICADOS.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80 shadow-2xs"
                >
                  <Sparkles className="w-4 h-4 text-[#6D28D9] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-2xl overflow-hidden border border-purple-200/80 shadow-xl bg-white">
              <img
                src="/assets/portada.jpg"
                alt="Servicios e Instalaciones CERSEA A.C. S.C."
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
