# Especificación de API, Webhooks y Contratos

## 🔌 Proyecto: CERSEA WEB & BOT (Centro Cersea)

### Información General
- **Base URL Backend (SmartOps Core VPS):** `https://api-core.smartopsia.com`
- **Omnichannel Gateway v5.1 (WebSockets):** `wss://api-core.smartopsia.com/api/gateway/ws/webchat/CERSEA`
- **Omnichannel Gateway REST Fallback:** `POST /api/gateway/inbound/webchat/CERSEA`
- **Tenant ID:** `CERSEA`
- **Formato:** JSON (UTF-8)

---

### Endpoints Públicos y Transaccionales (`/api/cersea`)

#### 0. Servidor MCP (`cersea-agenda-mcp`)
- **`GET /api/cersea/mcp/tools`**: Lista las 6 herramientas registradas en el MCP Server ([`mcp_server.py`](file:///c:/Users/Administrador/Desktop/3.%20Trabajo/Centro%20Cersea/backend/app/mcp_server.py)):
  - `consulta_agenda`: Consulta horarios disponibles y cupos para una fecha específica o un rango de próximos días.
  - `agendar`: Reserva una cita de valoración o visita familiar devolviendo folio `CERSEA-XXXXXXXX`.
  - `buscar_cita`: Busca citas existentes por folio (`CERSEA-XXXX`), teléfono o nombre del familiar/interna.
  - `reprogramar_cita`: Reprograma la fecha/hora de una cita existente verificando cupo en el nuevo bloque.
  - `cancelar_cita`: Cancela una cita existente por folio o ID y libera inmediatamente su cupo.
  - `consultar_informacion_cersea`: Consulta la base de conocimiento institucional (`cersea_knowledge`).
- **`POST /api/cersea/mcp/execute`**: Ejecuta directamente cualquiera de las herramientas del MCP Server recibiendo `{"name": "<tool>", "arguments": {...}}`.

#### 1. Healthcheck y Telemetría del Módulo CERSEA
- **Método:** `GET`
- **Ruta:** `/api/cersea/health`
- **Respuesta 200:**
```json
{
  "status": "ok",
  "tenant_id": "CERSEA",
  "project": "CERSEA WEB & BOT",
  "stats": {
    "total_visitas": 1,
    "knowledge_items": 6,
    "rag_vectors": 6
  }
}
```

#### 2. Consulta de Horarios Disponibles (UI & Bot Tool `consultar_horarios_cersea`)
- **Método:** `GET`
- **Ruta:** `/api/cersea/horarios/disponibles?fecha=YYYY-MM-DD`
- **Descripción:** Calcula los slots libres cruzando `horarios_disponibles` con las reservas activas en `visitas` (`Pendiente`, `Confirmada`).

#### 3. Crear / Agendar Visita (UI & Bot Tool `agendar_visita_cersea`)
- **Método:** `POST`
- **Ruta:** `/api/cersea/visitas`
- **Descripción:** Valida disponibilidad con bloqueo transaccional (`SELECT ... FOR UPDATE`) en PostgreSQL y registra la visita devolviendo el folio `CERSEA-XXXXXXXX`.
- **Payload:**
```json
{
  "nombre_visitante": "María López",
  "telefono": "6531234567",
  "nombre_interno_prospecto": "Ana Pérez",
  "tipo_visita": "Primer Ingreso",
  "fecha_hora": "2026-11-14T10:00:00-07:00"
}
```

---

### Endpoints del Panel Administrativo (`/admin` — Modelo SaaS Llave en Mano)

#### 4. Gestor de Créditos de IA y Webhook de Upsell
- **`GET /api/cersea/credits`**: Devuelve el consumo mensual del tenant (`mensajes_consumidos_mes`, `mensajes_limite_mes`, `mensajes_restantes`, `porcentaje_uso`, `fecha_renovacion_ciclo`).
  - **Lógica en el Middleware (`/chat` y Omnichannel Gateway):**
    - Antes de invocar a OpenAI, verifica `if mensajes_consumidos_mes < mensajes_limite_mes`:
      - **Con saldo:** Llama a OpenAI usando la Master API Key de SmartOps (o `api_key_override` si fue definido internamente en BD) e incrementa `mensajes_consumidos_mes` en `+1`.
      - **Sin saldo (Fallback por Saturación):** Intercepta la petición sin consumir tokens y devuelve: `"Por el momento nuestra línea de atención automatizada está saturada. Por favor, comunícate al 653 123 2800 o déjanos tus datos y te contactaremos."`
- **`POST /api/cersea/credits/request-upsell`**: Registra una solicitud de ampliación de plan en `credit_upsell_requests` y dispara el webhook hacia SmartOps (`n8n` + alerta `ntfy`) para ampliar el paquete por `+$500 MXN`.
- **`POST /api/cersea/credits/approve-topup`**: Suma `+creditos_extra` al `mensajes_limite_mes` del tenant en `business_configs` y marca el upsell como `Aprobado` (conectado con el Gestor de Tenants / n8n / Stripe; ver [recomendacion.md](file:///c:/Users/Administrador/Desktop/3.%20Trabajo/Centro%20Cersea/recomendacion.md)).
- **`POST /api/cersea/credits/reset-cycle`**: Reinicia `mensajes_consumidos_mes` a `0` al comenzar un nuevo ciclo mensual.

#### 5. Configuración de Personalidad e Instrucciones del Agente
- **`GET /api/cersea/agent-config`**: Obtiene `role`, `tone`, `welcome_message` y `custom_instructions` del asistente (sin exponer credenciales de API Key al cliente).
- **`PUT /api/cersea/agent-config`**: Actualiza el mensaje de bienvenida, rol, tono e instrucciones operativas del asistente.

#### 6. Gestión de Base de Conocimiento (`cersea_knowledge`) y Sincronización `pgvector`
- **`GET /api/cersea/knowledge`**: Lista todas las preguntas y respuestas institucionales.
- **`POST /api/cersea/knowledge`**: Crea un nuevo bloque de conocimiento.
- **`PUT /api/cersea/knowledge/{item_id}`**: Edita una pregunta/respuesta.
- **`DELETE /api/cersea/knowledge/{item_id}`**: Elimina un registro.
- **`POST /api/cersea/knowledge/sync-rag`**: Genera embeddings con OpenAI (`text-embedding-3-small`) de toda la tabla `cersea_knowledge` e indexa los vectores en `documents` y `document_chunks` (`pgvector`) bajo `business_id = 'CERSEA'`.

#### 7. Administración y Manipulación Avanzada de Visitas, Horarios e Historial
- **`GET /api/cersea/horarios/resumen`**: Resumen de disponibilidad y cupos libres de los próximos N días.
- **`GET /api/cersea/visitas`**: Lista y filtra las citas agendadas (`estado`, `fecha`, `tipo_visita`, `q`).
- **`PUT /api/cersea/visitas/{visita_id}`**: Reprograma la fecha/hora o edita los datos del familiar/interna/notas de una cita.
- **`PATCH /api/cersea/visitas/{visita_id}/estado`**: Cambia el estado (`Pendiente`, `Confirmada`, `Cancelada`).
- **`DELETE /api/cersea/visitas/{visita_id}`**: Elimina una cita de la agenda.
- **`GET /api/cersea/horarios/config`** & **`PUT /api/cersea/horarios/config/{dia_semana}`**: Administra los días, horas de apertura/cierre y capacidad por bloque en `horarios_disponibles`.
- **`GET /api/cersea/conversations`**: Devuelve el historial de sesiones de `chat_histories` del tenant `CERSEA`.
