# 👨‍💻 Manual Operativo para el Humano (Human-Centric Control)

## 📌 Proyecto: CERSEA WEB & BOT (Centro Cersea)

Este documento es la brújula rápida para entender, auditar y operar este proyecto sin tener que descifrar todo el código fuente.

## 1. Visión General del Sistema
- **Cliente:** CERSEA, A.C. (Centro de Rehabilitación Sembrando Amor) — San Luis Río Colorado.
- **Giro:** Asociación Civil de sanación integral de adicciones.
- **Propósito:** Desarrollar una Progressive Web App (PWA) informativa con un bot integrado capaz de responder dudas frecuentes y agendar visitas/citas de valoración, reduciendo la carga administrativa del centro.
- **Dueño / Arquitecto:** Emilio Tapia (SmartOps Agency).
- **Stack Principal:**
  - **Frontend:** React + Vite, TypeScript — *Obsidian Swiss Style* (Dark glassmorphic, fondos `#030712` / `#0b0f19`, acento verde neón `#00FF66`, tipografía `JetBrains Mono`).
  - **Backend:** FastAPI (Python).
  - **Base de Datos:** PostgreSQL.
  - **Bot & Webhooks:** n8n + Omnichannel Gateway v5.1 (Web Chat via WebSockets).
  - **Despliegue:** Contenedores Docker en VPS.

## 2. Mapa Mental y Flujo de Usuario (User Journey)
1. **Entrada:** El usuario familiar o prospecto entra a la web de CERSEA. El diseño oscuro con verde neón (`#00FF66`) transmite tranquilidad, esperanza y seriedad.
2. **Interacción:** El widget de chat flotante se abre con un mensaje proactivo:
   > *"Hola, bienvenido a CERSEA. ¿Buscas información sobre nuestros procesos de ingreso o deseas agendar una visita?"*
3. **Resolución de Dudas (RAG / FAQ):** El usuario pregunta (ej. *"¿Qué necesitan llevar?"*). El bot extrae la información de la base de conocimiento (`cersea_knowledge`) y responde al instante usando la conexión WebSocket a través del Omnichannel Gateway v5.1.
4. **Conversión (Agendamiento):** El usuario escribe *"Quiero agendar para el sábado"* (o usa el Módulo de Agendamiento UI directamente). El sistema consulta la tabla `horarios_disponibles` a través de FastAPI, ofrece las horas libres, captura los datos (Nombre del Familiar, Teléfono, Nombre del Interno/Prospecto, Preferencia de Horario) y confirma la cita guardándola en la tabla `visitas` con control de concurrencia.

## 3. Protocolo de Debugging y "Cosas Fuera de Control"
Cuando algo falla en producción o en local, sigue estos pasos antes de culpar al código:
1. **Revisar logs de contenedores:** `docker compose logs -f --tail=100 [servicio]`
2. **Verificar base de datos:** Conexión a PostgreSQL y estado de las tablas (`cersea_knowledge`, `visitas`, `horarios_disponibles`).
3. **Revisar WebSockets y n8n:** Estado del Omnichannel Gateway v5.1 y ejecuciones de flujos en n8n.
4. **Consultar `errors.md`:** ¿Es un error conocido que ya documentamos antes?

## 4. Reglas de Calidad y Modularidad (Para el Agente y el Equipo)
- **Modularidad Extrema:** Ningún archivo de código debe superar las 300-400 líneas sin estar modularizado por responsabilidades (routers, servicios, componentes UI separados).
- **Obsidian Swiss Style:** Respetar estrictamente la paleta `#030712` / `#0b0f19`, acentos `#00FF66` y tipografía `JetBrains Mono`.
- **Comentarios Obligatorios:** Todo bloque complejo de lógica (como el bloqueo concurrente de slots de horario) debe estar comentado explicando *el porqué*, no solo el *qué*.
- **Documentación Viva:** Cada vez que se agregue una feature o cambie un endpoint, se debe actualizar inmediatamente `api.md`, `database.md` o `architecture.md`.

## 5. Estrategia de Versionamiento y Despliegue (Sprint & Deploy)
- **Ramas (Git Flow):**
  - `main`: Producción estable.
  - `dev`: Integración continua.
  - `feature/*`: Nuevas características.
- **Cierre de Sprint:** Al finalizar un ciclo, se consolida la versión, se limpian dependencias obsoletas y se actualiza `tasks.md`.
- **Despliegue (Deploy):**
  - Subida a servidor VPS vía Docker Compose.
  - Comprobación de salud del sistema mediante healthchecks automatizados.
