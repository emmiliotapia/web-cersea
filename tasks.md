# Backlog Actual y Seguimiento de Sprints

## 📋 Proyecto: CERSEA WEB & BOT (Centro Cersea)

### Estado del Proyecto
- **Cliente:** CERSEA, A.C. S.C. (Centro de Rehabilitación para Mujeres Sembrando Amor - San Luis Río Colorado)
- **Arquitecto / Lead:** Emilio Tapia (SmartOps Agency)
- **Sprint Activo:** Sprint 1 — Completado y Desplegado en Producción (VPS `/root/smartops-clients/centro-cersea`, Contenedor `cersea_frontend`, Puerto `3500`)

### Checklist de Implementación
- [x] Estructura base de documentación creada y sincronizada (`gemini.md`, `humano.md`, `architecture.md`, `api.md`, `database.md`, `errors.md`, `tasks.md`).
- [x] Inspección y conexión con el motor multi-tenant `smartops-core` (puerto `8003`) y PostgreSQL `pgvector` (`multi_tenant_db`) en el VPS.
- [x] Creación e inicialización de las 3 tablas en PostgreSQL (`cersea_knowledge`, `visitas`, `horarios_disponibles`) con datos semilla oficiales de CERSEA, A.C.
- [x] Registro del tenant `CERSEA` en `business_configs` y vectorización inicial de los 6 bloques RAG en `document_chunks` (`pgvector`).
- [x] Herramientas nativas del Agente IA: `consultar_horarios_cersea` y `agendar_visita_cersea` con control de concurrencia (`SELECT ... FOR UPDATE`).
- [x] Desarrollo de la PWA React + Vite + TypeScript en **Obsidian Swiss Style** (`#030712` / `#0b0f19`, `#00FF66`, `JetBrains Mono`):
  - [x] Hero Section + 4 Pilares (Atención Psicológica, CUSON, ISEA, Doctrina Cristiana) + Ubicaciones (Callejón Jalisco / Callejón Oaxaca) + Teléfonos (`653 123 2800` / `653 534 6760`).
  - [x] Módulo de Agendamiento UI interactivo conectado a PostgreSQL.
  - [x] Widget Omnicanal (Floating Chat) conectado vía WebSockets (`ws://164.92.110.179:8003/api/gateway/ws/webchat/CERSEA`) con apertura proactiva.
  - [x] **Panel de Control del Chatbot (`#admin`)** para gestionar la OpenAI API Key (Key de SmartOps o Key propia del cliente), System Prompt, Base de Conocimiento RAG (`cersea_knowledge`), Visitas, Horarios y Monitor de Conversaciones.
