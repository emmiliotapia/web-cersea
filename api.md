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

#### 5. Configuración de Personalidad e Instrucciones del Agente
- **`GET /api/cersea/agent-config`**: Obtiene `role`, `tone`, `welcome_message` y `custom_instructions` del asistente (sin exponer credenciales de API Key al cliente).
- **`PUT /api/cersea/agent-config`**: Actualiza el mensaje de bienvenida, rol, tono e instrucciones operativas del asistente.

#### 6. Gestión de Base de Conocimiento (`cersea_knowledge`) y Sincronización `pgvector`
- **`GET /api/cersea/knowledge`**: Lista todas las preguntas y respuestas institucionales.
- **`POST /api/cersea/knowledge`**: Crea un nuevo bloque de conocimiento.
- **`PUT /api/cersea/knowledge/{item_id}`**: Edita una pregunta/respuesta.
- **`DELETE /api/cersea/knowledge/{item_id}`**: Elimina un registro.
- **`POST /api/cersea/knowledge/sync-rag`**: Genera embeddings con OpenAI (`text-embedding-3-small`) de toda la tabla `cersea_knowledge` e indexa los vectores en `documents` y `document_chunks` (`pgvector`) bajo `business_id = 'CERSEA'`.

#### 7. Administración de Visitas, Horarios e Historial
- **`GET /api/cersea/visitas`**: Lista las citas agendadas.
- **`PATCH /api/cersea/visitas/{visita_id}/estado`**: Cambia el estado (`Pendiente`, `Confirmada`, `Cancelada`).
- **`GET /api/cersea/horarios/config`** & **`PUT /api/cersea/horarios/config/{dia_semana}`**: Administra los días y horas habilitadas en `horarios_disponibles`.
- **`GET /api/cersea/conversations`**: Devuelve el historial de sesiones de `chat_histories` del tenant `CERSEA`.
