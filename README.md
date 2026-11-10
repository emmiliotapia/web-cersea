# 🌿 CERSEA A.C. S.C. — Web & Asistente Virtual Omnicanal

Plataforma web clínica informativa, módulo de agendamiento concurrente y asistente virtual con IA (`RAG + pgvector`) desarrollado para **CERSEA A.C. S.C. (Centro de Rehabilitación para Mujeres "Sembrando Amor")** en San Luis Río Colorado, Sonora.

---

## 🏛️ Arquitectura y Stack Tecnológico (SmartOps Standard)

- **Frontend (PWA):** React 18 + Vite + TypeScript + Tailwind CSS (*Clinical Sanctuary Light Mode*).
- **Backend & Gateway:** FastAPI (Python) integrado con **SmartOps Core Multi-Tenant Engine** y **Omnichannel Gateway v5.1** (WebSockets + REST).
- **Base de Datos:** PostgreSQL 16 + `pgvector` (`cersea_knowledge`, `visitas`, `horarios_disponibles`, `document_chunks`).
- **Infraestructura:** Docker & Docker Compose.

---

## 🚀 Rutas de la Aplicación

- **`/` (Vista Pública Clínica):**
  - Hero institucional, servicios médicos certificados (Doctora, Psiquiatra, Psicología, Consejería en Adicciones, Estudios ISEA, Convenio CUSON y Talleres de Emprendimiento para la Mujer).
  - Los 4 Pilares de Restauración.
  - Módulo de Agendamiento Directo de Visitas y Valoraciones con control de concurrencia.
  - Widget de Orientación en Línea 24/7 vía WebSockets con escritura progresiva tipo streaming.
- **`/admin` (Panel Administrativo Privado):**
  - Gestión de credenciales OpenAI API Key (Soporte para Key Maestra o Key propia del cliente enmascarada).
  - Editor de Base de Conocimiento (`cersea_knowledge`) y sincronización en un clic con vectores `pgvector`.
  - Administración de citas (`visitas`), horarios (`horarios_disponibles`) y monitor de conversaciones en vivo.

---

## 🔐 Seguridad y Variables de Entorno

1. Copia el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```
2. Ninguna API Key (`OPENAI_API_KEY`) se almacena en el código fuente ni en el repositorio. Se gestionan exclusivamente mediante variables de entorno en el servidor o de forma encriptada/enmascarada desde el endpoint administrativo `/admin`.
