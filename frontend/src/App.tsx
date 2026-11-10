import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { BookingCalendar } from './components/BookingCalendar';
import { OmnichannelChatWidget } from './components/OmnichannelChatWidget';
import { AdminPanel } from './components/AdminPanel';

function checkIsAdminRoute(): boolean {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  return path === '/admin' || path === '/panel' || hash === '#admin' || hash === '#/admin';
}

export function App() {
  const [activeView, setActiveView] = useState<'public' | 'admin'>(
    checkIsAdminRoute() ? 'admin' : 'public'
  );
  const [chatOpen, setChatOpen] = useState<boolean>(false);
  const [chatPrompt, setChatPrompt] = useState<string | null>(null);

  useEffect(() => {
    const syncRoute = () => {
      setActiveView(checkIsAdminRoute() ? 'admin' : 'public');
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  const handleViewChange = (view: 'public' | 'admin') => {
    setActiveView(view);
    if (view === 'admin') {
      window.history.pushState({}, '', '/admin');
    } else {
      window.history.pushState({}, '', '/');
    }
  };

  const handleOpenChatWithPrompt = (promptText?: string) => {
    setChatOpen(true);
    if (promptText) {
      setChatPrompt(promptText);
    }
  };

  const handleScrollToBooking = () => {
    if (activeView !== 'public') {
      handleViewChange('public');
      setTimeout(() => {
        document.getElementById('agendamiento-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } else {
      document.getElementById('agendamiento-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-slate-800">
      <Navbar
        activeView={activeView}
        onChangeView={handleViewChange}
        onOpenChat={() => setChatOpen(true)}
        onScrollToBooking={handleScrollToBooking}
      />

      <main className="flex-1">
        {activeView === 'public' ? (
          <>
            <HeroSection
              onOpenChatWithPrompt={handleOpenChatWithPrompt}
              onScrollToBooking={handleScrollToBooking}
            />
            <BookingCalendar />
          </>
        ) : (
          <AdminPanel />
        )}
      </main>

      {/* Footer Clínico Claro con Logo Oficial */}
      <footer className="border-t border-slate-200/80 bg-white py-10 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <img
              src="/assets/logo.jpg"
              alt="CERSEA A.C. S.C."
              className="w-10 h-10 rounded-xl bg-white p-0.5 border border-purple-200 object-contain shadow-2xs"
            />
            <div>
              <span className="text-slate-900 font-bold">CERSEA A.C. S.C.</span> — Centro de Rehabilitación
              para Mujeres "Sembrando Amor"
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-medium text-slate-600">
            <span>Cjon. Oaxaca y 23 #2301 / Cjon. Jalisco (SLRC, Sonora)</span>
            <span className="text-[#6D28D9]">•</span>
            <span>Tel: 653 534 6760 / 653 123 2800</span>
          </div>
        </div>
      </footer>

      {/* Widget Omnicanal Persistente */}
      <OmnichannelChatWidget
        isOpen={chatOpen}
        onToggleOpen={setChatOpen}
        externalPrompt={chatPrompt}
        onClearExternalPrompt={() => setChatPrompt(null)}
      />
    </div>
  );
}

export default App;
