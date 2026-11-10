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
  "nombre_interno_prospecto": "Juan Pérez",
  "tipo_visita": "Primer Ingreso",
  "fecha_hora": "2026-11-14T10:00:00-07:00"
}
```

---

### Endpoints del Panel de Control del Chatbot (`#admin`)

#### 4. Configuración del Agente y OpenAI API Key
- **`GET /api/cersea/agent-config`**: Obtiene el `role`, `tone`, `welcome_message`, `custom_instructions`, `model`, `temperature`, `use_master_api_key` (usa la key del VPS SmartOps o la propia del cliente) y vista enmascarada de `custom_openai_api_key`.
- **`PUT /api/cersea/agent-config`**: Actualiza los parámetros del agente y permite subir/cambiar la OpenAI API Key exclusiva del cliente CERSEA sin exponerla en texto plano.

#### 5. Gestión de Base de Conocimiento (`cersea_knowledge`) y Sincronización `pgvector`
- **`GET /api/cersea/knowledge`**: Lista todas las preguntas y respuestas institucionales.
- **`POST /api/cersea/knowledge`**: Crea un nuevo bloque de conocimiento.
- **`PUT /api/cersea/knowledge/{item_id}`**: Edita una pregunta/respuesta.
- **`DELETE /api/cersea/knowledge/{item_id}`**: Elimina un registro.
- **`POST /api/cersea/knowledge/sync-rag`**: Genera embeddings con OpenAI (`text-embedding-3-small`) de toda la tabla `cersea_knowledge` e indexa los vectores en `documents` y `document_chunks` (`pgvector`) bajo `business_id = 'CERSEA'`.

#### 6. Administración de Visitas, Horarios e Historial
- **`GET /api/cersea/visitas`**: Lista las citas agendadas.
- **`PATCH /api/cersea/visitas/{visita_id}/estado`**: Cambia el estado (`Pendiente`, `Confirmada`, `Cancelada`).
- **`GET /api/cersea/horarios/config`** & **`PUT /api/cersea/horarios/config/{dia_semana}`**: Administra los días y horas habilitadas en `horarios_disponibles`.
- **`GET /api/cersea/conversations`**: Devuelve el historial de sesiones de `chat_histories` del tenant `CERSEA`.
