"""
Servicio de Lógica de Negocio, Gestor de Créditos IA y Datos para CERSEA, A.C.
==============================================================================
Maneja:
1. Inicialización y semilla (seed) de las 3 tablas oficiales:
   - cersea_knowledge
   - horarios_disponibles
   - visitas
2. Gestor de Créditos Multi-Tenant en `business_configs`:
   - api_key_override (NULL por defecto -> usa Master Key de SmartOps en .env)
   - mensajes_limite_mes (1500 por defecto)
   - mensajes_consumidos_mes (inicia en 0, incrementa +1 por interacción)
   - fecha_renovacion_ciclo (día del mes en que se renueva el ciclo)
3. Cálculo de slots disponibles por fecha y validación de concurrencia
   transaccional (SELECT ... FOR UPDATE) al agendar visitas.
4. Sincronización de `cersea_knowledge` con los vectores `pgvector`.
"""

import os
import json
import uuid
import logging
import requests
from datetime import datetime, date, time, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("cersea_service")

TENANT_ID = "CERSEA"

SATURATION_FALLBACK_MESSAGE = (
    "Por el momento nuestra línea de atención automatizada está saturada. "
    "Por favor, comunícate al 653 123 2800 o déjanos tus datos y te contactaremos."
)

DEFAULT_CERSEA_PROMPT_CONFIG = {
    "role": "Asistente de Orientación Familiar y Agendamiento de CERSEA, A.C. S.C.",
    "tone": "Empático, cálido, profesional, respetuoso y guiado por valores cristianos y humanistas",
    "mission": "Brindar sanación integral de adicciones para mujeres en San Luis Río Colorado mediante atención psicológica, médica, educativa y espiritual.",
    "vision": "Ser un refugio de esperanza y restauración familiar sembrando amor en cada mujer y su familia.",
    "objective": "Orientar con empatía a familiares sobre el proceso de ingreso, servicios, ubicaciones y convenios (CUSON, ISEA), y agendar visitas familiares o citas de valoración.",
    "role_description": "Consejera digital de primer contacto de CERSEA A.C. S.C. (Centro de Rehabilitación para Mujeres Sembrando Amor).",
    "welcome_message": "Hola, bienvenida a CERSEA. Estamos aquí para escucharte y apoyarte. ¿Te gustaría información sobre un ingreso o prefieres agendar una visita?",
    "model": "gpt-4o-mini",
    "temperature": 0.2,
    "custom_instructions": (
        "1. REGLA DE BREVEDAD Y CALIDEZ: Tus respuestas deben ser CORTAS, cálidas y fáciles de leer (máximo 2 a 4 oraciones breves, o máximo 4 puntos muy concretos). Nunca envíes textos largos.\n"
        "2. FORMATO LIMPIO: No uses símbolos raros ni bloques pesados. Habla de forma natural, empática y con valores cristianos y humanistas.\n"
        "3. Responde dudas sobre ubicaciones (Callejón Oaxaca y 23 #2301 y Callejón Jalisco), teléfonos (653 534 6760 y 653 123 2800), requisitos de ingreso o especialistas usando el CONTEXTO RAG OBLIGATORIO.\n"
        "4. Si desean agendar una visita o cita, consulta disponibilidad con 'consultar_horarios_cersea', pide amablemente: Nombre del Familiar, Teléfono, Nombre de la Interna/Prospecto y Horario, y confirma con 'agendar_visita_cersea'."
    )
}

INITIAL_KNOWLEDGE_SEED = [
    {
        "categoria": "Identidad y Pilares",
        "pregunta": "¿Qué es CERSEA A.C. S.C., para quién es y cuáles son sus pilares de rehabilitación?",
        "respuesta": (
            "CERSEA A.C. S.C. (Centro de Rehabilitación Sembrando Amor) es un Centro de Rehabilitación para Mujeres "
            "dedicado a la sanación integral y terapia para liberarse de problemas de adicción en San Luis Río Colorado, Sonora. "
            "Nuestro modelo de restauración se sostiene sobre 4 pilares fundamentales:\n"
            "1. Atención Psicológica, Psiquiátrica y Médica con profesionales de la salud titulados y certificados (Doctora, Psiquiatra, Psicología y Consejería en adicciones).\n"
            "2. Convenio CUSON y Talleres de emprendimiento para la mujer.\n"
            "3. Convenio ISEA para estudios oficiales de educación abierta.\n"
            "4. Doctrina Cristiana y acompañamiento espiritual basado en el amor, el respeto y la dignidad de la mujer."
        )
    },
    {
        "categoria": "Ubicaciones",
        "pregunta": "¿Dónde están ubicados exactamente los centros de CERSEA en San Luis Río Colorado?",
        "respuesta": (
            "Contamos con ubicaciones en San Luis Río Colorado, Sonora:\n"
            "• Dirección Principal: Callejón Oaxaca y 23 #2301 (San Luis Río Colorado, Sonora).\n"
            "• Segunda Ubicación: Callejón Jalisco (San Luis Río Colorado, Sonora).\n"
            "En nuestras instalaciones brindamos un entorno seguro, digno y exclusivo para la rehabilitación integral de la mujer."
        )
    },
    {
        "categoria": "Servicios",
        "pregunta": "¿Qué especialistas médicos, clínicos y talleres incluye el tratamiento en CERSEA?",
        "respuesta": (
            "En CERSEA A.C. S.C. ofrecemos tratamiento con profesionales de la salud titulados y certificados que incluye:\n"
            "• Consejería en adicciones.\n"
            "• Psicología clínica.\n"
            "• Doctora (valoración y atención médica).\n"
            "• Psiquiatra.\n"
            "• Análisis de laboratorios clínicos.\n"
            "• Doctrina cristiana.\n"
            "• Alimentación balanceada.\n"
            "• Estudios oficiales ISEA y convenio CUSON.\n"
            "• Talleres de emprendimiento para la mujer.\n"
            "• Terapia integral para liberarte de problemas de adicción."
        )
    },
    {
        "categoria": "Ingreso",
        "pregunta": "¿Qué necesitan llevar para un primer ingreso y cuáles son los requisitos?",
        "respuesta": (
            "Para el ingreso de una usuaria a CERSEA A.C. S.C. (Centro de Rehabilitación para Mujeres) se solicita llevar:\n"
            "1. Identificación oficial del familiar responsable y de la ingresante (INE o CURP).\n"
            "2. Artículos de aseo personal básicos (sin alcohol ni envases de vidrio: jabón, shampoo, cepillo y pasta dental, desodorante en barra, sandalias de baño).\n"
            "3. Ropa cómoda e interior (sin cordones/agujetas ni prendas con mensajes alusivos a sustancias).\n"
            "4. En caso de tomar medicamentos controlados o crónicos, traer receta médica vigente y el medicamento para su resguardo por la Doctora / enfermería.\n"
            "5. Realizar la valoración inicial o agendar su cita de Primer Ingreso en este portal o a los teléfonos 653 534 6760 y 653 123 2800."
        )
    },
    {
        "categoria": "Convenios",
        "pregunta": "¿En qué consisten los estudios ISEA, el convenio CUSON y los talleres de emprendimiento?",
        "respuesta": (
            "• Estudios ISEA (Instituto Sonorense de Educación para los Adultos): Permite que las internas continúen o concluyan sus estudios de primaria y secundaria con validez oficial.\n"
            "• Convenio CUSON y Talleres de Emprendimiento para la Mujer: Capacitación práctica y desarrollo de habilidades productivas para impulsar la autonomía y reinserción social y laboral de cada mujer."
        )
    },
    {
        "categoria": "Contactos",
        "pregunta": "¿Cuáles son los teléfonos oficiales, dirección y horarios de visita de CERSEA?",
        "respuesta": (
            "Nuestros datos oficiales de contacto en San Luis Río Colorado son:\n"
            "• Teléfono Principal: 653 534 6760\n"
            "• Teléfono Alterno: 653 123 2800\n"
            "• Dirección: Callejón Oaxaca y 23 #2301 y Callejón Jalisco.\n"
            "• Horarios de Visitas y Valoraciones: Sábados y Domingos de 10:00 AM a 4:00 PM (en bloques de 1 hora), además de atención para Primer Ingreso toda la semana previa cita."
        )
    }
]


def get_active_openai_key(db: Session, tenant_id: str = TENANT_ID) -> str:
    """
    Obtiene la API Key para el tenant:
    Revisa la columna `api_key_override` en `business_configs`. Si es NULL o vacía,
    utiliza la Master API Key de SmartOps alojada en `.env` (`OPENAI_API_KEY`).
    """
    master_key = os.getenv("OPENAI_API_KEY", "")
    try:
        row = db.execute(
            text("SELECT api_key_override FROM business_configs WHERE id = :tid"),
            {"tid": tenant_id}
        ).fetchone()
        if row and row[0] and str(row[0]).strip():
            return str(row[0]).strip()
    except Exception as e:
        logger.warning(f"No se pudo leer api_key_override: {e}")
    return master_key


def check_and_consume_tenant_credit(db: Session, tenant_id: str = TENANT_ID) -> Tuple[bool, Optional[str]]:
    """
    Verifica si `mensajes_consumidos_mes < mensajes_limite_mes` para el tenant.
    - Si hay saldo: incrementa `mensajes_consumidos_mes` en +1 y retorna `(True, api_key_override)`.
    - Si llegó al límite: no incrementa y retorna `(False, None)` para activar el fallback de saturación.
    """
    init_cersea_tables_and_seed(db)
    row = db.execute(text("""
        SELECT mensajes_consumidos_mes, mensajes_limite_mes, api_key_override
        FROM business_configs
        WHERE id = :tid
        FOR UPDATE
    """), {"tid": tenant_id}).fetchone()

    if not row:
        return True, None

    consumidos = int(row[0] or 0)
    limite = int(row[1] or 1500)
    key_override = str(row[2]).strip() if row[2] else None

    if consumidos >= limite:
        db.commit()
        return False, key_override

    db.execute(text("""
        UPDATE business_configs
        SET mensajes_consumidos_mes = COALESCE(mensajes_consumidos_mes, 0) + 1
        WHERE id = :tid
    """), {"tid": tenant_id})
    db.commit()
    return True, key_override


def get_tenant_credits_status(db: Session, tenant_id: str = TENANT_ID) -> Dict[str, Any]:
    """
    Devuelve el estado actual de consumo de créditos del mes para el Dashboard en `/admin`.
    """
    init_cersea_tables_and_seed(db)
    row = db.execute(text("""
        SELECT mensajes_consumidos_mes, mensajes_limite_mes, fecha_renovacion_ciclo
        FROM business_configs
        WHERE id = :tid
    """), {"tid": tenant_id}).fetchone()

    consumidos = int(row[0] or 0) if row else 0
    limite = int(row[1] or 1500) if row else 1500
    dia_renovacion = int(row[2] or 10) if row else 10
    restantes = max(0, limite - consumidos)
    porcentaje = round((consumidos / limite) * 100, 1) if limite > 0 else 100.0

    return {
        "tenant_id": tenant_id,
        "mensajes_consumidos_mes": consumidos,
        "mensajes_limite_mes": limite,
        "mensajes_restantes": restantes,
        "porcentaje_uso": min(100.0, porcentaje),
        "fecha_renovacion_ciclo": dia_renovacion,
        "plan_nombre": "Plan Clínico SmartOps IA (1,500 Interacciones / mes)",
        "upsell_oferta": "+1,000 créditos adicionales por $500 MXN"
    }


def trigger_upsell_webhook(
    db: Session,
    solicitante: str = "Administración CERSEA",
    telefono_contacto: str = "653 534 6760",
    paquete: str = "+1,000 créditos IA ($500 MXN)",
    notas: str = ""
) -> Dict[str, Any]:
    """
    Registra la solicitud de incremento de créditos en PostgreSQL y dispara
    un webhook a n8n + notificación push instantánea a Emilio (SmartOps).
    """
    init_cersea_tables_and_seed(db)
    status_actual = get_tenant_credits_status(db, TENANT_ID)

    row = db.execute(text("""
        INSERT INTO credit_upsell_requests (
            tenant_id, solicitante, telefono_contacto, paquete_solicitado,
            consumo_actual, limite_actual, notas, estado
        )
        VALUES (:tid, :sol, :tel, :paq, :cons, :lim, :not, 'Pendiente')
        RETURNING id, created_at
    """), {
        "tid": TENANT_ID,
        "sol": solicitante,
        "tel": telefono_contacto,
        "paq": paquete,
        "cons": status_actual["mensajes_consumidos_mes"],
        "lim": status_actual["mensajes_limite_mes"],
        "not": notas
    }).fetchone()
    db.commit()

    req_id = str(row[0])
    webhook_payload = {
        "event": "smartops.credit_upsell_requested",
        "request_id": req_id,
        "tenant_id": TENANT_ID,
        "client_name": "CERSEA, A.C. S.C.",
        "solicitante": solicitante,
        "telefono_contacto": telefono_contacto,
        "paquete": paquete,
        "monto_mxn": 500,
        "mensajes_consumidos_mes": status_actual["mensajes_consumidos_mes"],
        "mensajes_limite_mes": status_actual["mensajes_limite_mes"],
        "notas": notas,
        "timestamp": datetime.utcnow().isoformat()
    }

    # 1. Disparar Webhook a n8n (si está configurado o al contenedor smartops-n8n)
    n8n_webhook_url = os.getenv(
        "SMARTOPS_UPSELL_WEBHOOK_URL",
        "http://smartops-n8n:5678/webhook/smartops-upsell-credits"
    )
    webhook_sent = False
    try:
        resp = requests.post(n8n_webhook_url, json=webhook_payload, timeout=5)
        webhook_sent = resp.status_code < 400
    except Exception as we:
        logger.info(f"Webhook n8n upsell aviso: {we}")

    # 2. Enviar notificación instantánea por ntfy interno de SmartOps si está activo
    try:
        ntfy_msg = (
            f"💰 UPSELL SOLICITADO: CERSEA A.C. solicita {paquete}. "
            f"Consumo actual: {status_actual['mensajes_consumidos_mes']}/{status_actual['mensajes_limite_mes']}. "
            f"Contacto: {solicitante} ({telefono_contacto})"
        )
        requests.post(
            "http://casino_ntfy:80/smartops_alerts",
            data=ntfy_msg.encode("utf-8"),
            headers={"Title": "Solicitud de Creditos IA - CERSEA ($500 MXN)", "Priority": "high"},
            timeout=4
        )
    except Exception:
        pass

    return {
        "status": "requested",
        "request_id": req_id,
        "webhook_dispatched": webhook_sent,
        "message": (
            "¡Solicitud enviada a SmartOps Agency! En breve activaremos tu paquete adicional "
            "de créditos (+1,000 interacciones por $500 MXN)."
        )
    }


_CERSEA_SCHEMA_INITIALIZED = False


def init_cersea_tables_and_seed(db: Session) -> Dict[str, Any]:
    """
    Crea de forma idempotente las tablas de CERSEA y agrega las columnas del
    Gestor de Créditos (`api_key_override`, `mensajes_limite_mes`, `mensajes_consumidos_mes`,
    `fecha_renovacion_ciclo`) a `business_configs`.
    Se ejecuta una sola vez por proceso para evitar bloqueos DDL concurrentes en PostgreSQL.
    """
    global _CERSEA_SCHEMA_INITIALIZED
    if _CERSEA_SCHEMA_INITIALIZED:
        return {"status": "already_initialized", "tenant_id": TENANT_ID}

    db.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'))

    # 0. Agregar columnas del Gestor de Créditos a `business_configs` (Multi-Tenant DB)
    db.execute(text("""
        ALTER TABLE business_configs
        ADD COLUMN IF NOT EXISTS api_key_override VARCHAR(255) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS mensajes_limite_mes INT NOT NULL DEFAULT 1500,
        ADD COLUMN IF NOT EXISTS mensajes_consumidos_mes INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS fecha_renovacion_ciclo INT NOT NULL DEFAULT 10;
    """))

    # Tabla de solicitudes de Upsell de Créditos
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS credit_upsell_requests (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            tenant_id VARCHAR(60) NOT NULL,
            solicitante VARCHAR(150),
            telefono_contacto VARCHAR(50),
            paquete_solicitado VARCHAR(120),
            consumo_actual INT,
            limite_actual INT,
            notas TEXT,
            estado VARCHAR(30) DEFAULT 'Pendiente',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    """))

    # 1. Tabla cersea_knowledge
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS cersea_knowledge (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            categoria VARCHAR(80) NOT NULL,
            pregunta TEXT NOT NULL,
            respuesta TEXT NOT NULL,
            activo BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    """))

    # 2. Tabla horarios_disponibles
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS horarios_disponibles (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            dia_semana SMALLINT NOT NULL,
            nombre_dia VARCHAR(25) NOT NULL,
            hora_inicio TIME NOT NULL,
            hora_fin TIME NOT NULL,
            duracion_slot_min INT NOT NULL DEFAULT 60,
            capacidad_por_slot INT NOT NULL DEFAULT 3,
            activo BOOLEAN NOT NULL DEFAULT TRUE
        );
    """))

    # 3. Tabla visitas
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS visitas (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            nombre_visitante VARCHAR(150) NOT NULL,
            telefono VARCHAR(40) NOT NULL,
            nombre_interno_prospecto VARCHAR(150),
            tipo_visita VARCHAR(40) NOT NULL CHECK (tipo_visita IN ('Primer Ingreso', 'Familiar')),
            fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL,
            estado VARCHAR(30) NOT NULL DEFAULT 'Confirmada' CHECK (estado IN ('Pendiente', 'Confirmada', 'Cancelada')),
            notas TEXT,
            origen VARCHAR(30) DEFAULT 'web',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    """))

    db.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_visitas_fecha_hora_estado
        ON visitas (fecha_hora, estado);
    """))

    db.commit()

    # 4. Registrar Tenant CERSEA en business_configs si no existe
    existing_tenant = db.execute(
        text("SELECT id FROM business_configs WHERE id = :tid"),
        {"tid": TENANT_ID}
    ).fetchone()

    if not existing_tenant:
        toggles = {"leads": 1, "agenda": 1, "pedidos": 0, "cersea_visitas": 1}
        db.execute(text("""
            INSERT INTO business_configs (
                id, name, category, tone, system_prompt_config, mcp_toggles,
                api_key_override, mensajes_limite_mes, mensajes_consumidos_mes, fecha_renovacion_ciclo
            )
            VALUES (
                :id, :name, :category, :tone, CAST(:prompt_cfg AS jsonb), CAST(:toggles AS jsonb),
                NULL, 1500, 0, 10
            )
        """), {
            "id": TENANT_ID,
            "name": "CERSEA, A.C. S.C. - Centro de Rehabilitación Sembrando Amor",
            "category": "Asociación Civil / Salud y Rehabilitación",
            "tone": "Empático, Cristiano y Humanista",
            "prompt_cfg": json.dumps(DEFAULT_CERSEA_PROMPT_CONFIG),
            "toggles": json.dumps(toggles)
        })
        db.commit()

    # 5. Poblar semilla de cersea_knowledge si está vacía
    know_count = db.execute(text("SELECT COUNT(*) FROM cersea_knowledge")).scalar()
    if know_count == 0:
        for item in INITIAL_KNOWLEDGE_SEED:
            db.execute(text("""
                INSERT INTO cersea_knowledge (categoria, pregunta, respuesta, activo)
                VALUES (:cat, :preg, :resp, TRUE)
            """), {
                "cat": item["categoria"],
                "preg": item["pregunta"],
                "resp": item["respuesta"]
            })
        db.commit()

    # 6. Poblar semilla de horarios_disponibles si está vacía
    sched_count = db.execute(text("SELECT COUNT(*) FROM horarios_disponibles")).scalar()
    if sched_count == 0:
        dias_seed = [
            (0, "Lunes", "09:00", "17:00", 60, 2, True),
            (1, "Martes", "09:00", "17:00", 60, 2, True),
            (2, "Miércoles", "09:00", "17:00", 60, 2, True),
            (3, "Jueves", "09:00", "17:00", 60, 2, True),
            (4, "Viernes", "09:00", "17:00", 60, 2, True),
            (5, "Sábado", "10:00", "16:00", 60, 4, True),
            (6, "Domingo", "10:00", "16:00", 60, 4, True),
        ]
        for d_num, d_name, h_ini, h_fin, dur, cap, act in dias_seed:
            db.execute(text("""
                INSERT INTO horarios_disponibles
                (dia_semana, nombre_dia, hora_inicio, hora_fin, duracion_slot_min, capacidad_por_slot, activo)
                VALUES (:d_num, :d_name, :h_ini, :h_fin, :dur, :cap, :act)
            """), {
                "d_num": d_num,
                "d_name": d_name,
                "h_ini": h_ini,
                "h_fin": h_fin,
                "dur": dur,
                "cap": cap,
                "act": act
            })
        db.commit()

    db.commit()
    _CERSEA_SCHEMA_INITIALIZED = True
    return {"status": "initialized", "tenant_id": TENANT_ID}


def sync_knowledge_to_rag_vectors(db: Session) -> Dict[str, Any]:
    """
    Toma todos los registros activos de `cersea_knowledge`, genera embeddings con OpenAI
    (`text-embedding-3-small`) y actualiza las tablas `documents` y `document_chunks`
    para el tenant `CERSEA`.
    """
    api_key = get_active_openai_key(db)
    if not api_key:
        raise RuntimeError("No hay OPENAI_API_KEY configurada en el servidor para generar vectores RAG.")

    rows = db.execute(text("""
        SELECT id, categoria, pregunta, respuesta
        FROM cersea_knowledge
        WHERE activo = TRUE
        ORDER BY categoria, updated_at ASC
    """)).fetchall()

    db.execute(text("DELETE FROM document_chunks WHERE business_id = :tid"), {"tid": TENANT_ID})
    db.execute(text("DELETE FROM documents WHERE business_id = :tid"), {"tid": TENANT_ID})
    db.commit()

    if not rows:
        return {"status": "success", "chunks_synced": 0}

    full_doc_text = "\n\n".join([f"[{r[1]}] {r[2]}\n{r[3]}" for r in rows])
    doc_meta = json.dumps({"source": "cersea_knowledge_table", "tenant": TENANT_ID})

    doc_row = db.execute(text("""
        INSERT INTO documents (title, path, content, metadata_, business_id)
        VALUES (:title, :path, :content, CAST(:meta AS jsonb), :bid)
        RETURNING id
    """), {
        "title": "Base de Conocimiento Oficial CERSEA, A.C. S.C.",
        "path": "db://cersea_knowledge",
        "content": full_doc_text,
        "meta": doc_meta,
        "bid": TENANT_ID
    }).fetchone()
    doc_id = doc_row[0]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    synced = 0
    for idx, r in enumerate(rows):
        chunk_content = f"Categoría: {r[1]}\nPregunta: {r[2]}\nRespuesta Oficial CERSEA: {r[3]}"
        resp = requests.post(
            "https://api.openai.com/v1/embeddings",
            headers=headers,
            json={"model": "text-embedding-3-small", "input": chunk_content},
            timeout=25
        )
        resp.raise_for_status()
        embedding_vec = resp.json()["data"][0]["embedding"]
        vec_str = "[" + ",".join(f"{x:.8f}" for x in embedding_vec) + "]"

        chunk_meta = json.dumps({
            "knowledge_id": str(r[0]),
            "categoria": r[1],
            "pregunta": r[2]
        })

        db.execute(text("""
            INSERT INTO document_chunks (document_id, chunk_index, content, embedding, metadata_, business_id)
            VALUES (:doc_id, :idx, :content, CAST(:emb AS vector), CAST(:meta AS jsonb), :bid)
        """), {
            "doc_id": doc_id,
            "idx": idx,
            "content": chunk_content,
            "emb": vec_str,
            "meta": chunk_meta,
            "bid": TENANT_ID
        })
        synced += 1

    db.commit()
    return {"status": "success", "document_id": doc_id, "chunks_synced": synced}


def get_available_slots_for_date(db: Session, target_date_str: str) -> Dict[str, Any]:
    """
    Calcula los bloques horarios disponibles para una fecha `YYYY-MM-DD`,
    cruzando la regla de `horarios_disponibles` del día de la semana con las citas activas en `visitas`.
    """
    try:
        target_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError("Formato de fecha inválido. Usa YYYY-MM-DD.")

    weekday = target_date.weekday()

    rule = db.execute(text("""
        SELECT id, dia_semana, nombre_dia, hora_inicio, hora_fin, duracion_slot_min, capacidad_por_slot, activo
        FROM horarios_disponibles
        WHERE dia_semana = :wd
        LIMIT 1
    """), {"wd": weekday}).fetchone()

    if not rule or not rule[7]:
        return {
            "fecha": target_date_str,
            "dia_semana": weekday,
            "nombre_dia": rule[2] if rule else "No habilitado",
            "activo": False,
            "slots": [],
            "slots_disponibles": []
        }

    hora_ini: time = rule[3]
    hora_fin: time = rule[4]
    duracion_min: int = rule[5] or 60
    capacidad_max: int = rule[6] or 1

    counts_rows = db.execute(text("""
        SELECT TO_CHAR(fecha_hora AT TIME ZONE 'America/Tijuana', 'HH24:MI') AS hora_str,
               COUNT(*) AS ocupados
        FROM visitas
        WHERE DATE(fecha_hora AT TIME ZONE 'America/Tijuana') = :fdate
          AND estado IN ('Pendiente', 'Confirmada')
        GROUP BY hora_str
    """), {"fdate": target_date_str}).fetchall()

    ocupados_map = {r[0]: int(r[1]) for r in counts_rows}

    cur_dt = datetime.combine(target_date, hora_ini)
    end_dt = datetime.combine(target_date, hora_fin)

    slots_detail = []
    slots_iso_free = []

    while cur_dt < end_dt:
        h_str = cur_dt.strftime("%H:%M")
        iso_str = f"{target_date_str}T{h_str}:00-07:00"
        usados = ocupados_map.get(h_str, 0)
        restantes = max(0, capacidad_max - usados)
        disponible = restantes > 0

        slots_detail.append({
            "hora": h_str,
            "fecha_hora_iso": iso_str,
            "capacidad_maxima": capacidad_max,
            "ocupados": usados,
            "cupos_disponibles": restantes,
            "disponible": disponible
        })
        if disponible:
            slots_iso_free.append(iso_str)

        cur_dt += timedelta(minutes=duracion_min)

    return {
        "fecha": target_date_str,
        "dia_semana": weekday,
        "nombre_dia": rule[2],
        "activo": True,
        "slots": slots_detail,
        "slots_disponibles": slots_iso_free
    }


def book_visita_concurrent_safe(
    db: Session,
    nombre_visitante: str,
    telefono: str,
    tipo_visita: str,
    fecha_hora_str: str,
    nombre_interno_prospecto: Optional[str] = None,
    notas: Optional[str] = None,
    origen: str = "web"
) -> Dict[str, Any]:
    """
    Registra una visita en PostgreSQL manejando concurrencia estricta (`SELECT ... FOR UPDATE`).
    """
    tipo_norm = "Primer Ingreso" if "ingreso" in (tipo_visita or "").lower() or "valorac" in (tipo_visita or "").lower() else "Familiar"
    if tipo_visita in ("Primer Ingreso", "Familiar"):
        tipo_norm = tipo_visita

    clean_str = fecha_hora_str.strip()
    if " " in clean_str and "T" not in clean_str:
        clean_str = clean_str.replace(" ", "T")
    if len(clean_str) == 16:
        clean_str += ":00-07:00"
    elif "+" not in clean_str and clean_str.count("-") == 2:
        clean_str += "-07:00"

    date_part = clean_str[:10]
    time_part = clean_str[11:16]
    target_date = datetime.strptime(date_part, "%Y-%m-%d").date()
    weekday = target_date.weekday()

    rule = db.execute(text("""
        SELECT id, nombre_dia, hora_inicio, hora_fin, capacidad_por_slot, activo
        FROM horarios_disponibles
        WHERE dia_semana = :wd
        FOR UPDATE
    """), {"wd": weekday}).fetchone()

    if not rule or not rule[5]:
        raise ValueError(f"El centro no tiene horarios de visita habilitados para el día seleccionado ({date_part}).")

    capacidad_max = int(rule[4] or 1)

    active_count = db.execute(text("""
        SELECT COUNT(*)
        FROM visitas
        WHERE DATE(fecha_hora AT TIME ZONE 'America/Tijuana') = :fdate
          AND TO_CHAR(fecha_hora AT TIME ZONE 'America/Tijuana', 'HH24:MI') = :ftime
          AND estado IN ('Pendiente', 'Confirmada')
    """), {"fdate": date_part, "ftime": time_part}).scalar() or 0

    if active_count >= capacidad_max:
        raise RuntimeError(
            f"El horario {time_part} del {date_part} ya se encuentra lleno ({active_count}/{capacidad_max} cupos). "
            f"Por favor selecciona otro horario disponible."
        )

    row = db.execute(text("""
        INSERT INTO visitas (
            nombre_visitante,
            telefono,
            nombre_interno_prospecto,
            tipo_visita,
            fecha_hora,
            estado,
            notas,
            origen
        )
        VALUES (
            :nombre_visitante,
            :telefono,
            :nombre_interno,
            :tipo_visita,
            CAST(:fecha_hora AS timestamptz),
            'Confirmada',
            :notas,
            :origen
        )
        RETURNING id, created_at
    """), {
        "nombre_visitante": nombre_visitante.strip(),
        "telefono": telefono.strip(),
        "nombre_interno": (nombre_interno_prospecto or "").strip() or None,
        "tipo_visita": tipo_norm,
        "fecha_hora": clean_str,
        "notas": notas,
        "origen": origen
    }).fetchone()

    db.commit()

    visita_id = str(row[0])
    folio = f"CERSEA-{visita_id[:8].upper()}"

    return {
        "id": visita_id,
        "folio": folio,
        "nombre_visitante": nombre_visitante.strip(),
        "telefono": telefono.strip(),
        "nombre_interno_prospecto": (nombre_interno_prospecto or "").strip() or "No especificado",
        "tipo_visita": tipo_norm,
        "fecha": date_part,
        "hora": time_part,
        "fecha_hora": clean_str,
        "estado": "Confirmada",
        "origen": origen
    }
