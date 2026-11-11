import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send, Wifi, WifiOff, Minimize2 } from 'lucide-react';
import { cerseaApi, getWsBaseUrl } from '../services/api';
import { ChatMarkdownRenderer } from './ChatMarkdownRenderer';

interface ChatMsg {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  displayedText?: string;
  isStreaming?: boolean;
  timestamp: string;
}

interface OmnichannelChatWidgetProps {
  isOpen: boolean;
  onToggleOpen: (open: boolean) => void;
  externalPrompt?: string | null;
  onClearExternalPrompt?: () => void;
}

const DEFAULT_WELCOME =
  'Hola, bienvenida a **CERSEA, A.C.** Estamos aquí para escucharte y apoyarte. ¿Te gustaría información sobre un ingreso o prefieres **agendar una visita**?';

export const OmnichannelChatWidget: React.FC<OmnichannelChatWidgetProps> = ({
  isOpen,
  onToggleOpen,
  externalPrompt,
  onClearExternalPrompt
}) => {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 'welcome-0',
      role: 'assistant',
      text: DEFAULT_WELCOME,
      displayedText: DEFAULT_WELCOME,
      isStreaming: false,
      timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const streamingTimerRef = useRef<any>(null);

  const sessionIdRef = useRef<string>(
    localStorage.getItem('cersea_chat_session_id') ||
      (() => {
        const id = `web_${Math.random().toString(36).substring(2, 10)}`;
        localStorage.setItem('cersea_chat_session_id', id);
        return id;
      })()
  );

  // Efecto Typewriter progresivo tipo ChatGPT para cualquier respuesta nueva del asistente
  const appendAssistantMessageWithStreaming = (fullReply: string) => {
    setIsTyping(false);
    const msgId = `bot-${Date.now()}`;
    const timeStr = new Date().toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const tokens = fullReply.split(/(?<=\s)/); // Separar conservando espacios y saltos
    let currentIndex = 0;

    setMessages((prev) => [
      ...prev,
      {
        id: msgId,
        role: 'assistant',
        text: fullReply,
        displayedText: '',
        isStreaming: true,
        timestamp: timeStr
      }
    ]);

    if (streamingTimerRef.current) {
      clearInterval(streamingTimerRef.current);
    }

    streamingTimerRef.current = setInterval(() => {
      // Avanzar de 2 en 2 palabras para lectura fluida y natural tipo ChatGPT
      currentIndex = Math.min(tokens.length, currentIndex + 2);
      const partial = tokens.slice(0, currentIndex).join('');
      const finished = currentIndex >= tokens.length;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, displayedText: partial, isStreaming: !finished }
            : m
        )
      );

      // Scroll suave únicamente si el usuario ya está cerca del final (sin forzar ni jalar bruscamente)
      const container = chatContainerRef.current;
      if (container) {
        const distanceFromBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom < 120) {
          container.scrollTop = container.scrollHeight;
        }
      }

      if (finished) {
        clearInterval(streamingTimerRef.current);
      }
    }, 32);
  };

  useEffect(() => {
    cerseaApi
      .getAgentConfig()
      .then((cfg) => {
        if (cfg.welcome_message) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === 'welcome-0'
                ? { ...m, text: cfg.welcome_message, displayedText: cfg.welcome_message }
                : m
            )
          );
        }
      })
      .catch(() => {});

    return () => {
      if (streamingTimerRef.current) clearInterval(streamingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let reconnectTimer: any;

    const connectWebSocket = () => {
      try {
        const wsUrl = `${getWsBaseUrl()}/api/gateway/ws/webchat/CERSEA`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.reply) {
              appendAssistantMessageWithStreaming(data.reply);
            }
          } catch {}
        };

        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimer = setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (externalPrompt && externalPrompt.trim()) {
      handleSendMessage(externalPrompt);
      if (onClearExternalPrompt) onClearExternalPrompt();
    }
  }, [externalPrompt]);

  const handleSendMessage = async (textToSend?: string) => {
    const msg = (textToSend ?? inputText).trim();
    if (!msg || isTyping) return;

    const userMsg: ChatMsg = {
      id: `usr-${Date.now()}`,
      role: 'user',
      text: msg,
      displayedText: msg,
      timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setIsTyping(true);

    // Hacer scroll suave al enviar pregunta del usuario
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 50);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          user_id: sessionIdRef.current,
          message: msg
        })
      );
    } else {
      try {
        const res = await cerseaApi.sendRestChatMessage(sessionIdRef.current, msg);
        appendAssistantMessageWithStreaming(
          res.reply || 'Gracias por comunicarte a CERSEA.'
        );
      } catch {
        appendAssistantMessageWithStreaming(
          'Disculpa, tuvimos una breve intermitencia de conexión. También puedes llamarnos directamente al 653 534 6760.'
        );
      } finally {
        setIsTyping(false);
      }
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {/* Ventana de Chat Abierta (Modo Clínico Claro) */}
      {isOpen && (
        <div className="mb-3 w-[92vw] sm:w-[410px] h-[570px] max-h-[82vh] rounded-3xl bg-white flex flex-col overflow-hidden shadow-2xl border border-purple-200/90">
          {/* Header del Chat */}
          <div className="px-4 py-3.5 bg-gradient-to-r from-[#5B21B6] via-[#6D28D9] to-[#0D9488] text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white p-0.5 shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src="/assets/logo.jpg"
                  alt="CERSEA Bot"
                  className="w-full h-full object-contain rounded-lg"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-white">
                    Orientación CERSEA
                  </h4>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/20 text-white">
                    {wsConnected ? (
                      <>
                        <Wifi className="w-2.5 h-2.5 text-emerald-300" /> En línea
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-2.5 h-2.5" /> Activo
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs text-purple-100">
                  Atención a Familias y Citas 24/7
                </p>
              </div>
            </div>

            <button
              onClick={() => onToggleOpen(false)}
              className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
              title="Minimizar chat"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Lista de Mensajes con Scroll Controlado */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/70"
          >
            {messages.map((m) => {
              const contentToRender = m.displayedText ?? m.text;
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[86%] rounded-2xl px-4 py-3 text-xs sm:text-sm shadow-2xs ${
                      m.role === 'user'
                        ? 'bg-[#6D28D9] text-white font-medium rounded-br-xs'
                        : 'bg-white text-slate-700 border border-slate-200/80 rounded-bl-xs'
                    }`}
                  >
                    <ChatMarkdownRenderer
                      content={contentToRender}
                      isUser={m.role === 'user'}
                    />
                    {m.isStreaming && (
                      <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-[#6D28D9] animate-pulse rounded-xs" />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 px-1">
                    {m.role === 'user' ? 'Tú' : 'Orientación CERSEA'} • {m.timestamp}
                  </span>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-center gap-2 text-xs font-medium text-[#6D28D9] bg-white border border-purple-200 px-3.5 py-2.5 rounded-2xl w-fit shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-[#6D28D9] animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-[#6D28D9] animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 rounded-full bg-[#0D9488] animate-bounce [animation-delay:300ms]" />
                <span className="ml-1">Escribiendo...</span>
              </div>
            )}
          </div>

          {/* Chips de Sugerencias Rápidas Naturales */}
          <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              {
                label: '¿Cómo ingreso a una familiar?',
                prompt: 'Hola, quisiera saber cómo es el proceso para ingresar a una familiar.'
              },
              {
                label: '¿Qué debemos llevar?',
                prompt: '¿Qué cosas personales necesitamos llevar el primer día?'
              },
              {
                label: 'Agendar visita este fin',
                prompt: 'Me gustaría agendar una visita para este fin de semana.'
              },
              {
                label: 'Dirección y teléfono',
                prompt: '¿En dónde están ubicados y a qué teléfono puedo llamar?'
              }
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleSendMessage(chip.prompt)}
                className="shrink-0 px-3 py-1 rounded-full bg-purple-50/70 hover:bg-purple-100 text-[11px] font-semibold text-[#5B21B6] border border-purple-200/80 transition-all cursor-pointer"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Input de Envío */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white border-t border-slate-200/80 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Escribe tu pregunta con confianza..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#6D28D9]"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className="p-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#0D9488] text-white hover:opacity-95 disabled:opacity-40 transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Botón Flotante Principal */}
      <button
        onClick={() => onToggleOpen(!isOpen)}
        className="flex items-center gap-2.5 px-5 py-3.5 rounded-full bg-gradient-to-r from-[#6D28D9] to-[#0D9488] text-white text-xs sm:text-sm font-bold shadow-xl shadow-purple-600/25 hover:scale-105 transition-all cursor-pointer"
      >
        {isOpen ? (
          <>
            <X className="w-5 h-5" />
            <span>Cerrar Asistente</span>
          </>
        ) : (
          <>
            <MessageSquare className="w-5 h-5" />
            <span>Orientación en Línea</span>
          </>
        )}
      </button>
    </div>
  );
};
