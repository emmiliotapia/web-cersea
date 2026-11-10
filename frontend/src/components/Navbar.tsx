import React from 'react';
import { Calendar, MessageSquare, PhoneCall, MapPin, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  activeView: 'public' | 'admin';
  onChangeView: (view: 'public' | 'admin') => void;
  onOpenChat: () => void;
  onScrollToBooking: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  onChangeView,
  onOpenChat,
  onScrollToBooking
}) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      {/* Barra superior informativa clínica */}
      <div className="bg-gradient-to-r from-[#5B21B6] via-[#6D28D9] to-[#0D9488] text-white text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
            Centro de Rehabilitación Femenil Certificado en San Luis Río Colorado, Sonora
          </span>
          <div className="hidden sm:flex items-center gap-5 text-white/95">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-200" />
              Cjon. Oaxaca y 23 #2301 • Cjon. Jalisco
            </span>
            <a href="tel:6535346760" className="font-semibold hover:underline">
              Tel: 653 534 6760 / 653 123 2800
            </a>
          </div>
        </div>
      </div>

      {/* Barra principal de navegación */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Identidad Institucional CERSEA con Logo Oficial */}
        <a
          href="/"
          onClick={(e) => {
            if (activeView === 'admin') {
              e.preventDefault();
              window.history.pushState({}, '', '/');
              onChangeView('public');
            }
          }}
          className="flex items-center gap-3.5 cursor-pointer group"
        >
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white p-1 border border-purple-200 shadow-sm group-hover:border-purple-400 transition-all shrink-0">
            <img
              src="/assets/logo.jpg"
              alt="Logo CERSEA A.C. S.C. Sembrando Amor"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-bold text-xl tracking-tight text-slate-900">
                CERSEA <span className="text-[#6D28D9]">A.C. S.C.</span>
              </span>
              <span className="hidden md:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-[#6D28D9] border border-purple-200">
                Sembrando Amor
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Centro de Rehabilitación Integral para Mujeres
            </p>
          </div>
        </a>

        {/* Controles y Navegación Pública (Sin exponer botón de Admin al público) */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {activeView === 'public' ? (
            <>
              <a
                href="tel:6535346760"
                className="hidden lg:flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-[#6D28D9] border border-slate-200 hover:border-purple-300 bg-slate-50/70 transition-all"
              >
                <PhoneCall className="w-3.5 h-3.5 text-[#0D9488]" />
                653 534 6760
              </a>

              <button
                onClick={onScrollToBooking}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-[#5B21B6] bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-all cursor-pointer"
              >
                <Calendar className="w-4 h-4 text-[#6D28D9]" />
                <span className="hidden sm:inline">Agendar Visita o Valoración</span>
              </button>

              <button
                onClick={onOpenChat}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#6D28D9] to-[#0D9488] hover:opacity-95 shadow-md shadow-purple-500/15 transition-all cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Orientación en Línea</span>
              </button>
            </>
          ) : (
            /* Solo cuando ya estás dentro del endpoint /admin muestra opción de ir a la web pública */
            <button
              onClick={() => {
                window.history.pushState({}, '', '/');
                onChangeView('public');
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-purple-50 text-[#6D28D9] border border-purple-200 hover:bg-purple-100 transition-all cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Ir a la Página Pública</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
