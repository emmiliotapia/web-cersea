"""
Servicio de Lógica de Negocio, Gestor de Créditos IA y Agenda para CERSEA, A.C.
===============================================================================
Maneja:
1. Inicialización y semilla (seed) de tablas oficiales (compatible con PostgreSQL y SQLite local):
   - cersea_knowledge
   - horarios_disponibles
   - visitas
   - business_configs / credit_upsell_requests / chat_histories
2. Gestor de Créditos Multi-Tenant (`mensajes_limite_mes`, `mensajes_consumidos_mes`).
3. Motor de Agenda y Manipulación de Citas:
   - Cálculo de slots disponibles por fecha (`get_available_slots_for_date`)
   - Resumen de disponibilidad multi-día (`get_upcoming_availability_summary`)
   - Reserva con control de concurrencia (`book_visita_concurrent_safe`)
   - Búsqueda por folio/teléfono/nombre (`search_visitas`)
   - Reprogramación y edición completa de citas (`reschedule_or_update_visita`)
   - Cambio de estado y cancelación (`change_visita_status`)
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
    "objective": "Orientar con empatía a familiares sobre el proceso de ingreso, servicios, ubicaciones y convenios (CUSON, ISEA), y gestionar la agenda de visitas familiares o citas de valoración.",
    "role_description": "Consejera digital de primer contacto de CERSEA A.C. S.C. (Centro de Rehabilitación para Mujeres Sembrando Amor).",
    "welcome_message": "Hola, bienvenida a CERSEA. Estamos aquí para escucharte y apoyarte. ¿Te gustaría información sobre un ingreso, consultar horarios o agendar una visita?",
    "model": "gpt-4o-mini",
    "temperature": 0.2,
    "custom_instructions": (
        "1. REGLA DE BREVEDAD Y CALIDEZ: Tus respuestas deben ser CORTAS, cálidas y fáciles de leer (máximo 2 a 4 oraciones breves, o máximo 4 puntos muy concretos). Nunca envíes textos largos.\n"
        "2. FORMATO LIMPIO: No uses símbolos raros ni bloques pesados. Habla de forma natural, empática y con valores cristianos y humanistas.\n"
        "3. Responde dudas sobre ubicaciones (Callejón Oaxaca y 23 #2301 y Callejón Jalisco), teléfonos (653 534 6760 y 653 123 2800), requisitos de ingreso o especialistas usando la base de conocimiento de CERSEA.\n"
        "4. HABILIDAD DE AGENDA (MCP TOOLS): Siempre que el usuario pregunte por fechas, horarios disponibles o quiera agendar, reprogramar o cancelar una cita, DEBES USAR las herramientas del MCP Server (`consulta_agenda`, `agendar`, `buscar_cita`, `reprogramar_cita`, `cancelar_cita`)."
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
            "• Horarios de Visitas y Valoraciones: Lunes a Viernes de 9:00 AM a 5:00 PM (citas de valoración y primer ingreso) y Sábados y Domingos de 10:00 AM a 4:00 PM (visitas familiares y valoraciones)."
        )
    }
]


def _is_pg(db: Session) -> bool:
    dialect = db.bind.dialect.name if db.bind else "sqlite"
    return dialect == "postgresql"


def _parse_time_val(val: Any) -> time:
    if isinstance(val, time):
        return val
    s = str(val).strip()[:5]
    parts = s.split(":")
    return time(int(parts[0]), int(parts[1]))


def _format_time_val(val: Any) -> str:
    if isinstance(val, time):
        return val.strftime("%H:%M")
    return str(val).strip()[:5]


def get_active_openai_key(db: Session, tenant_id: str = TENANT_ID) -> str:
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
    init_cersea_tables_and_seed(db)
    for_update_clause = "FOR UPDATE" if _is_pg(db) else ""
    row = db.execute(text(f"""
        SELECT mensajes_consumidos_mes, mensajes_limite_mes, api_key_override
        FROM business_configs
        WHERE id = :tid
        {for_update_clause}
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
        "tenant_name": "CERSEA, A.C. S.C.",
        "mensajes_consumidos_mes": consumidos,
        "mensajes_limite_mes": limite,
        "mensajes_restantes": restantes,
        "porcentaje_uso": min(100.0, porcentaje),
        "fecha_renovacion_ciclo": dia_renovacion,
        "usa_master_key": True,
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
    init_cersea_tables_and_seed(db)
    status_actual = get_tenant_credits_status(db, TENANT_ID)
    req_id = str(uuid.uuid4())
    now_iso = datetime.now().isoformat()

    if _is_pg(db):
        db.execute(text("""
            INSERT INTO credit_upsell_requests (
                tenant_id, solicitante, telefono_contacto, paquete_solicitado,
                consumo_actual, limite_actual, notas, estado
            )
            VALUES (:tid, :sol, :tel, :paq, :cons, :lim, :not, 'Pendiente')
        """), {
            "tid": TENANT_ID,
            "sol": solicitante,
            "tel": telefono_contacto,
            "paq": paquete,
            "cons": status_actual["mensajes_consumidos_mes"],
            "lim": status_actual["mensajes_limite_mes"],
            "not": notas
        })
    else:
        db.execute(text("""
            INSERT INTO credit_upsell_requests (
                id, tenant_id, solicitante, telefono_contacto, paquete_solicitado,
                consumo_actual, limite_actual, notas, estado, created_at
            )
            VALUES (:id, :tid, :sol, :tel, :paq, :cons, :lim, :not, 'Pendiente', :now)
        """), {
            "id": req_id,
            "tid": TENANT_ID,
            "sol": solicitante,
            "tel": telefono_contacto,
            "paq": paquete,
            "cons": status_actual["mensajes_consumidos_mes"],
            "lim": status_actual["mensajes_limite_mes"],
            "not": notas,
            "now": now_iso
        })
    db.commit()

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
        "timestamp": now_iso
    }

    n8n_webhook_url = os.getenv(
        "SMARTOPS_UPSELL_WEBHOOK_URL",
        "http://smartops-n8n:5678/webhook/smartops-upsell-credits"
    )
    webhook_sent = False
    try:
        resp = requests.post(n8n_webhook_url, json=webhook_payload, timeout=3)
        webhook_sent = resp.status_code < 400
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


def approve_tenant_credits_topup(
    db: Session,
    tenant_id: str = TENANT_ID,
    creditos_extra: int = 1000,
    request_id: Optional[str] = None,
    notas: Optional[str] = None
) -> Dict[str, Any]:
    """
    Conecta la compra de paquetes de tokens/créditos (vía Gestor de Tenants, n8n o Stripe/MercadoPago)
    incrementando `mensajes_limite_mes` en `business_configs` y marcando la solicitud en
    `credit_upsell_requests` como 'Aprobado'.
    """
    init_cersea_tables_and_seed(db)
    db.execute(text("""
        UPDATE business_configs
        SET mensajes_limite_mes = COALESCE(mensajes_limite_mes, 1500) + :extra
        WHERE id = :tid
    """), {"extra": int(creditos_extra), "tid": tenant_id})

    if request_id and request_id.strip():
        db.execute(text("""
            UPDATE credit_upsell_requests
            SET estado = 'Aprobado',
                notas = COALESCE(notas, '') || :nota_extra
            WHERE CAST(id AS TEXT) = :rid
        """), {
            "rid": request_id.strip(),
            "nota_extra": f" | Aprobado (+{creditos_extra})" if not notas else f" | {notas}"
        })

    db.commit()
    nuevo_estado = get_tenant_credits_status(db, tenant_id)
    return {
        "status": "approved",
        "tenant_id": tenant_id,
        "creditos_agregados": int(creditos_extra),
        "credits": nuevo_estado
    }


def reset_tenant_monthly_cycle(
    db: Session,
    tenant_id: str = TENANT_ID,
    nuevo_limite_base: Optional[int] = None
) -> Dict[str, Any]:
    """
    Reinicia `mensajes_consumidos_mes` a 0 al iniciar un nuevo ciclo de facturación mensual.
    """
    init_cersea_tables_and_seed(db)
    if nuevo_limite_base is not None:
        db.execute(text("""
            UPDATE business_configs
            SET mensajes_consumidos_mes = 0,
                mensajes_limite_mes = :lim
            WHERE id = :tid
        """), {"lim": int(nuevo_limite_base), "tid": tenant_id})
    else:
        db.execute(text("""
            UPDATE business_configs
            SET mensajes_consumidos_mes = 0
            WHERE id = :tid
        """), {"tid": tenant_id})
    db.commit()
    return {
        "status": "cycle_reset",
        "tenant_id": tenant_id,
        "credits": get_tenant_credits_status(db, tenant_id)
    }


_CERSEA_SCHEMA_INITIALIZED = False


def init_cersea_tables_and_seed(db: Session) -> Dict[str, Any]:
    global _CERSEA_SCHEMA_INITIALIZED
    if _CERSEA_SCHEMA_INITIALIZED:
        return {"status": "already_initialized", "tenant_id": TENANT_ID}

    is_pg = _is_pg(db)
    if is_pg:
        db.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'))
        db.execute(text("""
            ALTER TABLE business_configs
            ADD COLUMN IF NOT EXISTS api_key_override VARCHAR(255) DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS mensajes_limite_mes INT NOT NULL DEFAULT 1500,
            ADD COLUMN IF NOT EXISTS mensajes_consumidos_mes INT NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS fecha_renovacion_ciclo INT NOT NULL DEFAULT 10;
        """))
    else:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS business_configs (
                id VARCHAR(60) PRIMARY KEY,
                name VARCHAR(150),
                category VARCHAR(120),
                tone VARCHAR(150),
                system_prompt_config TEXT,
                mcp_toggles TEXT,
                api_key_override VARCHAR(255) DEFAULT NULL,
                mensajes_limite_mes INT NOT NULL DEFAULT 1500,
                mensajes_consumidos_mes INT NOT NULL DEFAULT 0,
                fecha_renovacion_ciclo INT NOT NULL DEFAULT 10
            );
        """))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS chat_histories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id VARCHAR(120),
                business_id VARCHAR(60),
                role VARCHAR(30),
                content TEXT,
                timestamp VARCHAR(60)
            );
        """))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS document_chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INT,
                chunk_index INT,
                content TEXT,
                business_id VARCHAR(60)
            );
        """))

    db.execute(text("""
        CREATE TABLE IF NOT EXISTS credit_upsell_requests (
            id VARCHAR(60) PRIMARY KEY,
            tenant_id VARCHAR(60) NOT NULL,
            solicitante VARCHAR(150),
            telefono_contacto VARCHAR(50),
            paquete_solicitado VARCHAR(120),
            consumo_actual INT,
            limite_actual INT,
            notas TEXT,
            estado VARCHAR(30) DEFAULT 'Pendiente',
            created_at VARCHAR(60)
        );
    """))

    db.execute(text("""
        CREATE TABLE IF NOT EXISTS cersea_knowledge (
            id VARCHAR(60) PRIMARY KEY,
            categoria VARCHAR(80) NOT NULL,
            pregunta TEXT NOT NULL,
            respuesta TEXT NOT NULL,
            activo BOOLEAN NOT NULL DEFAULT 1,
            updated_at VARCHAR(60)
        );
    """))

    db.execute(text("""
        CREATE TABLE IF NOT EXISTS horarios_disponibles (
            id VARCHAR(60) PRIMARY KEY,
            dia_semana SMALLINT NOT NULL,
            nombre_dia VARCHAR(25) NOT NULL,
            hora_inicio VARCHAR(20) NOT NULL,
            hora_fin VARCHAR(20) NOT NULL,
            duracion_slot_min INT NOT NULL DEFAULT 60,
            capacidad_por_slot INT NOT NULL DEFAULT 3,
            activo BOOLEAN NOT NULL DEFAULT 1
        );
    """))

    db.execute(text("""
        CREATE TABLE IF NOT EXISTS visitas (
            id VARCHAR(60) PRIMARY KEY,
            nombre_visitante VARCHAR(150) NOT NULL,
            telefono VARCHAR(40) NOT NULL,
            nombre_interno_prospecto VARCHAR(150),
            tipo_visita VARCHAR(40) NOT NULL,
            fecha_hora VARCHAR(60) NOT NULL,
            estado VARCHAR(30) NOT NULL DEFAULT 'Confirmada',
            notas TEXT,
            origen VARCHAR(30) DEFAULT 'web',
            created_at VARCHAR(60)
        );
    """))

    db.commit()

    # Registrar Tenant CERSEA en business_configs si no existe
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
                :id, :name, :category, :tone, :prompt_cfg, :toggles,
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

    # Poblar semilla de cersea_knowledge si está vacía
    know_count = db.execute(text("SELECT COUNT(*) FROM cersea_knowledge")).scalar() or 0
    if know_count == 0:
        now_iso = datetime.now().isoformat()
        for item in INITIAL_KNOWLEDGE_SEED:
            db.execute(text("""
                INSERT INTO cersea_knowledge (id, categoria, pregunta, respuesta, activo, updated_at)
                VALUES (:id, :cat, :preg, :resp, :act, :now)
            """), {
                "id": str(uuid.uuid4()),
                "cat": item["categoria"],
                "preg": item["pregunta"],
                "resp": item["respuesta"],
                "act": True,
                "now": now_iso
            })
        db.commit()

    # Poblar semilla de horarios_disponibles si está vacía
    sched_count = db.execute(text("SELECT COUNT(*) FROM horarios_disponibles")).scalar() or 0
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
                (id, dia_semana, nombre_dia, hora_inicio, hora_fin, duracion_slot_min, capacidad_por_slot, activo)
                VALUES (:id, :d_num, :d_name, :h_ini, :h_fin, :dur, :cap, :act)
            """), {
                "id": str(uuid.uuid4()),
                "d_num": d_num,
                "d_name": d_name,
                "h_ini": h_ini,
                "h_fin": h_fin,
                "dur": dur,
                "cap": cap,
                "act": act
            })
        db.commit()

    # Semilla de citas de demostración para visualizar la agenda en local si está vacía
    vis_count = db.execute(text("SELECT COUNT(*) FROM visitas")).scalar() or 0
    if vis_count == 0 and not is_pg:
        today = date.today()
        sat_offset = (5 - today.weekday()) % 7
        next_sat = (today + timedelta(days=sat_offset)).strftime("%Y-%m-%d")
        next_sun = (today + timedelta(days=sat_offset + 1)).strftime("%Y-%m-%d")
        today_str = today.strftime("%Y-%m-%d")
        demo_visitas = [
            (
                str(uuid.uuid4()),
                "María Guadalupe Hernández",
                "653 118 4420",
                "Lucía Hernández (Hija)",
                "Familiar",
                f"{next_sat}T11:00:00-07:00",
                "Confirmada",
                "Visita familiar de seguimiento quincenal.",
                "web_ui"
            ),
            (
                str(uuid.uuid4()),
                "Roberto Carlos Mendoza",
                "653 539 8102",
                "Sofía Mendoza",
                "Primer Ingreso",
                f"{today_str}T10:00:00-07:00",
                "Pendiente",
                "Solicita valoración médica y psicológica de primer ingreso.",
                "chatbot_mcp"
            ),
            (
                str(uuid.uuid4()),
                "Carmen Elena Vázquez",
                "653 142 9901",
                "Valeria Vázquez",
                "Familiar",
                f"{next_sun}T12:00:00-07:00",
                "Confirmada",
                "Trae artículos de aseo personal autorizados.",
                "web_ui"
            ),
        ]
        now_iso = datetime.now().isoformat()
        for vid, n_vis, tel, n_int, t_vis, f_hr, est, nts, orig in demo_visitas:
            db.execute(text("""
                INSERT INTO visitas (
                    id, nombre_visitante, telefono, nombre_interno_prospecto,
                    tipo_visita, fecha_hora, estado, notas, origen, created_at
                )
                VALUES (:id, :nv, :tel, :ni, :tv, :fh, :est, :nts, :orig, :now)
            """), {
                "id": vid,
                "nv": n_vis,
                "tel": tel,
                "ni": n_int,
                "tv": t_vis,
                "fh": f_hr,
                "est": est,
                "nts": nts,
                "orig": orig,
                "now": now_iso
            })
        db.commit()

    _CERSEA_SCHEMA_INITIALIZED = True
    return {"status": "initialized", "tenant_id": TENANT_ID}


def sync_knowledge_to_rag_vectors(db: Session) -> Dict[str, Any]:
    init_cersea_tables_and_seed(db)
    rows = db.execute(text("""
        SELECT id, categoria, pregunta, respuesta
        FROM cersea_knowledge
        WHERE activo = 1 OR activo = TRUE
        ORDER BY categoria ASC
    """)).fetchall()

    if not _is_pg(db):
        # En entorno SQLite local indexamos directamente en document_chunks para búsqueda instantánea
        db.execute(text("DELETE FROM document_chunks WHERE business_id = :tid"), {"tid": TENANT_ID})
        for idx, r in enumerate(rows):
            chunk_content = f"Categoría: {r[1]}\nPregunta: {r[2]}\nRespuesta Oficial CERSEA: {r[3]}"
            db.execute(text("""
                INSERT INTO document_chunks (document_id, chunk_index, content, business_id)
                VALUES (1, :idx, :content, :bid)
            """), {"idx": idx, "content": chunk_content, "bid": TENANT_ID})
        db.commit()
        return {"status": "success", "document_id": 1, "chunks_synced": len(rows)}

    api_key = get_active_openai_key(db)
    if not api_key:
        raise RuntimeError("No hay OPENAI_API_KEY configurada en el servidor para generar vectores RAG.")

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


def _get_occupied_map_for_date(db: Session, target_date_str: str) -> Dict[str, int]:
    """
    Obtiene el conteo de citas activas (`Pendiente` o `Confirmada`) por hora `HH:MM` para una fecha `YYYY-MM-DD`,
    compatible tanto con PostgreSQL como con SQLite local.
    """
    if _is_pg(db):
        rows = db.execute(text("""
            SELECT TO_CHAR(fecha_hora AT TIME ZONE 'America/Tijuana', 'HH24:MI') AS hora_str,
                   COUNT(*) AS ocupados
            FROM visitas
            WHERE DATE(fecha_hora AT TIME ZONE 'America/Tijuana') = :fdate
              AND estado IN ('Pendiente', 'Confirmada')
            GROUP BY hora_str
        """), {"fdate": target_date_str}).fetchall()
        return {r[0]: int(r[1]) for r in rows}
    else:
        rows = db.execute(text("""
            SELECT fecha_hora
            FROM visitas
            WHERE substr(fecha_hora, 1, 10) = :fdate
              AND estado IN ('Pendiente', 'Confirmada')
        """), {"fdate": target_date_str}).fetchall()
        counts: Dict[str, int] = {}
        for r in rows:
            raw_fh = str(r[0] or "")
            if len(raw_fh) >= 16:
                h_str = raw_fh[11:16]
                counts[h_str] = counts.get(h_str, 0) + 1
        return counts


def get_available_slots_for_date(db: Session, target_date_str: str) -> Dict[str, Any]:
    """
    Calcula los bloques horarios disponibles para una fecha `YYYY-MM-DD`,
    cruzando la regla de `horarios_disponibles` del día de la semana con las citas activas en `visitas`.
    """
    init_cersea_tables_and_seed(db)
    try:
        target_date = datetime.strptime(target_date_str.strip()[:10], "%Y-%m-%d").date()
        target_date_str = target_date.strftime("%Y-%m-%d")
    except ValueError:
        raise ValueError("Formato de fecha inválido. Usa YYYY-MM-DD.")

    weekday = target_date.weekday()

    rule = db.execute(text("""
        SELECT id, dia_semana, nombre_dia, hora_inicio, hora_fin, duracion_slot_min, capacidad_por_slot, activo
        FROM horarios_disponibles
        WHERE dia_semana = :wd
        LIMIT 1
    """), {"wd": weekday}).fetchone()

    if not rule or not bool(rule[7]):
        return {
            "fecha": target_date_str,
            "dia_semana": weekday,
            "nombre_dia": rule[2] if rule else "No habilitado",
            "activo": False,
            "slots": [],
            "slots_disponibles": []
        }

    hora_ini: time = _parse_time_val(rule[3])
    hora_fin: time = _parse_time_val(rule[4])
    duracion_min: int = int(rule[5] or 60)
    capacidad_max: int = int(rule[6] or 1)

    ocupados_map = _get_occupied_map_for_date(db, target_date_str)

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


def get_upcoming_availability_summary(db: Session, start_date_str: Optional[str] = None, days: int = 7) -> List[Dict[str, Any]]:
    """
    Devuelve el resumen de disponibilidad de los próximos N días para que tanto el Home
    como el Agente MCP puedan sugerir fechas y horarios con cupos reales.
    """
    init_cersea_tables_and_seed(db)
    base_date = date.today()
    if start_date_str:
        try:
            base_date = datetime.strptime(start_date_str.strip()[:10], "%Y-%m-%d").date()
        except ValueError:
            pass

    summary = []
    for offset in range(max(1, min(days, 21))):
        d = base_date + timedelta(days=offset)
        d_str = d.strftime("%Y-%m-%d")
        info = get_available_slots_for_date(db, d_str)
        horas_libres = [s["hora"] for s in info["slots"] if s["disponible"]]
        total_cupos_libres = sum(s["cupos_disponibles"] for s in info["slots"])
        summary.append({
            "fecha": d_str,
            "nombre_dia": info["nombre_dia"],
            "activo": info["activo"],
            "total_bloques_libres": len(horas_libres),
            "total_cupos_libres": total_cupos_libres,
            "horas_disponibles": horas_libres
        })
    return summary


def normalize_fecha_hora_iso(fecha_hora_str: str) -> Tuple[str, str, str]:
    clean_str = fecha_hora_str.strip()
    if " " in clean_str and "T" not in clean_str:
        clean_str = clean_str.replace(" ", "T")
    if len(clean_str) == 10:
        clean_str += "T10:00:00-07:00"
    elif len(clean_str) == 16:
        clean_str += ":00-07:00"
    elif "+" not in clean_str and clean_str.count("-") == 2:
        clean_str += "-07:00"
    date_part = clean_str[:10]
    time_part = clean_str[11:16]
    return clean_str, date_part, time_part


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
    Registra una visita validando disponibilidad y concurrencia.
    """
    init_cersea_tables_and_seed(db)
    tipo_norm = (
        "Primer Ingreso"
        if "ingreso" in (tipo_visita or "").lower() or "valorac" in (tipo_visita or "").lower()
        else "Familiar"
    )
    if tipo_visita in ("Primer Ingreso", "Familiar"):
        tipo_norm = tipo_visita

    clean_str, date_part, time_part = normalize_fecha_hora_iso(fecha_hora_str)
    target_date = datetime.strptime(date_part, "%Y-%m-%d").date()
    weekday = target_date.weekday()

    for_update = "FOR UPDATE" if _is_pg(db) else ""
    rule = db.execute(text(f"""
        SELECT id, nombre_dia, hora_inicio, hora_fin, capacidad_por_slot, activo
        FROM horarios_disponibles
        WHERE dia_semana = :wd
        {for_update}
    """), {"wd": weekday}).fetchone()

    if not rule or not bool(rule[5]):
        raise ValueError(f"El centro no tiene horarios de visita habilitados para el día seleccionado ({date_part}).")

    capacidad_max = int(rule[4] or 1)
    ocupados_map = _get_occupied_map_for_date(db, date_part)
    active_count = ocupados_map.get(time_part, 0)

    if active_count >= capacidad_max:
        raise RuntimeError(
            f"El horario {time_part} del {date_part} ya se encuentra lleno ({active_count}/{capacidad_max} cupos). "
            f"Por favor selecciona otro horario disponible."
        )

    visita_id = str(uuid.uuid4())
    now_iso = datetime.now().isoformat()

    if _is_pg(db):
        row = db.execute(text("""
            INSERT INTO visitas (
                nombre_visitante, telefono, nombre_interno_prospecto,
                tipo_visita, fecha_hora, estado, notas, origen
            )
            VALUES (
                :nombre_visitante, :telefono, :nombre_interno,
                :tipo_visita, CAST(:fecha_hora AS timestamptz),
                'Confirmada', :notas, :origen
            )
            RETURNING id
        """), {
            "nombre_visitante": nombre_visitante.strip(),
            "telefono": telefono.strip(),
            "nombre_interno": (nombre_interno_prospecto or "").strip() or None,
            "tipo_visita": tipo_norm,
            "fecha_hora": clean_str,
            "notas": notas,
            "origen": origen
        }).fetchone()
        visita_id = str(row[0])
    else:
        db.execute(text("""
            INSERT INTO visitas (
                id, nombre_visitante, telefono, nombre_interno_prospecto,
                tipo_visita, fecha_hora, estado, notas, origen, created_at
            )
            VALUES (
                :id, :nombre_visitante, :telefono, :nombre_interno,
                :tipo_visita, :fecha_hora, 'Confirmada', :notas, :origen, :created_at
            )
        """), {
            "id": visita_id,
            "nombre_visitante": nombre_visitante.strip(),
            "telefono": telefono.strip(),
            "nombre_interno": (nombre_interno_prospecto or "").strip() or None,
            "tipo_visita": tipo_norm,
            "fecha_hora": clean_str,
            "notas": notas,
            "origen": origen,
            "created_at": now_iso
        })

    db.commit()
    folio = f"CERSEA-{visita_id[:8].upper()}"

    return {
        "status": "success",
        "id": visita_id,
        "folio": folio,
        "nombre_visitante": nombre_visitante.strip(),
        "telefono": telefono.strip(),
        "nombre_interno_prospecto": (nombre_interno_prospecto or "").strip() or "Por especificar en recepción",
        "tipo_visita": tipo_norm,
        "fecha": date_part,
        "hora": time_part,
        "fecha_hora": clean_str,
        "estado": "Confirmada",
        "notas": notas or "",
        "origen": origen
    }


def _row_to_visita_dict(r: Any) -> Dict[str, Any]:
    vid = str(r[0])
    raw_fh = r[5].isoformat() if hasattr(r[5], "isoformat") else str(r[5] or "")
    date_part = raw_fh[:10] if len(raw_fh) >= 10 else ""
    time_part = raw_fh[11:16] if len(raw_fh) >= 16 else ""
    raw_created = r[9].isoformat() if (len(r) > 9 and hasattr(r[9], "isoformat")) else (str(r[9]) if len(r) > 9 and r[9] else None)
    return {
        "id": vid,
        "folio": f"CERSEA-{vid[:8].upper()}",
        "nombre_visitante": r[1],
        "telefono": r[2],
        "nombre_interno_prospecto": r[3] or "—",
        "tipo_visita": r[4],
        "fecha_hora": raw_fh,
        "fecha": date_part,
        "hora": time_part,
        "estado": r[6],
        "notas": r[7] or "",
        "origen": r[8] or "web",
        "created_at": raw_created
    }


def search_visitas(
    db: Session,
    query: Optional[str] = None,
    fecha: Optional[str] = None,
    estado: Optional[str] = None,
    tipo_visita: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """
    Busca y filtra citas por folio (`CERSEA-XXXX`), teléfono, nombre del visitante,
    nombre de la interna, fecha (`YYYY-MM-DD`), estado o tipo de visita.
    """
    init_cersea_tables_and_seed(db)
    rows = db.execute(text("""
        SELECT id, nombre_visitante, telefono, nombre_interno_prospecto,
               tipo_visita, fecha_hora, estado, notas, origen, created_at
        FROM visitas
        ORDER BY fecha_hora ASC
    """)).fetchall()

    results = [_row_to_visita_dict(r) for r in rows]

    if estado and estado != "Todos":
        results = [v for v in results if v["estado"].lower() == estado.strip().lower()]

    if tipo_visita and tipo_visita != "Todos":
        results = [v for v in results if v["tipo_visita"].lower() == tipo_visita.strip().lower()]

    if fecha and fecha.strip():
        f_clean = fecha.strip()[:10]
        results = [v for v in results if v["fecha"] == f_clean]

    if query and query.strip():
        q = query.strip().lower()
        results = [
            v for v in results
            if q in v["folio"].lower()
            or q in v["id"].lower()
            or q in (v["nombre_visitante"] or "").lower()
            or q in (v["telefono"] or "").lower()
            or q in (v["nombre_interno_prospecto"] or "").lower()
            or q in (v["notas"] or "").lower()
        ]

    return results[:limit]


def reschedule_or_update_visita(
    db: Session,
    identifier: str,
    nueva_fecha_hora: Optional[str] = None,
    nombre_visitante: Optional[str] = None,
    telefono: Optional[str] = None,
    nombre_interno_prospecto: Optional[str] = None,
    tipo_visita: Optional[str] = None,
    estado: Optional[str] = None,
    notas: Optional[str] = None
) -> Dict[str, Any]:
    """
    Permite reprogramar la fecha/hora de una cita existente o editar cualquiera de sus datos
    identificándola por su ID o por su Folio (`CERSEA-XXXXXXXX`).
    """
    init_cersea_tables_and_seed(db)
    matches = search_visitas(db, query=identifier.strip())
    if not matches:
        raise ValueError(f"No se encontró ninguna cita con el identificador o folio '{identifier}'.")

    target = matches[0]
    vid = target["id"]

    final_fh = target["fecha_hora"]
    if nueva_fecha_hora and nueva_fecha_hora.strip():
        clean_str, date_part, time_part = normalize_fecha_hora_iso(nueva_fecha_hora)
        # Si cambió la fecha o la hora, validamos disponibilidad del nuevo bloque
        if date_part != target["fecha"] or time_part != target["hora"]:
            slots_info = get_available_slots_for_date(db, date_part)
            if not slots_info["activo"]:
                raise ValueError(f"El día {date_part} no tiene horarios habilitados en la clínica.")
            matching_slot = next((s for s in slots_info["slots"] if s["hora"] == time_part), None)
            if not matching_slot:
                raise ValueError(f"El horario {time_part} no existe dentro de los bloques del día {date_part}.")
            if not matching_slot["disponible"]:
                raise RuntimeError(f"El horario {time_part} del {date_part} ya tiene el cupo lleno.")
        final_fh = clean_str

    final_nv = nombre_visitante.strip() if nombre_visitante is not None else target["nombre_visitante"]
    final_tel = telefono.strip() if telefono is not None else target["telefono"]
    final_ni = (
        nombre_interno_prospecto.strip()
        if nombre_interno_prospecto is not None
        else (target["nombre_interno_prospecto"] if target["nombre_interno_prospecto"] != "—" else "")
    )
    final_tv = tipo_visita if tipo_visita in ("Primer Ingreso", "Familiar") else target["tipo_visita"]
    final_est = estado if estado in ("Pendiente", "Confirmada", "Cancelada") else target["estado"]
    final_nts = notas if notas is not None else target["notas"]

    if _is_pg(db):
        db.execute(text("""
            UPDATE visitas
            SET nombre_visitante = :nv,
                telefono = :tel,
                nombre_interno_prospecto = :ni,
                tipo_visita = :tv,
                fecha_hora = CAST(:fh AS timestamptz),
                estado = :est,
                notas = :nts
            WHERE id = CAST(:vid AS UUID)
        """), {
            "nv": final_nv,
            "tel": final_tel,
            "ni": final_ni or None,
            "tv": final_tv,
            "fh": final_fh,
            "est": final_est,
            "nts": final_nts,
            "vid": vid
        })
    else:
        db.execute(text("""
            UPDATE visitas
            SET nombre_visitante = :nv,
                telefono = :tel,
                nombre_interno_prospecto = :ni,
                tipo_visita = :tv,
                fecha_hora = :fh,
                estado = :est,
                notas = :nts
            WHERE id = :vid
        """), {
            "nv": final_nv,
            "tel": final_tel,
            "ni": final_ni or None,
            "tv": final_tv,
            "fh": final_fh,
            "est": final_est,
            "nts": final_nts,
            "vid": vid
        })

    db.commit()
    updated_list = search_visitas(db, query=vid)
    return updated_list[0] if updated_list else {"id": vid, "status": "updated"}
