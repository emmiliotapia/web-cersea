"""
Router de API para CERSEA, A.C. (Público + Panel Administrativo Llave en Mano)
==============================================================================
Expone los endpoints REST para:
1. Agendamiento público de visitas y consulta de horarios disponibles.
2. Dashboard de Consumo de Créditos IA (`mensajes_consumidos_mes` / `mensajes_limite_mes`)
   y botón de Upsell (`POST /api/cersea/credits/request-upsell` -> Webhook SmartOps).
3. Administración de `cersea_knowledge` y sincronización de vectores RAG (`pgvector`).
4. Configuración de personalidad del Agente (sin exponer API Keys al cliente).
5. Gestión de citas (`visitas`) y monitoreo de conversaciones (`chat_histories`).
"""

import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.services.cersea_service import (
    TENANT_ID,
    DEFAULT_CERSEA_PROMPT_CONFIG,
    init_cersea_tables_and_seed,
    sync_knowledge_to_rag_vectors,
    get_available_slots_for_date,
    book_visita_concurrent_safe,
    get_tenant_credits_status,
    trigger_upsell_webhook
)

router = APIRouter(prefix="/api/cersea", tags=["CERSEA Web & Bot"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =====================================================================
# ESQUEMAS PYDANTIC (CONTRATOS DE DATOS)
# =====================================================================

class CreateVisitaPayload(BaseModel):
    nombre_visitante: str
    telefono: str
    nombre_interno_prospecto: Optional[str] = None
    tipo_visita: str = "Familiar"
    fecha_hora: str
    notas: Optional[str] = None
    origen: Optional[str] = "web"


class UpdateVisitaEstadoPayload(BaseModel):
    estado: str


class KnowledgeItemPayload(BaseModel):
    categoria: str
    pregunta: str
    respuesta: str
    activo: bool = True


class HorarioDiaPayload(BaseModel):
    hora_inicio: str
    hora_fin: str
    duracion_slot_min: int = 60
    capacidad_por_slot: int = 3
    activo: bool = True


class AgentConfigPayload(BaseModel):
    role: str
    tone: str
    mission: str
    vision: str
    objective: str
    welcome_message: str
    custom_instructions: str


class UpsellRequestPayload(BaseModel):
    solicitante: Optional[str] = "Administración CERSEA, A.C."
    telefono_contacto: Optional[str] = "653 534 6760"
    paquete: Optional[str] = "+1,000 créditos IA ($500 MXN)"
    notas: Optional[str] = ""


# =====================================================================
# 1. INICIALIZACIÓN, SALUD Y GESTOR DE CRÉDITOS IA
# =====================================================================

@router.get("/health")
def cersea_health(db: Session = Depends(get_db)):
    init_cersea_tables_and_seed(db)
    total_visitas = db.execute(text("SELECT COUNT(*) FROM visitas")).scalar() or 0
    total_knowledge = db.execute(text("SELECT COUNT(*) FROM cersea_knowledge WHERE activo = TRUE")).scalar() or 0
    total_vectors = db.execute(
        text("SELECT COUNT(*) FROM document_chunks WHERE business_id = :tid"),
        {"tid": TENANT_ID}
    ).scalar() or 0
    credits = get_tenant_credits_status(db, TENANT_ID)

    return {
        "status": "ok",
        "tenant_id": TENANT_ID,
        "project": "CERSEA WEB & BOT",
        "stats": {
            "total_visitas": total_visitas,
            "knowledge_items": total_knowledge,
            "rag_vectors": total_vectors
        },
        "credits": credits
    }


@router.get("/credits")
def obtener_estado_creditos(db: Session = Depends(get_db)):
    """
    Devuelve el consumo mensual de interacciones IA (`mensajes_consumidos_mes` / `mensajes_limite_mes`)
    y la fecha de renovación del ciclo para el Dashboard del cliente en `/admin`.
    """
    return get_tenant_credits_status(db, TENANT_ID)


@router.post("/credits/request-upsell")
def solicitar_mas_creditos(payload: UpsellRequestPayload, db: Session = Depends(get_db)):
    """
    Botón de Upsell en `/admin`: Registra la solicitud de +1,000 créditos por $500 MXN
    y envía el webhook/notificación a Emilio (SmartOps Agency).
    """
    return trigger_upsell_webhook(
        db=db,
        solicitante=payload.solicitante or "Administración CERSEA, A.C.",
        telefono_contacto=payload.telefono_contacto or "653 534 6760",
        paquete=payload.paquete or "+1,000 créditos IA ($500 MXN)",
        notas=payload.notas or ""
    )


# =====================================================================
# 2. HORARIOS DISPONIBLES Y CONFIGURACIÓN DE CALENDARIO
# =====================================================================

@router.get("/horarios/disponibles")
def obtener_horarios_disponibles(
    fecha: str = Query(..., description="Fecha en formato YYYY-MM-DD"),
    db: Session = Depends(get_db)
):
    init_cersea_tables_and_seed(db)
    try:
        return get_available_slots_for_date(db, fecha)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.get("/horarios/config")
def listar_configuracion_horarios(db: Session = Depends(get_db)):
    init_cersea_tables_and_seed(db)
    rows = db.execute(text("""
        SELECT id, dia_semana, nombre_dia,
               TO_CHAR(hora_inicio, 'HH24:MI') AS hora_inicio,
               TO_CHAR(hora_fin, 'HH24:MI') AS hora_fin,
               duracion_slot_min, capacidad_por_slot, activo
        FROM horarios_disponibles
        ORDER BY dia_semana ASC
    """)).fetchall()

    return [
        {
            "id": str(r[0]),
            "dia_semana": r[1],
            "nombre_dia": r[2],
            "hora_inicio": r[3],
            "hora_fin": r[4],
            "duracion_slot_min": r[5],
            "capacidad_por_slot": r[6],
            "activo": r[7]
        }
        for r in rows
    ]


@router.put("/horarios/config/{dia_semana}")
def actualizar_horario_dia(
    dia_semana: int,
    payload: HorarioDiaPayload,
    db: Session = Depends(get_db)
):
    db.execute(text("""
        UPDATE horarios_disponibles
        SET hora_inicio = CAST(:h_ini AS TIME),
            hora_fin = CAST(:h_fin AS TIME),
            duracion_slot_min = :dur,
            capacidad_por_slot = :cap,
            activo = :act
        WHERE dia_semana = :wd
    """), {
        "h_ini": payload.hora_inicio,
        "h_fin": payload.hora_fin,
        "dur": payload.duracion_slot_min,
        "cap": payload.capacidad_por_slot,
        "act": payload.activo,
        "wd": dia_semana
    })
    db.commit()
    return {"status": "updated", "dia_semana": dia_semana}


# =====================================================================
# 3. GESTIÓN DE VISITAS Y AGENDAMIENTO CONCURRENTE
# =====================================================================

@router.get("/visitas")
def listar_visitas(
    estado: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    init_cersea_tables_and_seed(db)
    query_sql = """
        SELECT id, nombre_visitante, telefono, nombre_interno_prospecto,
               tipo_visita, fecha_hora, estado, notas, origen, created_at
        FROM visitas
    """
    params: Dict[str, Any] = {"lim": limit}
    if estado:
        query_sql += " WHERE estado = :est"
        params["est"] = estado
    query_sql += " ORDER BY fecha_hora DESC LIMIT :lim"

    rows = db.execute(text(query_sql), params).fetchall()
    return [
        {
            "id": str(r[0]),
            "folio": f"CERSEA-{str(r[0])[:8].upper()}",
            "nombre_visitante": r[1],
            "telefono": r[2],
            "nombre_interno_prospecto": r[3] or "—",
            "tipo_visita": r[4],
            "fecha_hora": r[5].isoformat() if r[5] else None,
            "estado": r[6],
            "notas": r[7],
            "origen": r[8] or "web",
            "created_at": r[9].isoformat() if r[9] else None
        }
        for r in rows
    ]


@router.post("/visitas", status_code=201)
def crear_visita(payload: CreateVisitaPayload, db: Session = Depends(get_db)):
    init_cersea_tables_and_seed(db)
    try:
        return book_visita_concurrent_safe(
            db=db,
            nombre_visitante=payload.nombre_visitante,
            telefono=payload.telefono,
            tipo_visita=payload.tipo_visita,
            fecha_hora_str=payload.fecha_hora,
            nombre_interno_prospecto=payload.nombre_interno_prospecto,
            notas=payload.notas,
            origen=payload.origen or "web"
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re_err:
        raise HTTPException(status_code=409, detail=str(re_err))


@router.patch("/visitas/{visita_id}/estado")
def cambiar_estado_visita(
    visita_id: str,
    payload: UpdateVisitaEstadoPayload,
    db: Session = Depends(get_db)
):
    if payload.estado not in ("Pendiente", "Confirmada", "Cancelada"):
        raise HTTPException(status_code=400, detail="Estado inválido.")
    db.execute(text("""
        UPDATE visitas SET estado = :est WHERE id = CAST(:vid AS UUID)
    """), {"est": payload.estado, "vid": visita_id})
    db.commit()
    return {"status": "updated", "id": visita_id, "estado": payload.estado}


# =====================================================================
# 4. BASE DE CONOCIMIENTO (`cersea_knowledge`) + RAG SYNC
# =====================================================================

@router.get("/knowledge")
def listar_knowledge(categoria: Optional[str] = None, db: Session = Depends(get_db)):
    init_cersea_tables_and_seed(db)
    sql = "SELECT id, categoria, pregunta, respuesta, activo, updated_at FROM cersea_knowledge"
    params: Dict[str, Any] = {}
    if categoria:
        sql += " WHERE categoria = :cat"
        params["cat"] = categoria
    sql += " ORDER BY categoria ASC, updated_at DESC"
    rows = db.execute(text(sql), params).fetchall()
    return [
        {
            "id": str(r[0]),
            "categoria": r[1],
            "pregunta": r[2],
            "respuesta": r[3],
            "activo": r[4],
            "updated_at": r[5].isoformat() if r[5] else None
        }
        for r in rows
    ]


@router.post("/knowledge", status_code=201)
def crear_knowledge_item(payload: KnowledgeItemPayload, db: Session = Depends(get_db)):
    row = db.execute(text("""
        INSERT INTO cersea_knowledge (categoria, pregunta, respuesta, activo, updated_at)
        VALUES (:cat, :preg, :resp, :act, NOW())
        RETURNING id
    """), {
        "cat": payload.categoria.strip(),
        "preg": payload.pregunta.strip(),
        "resp": payload.respuesta.strip(),
        "act": payload.activo
    }).fetchone()
    db.commit()
    return {"status": "created", "id": str(row[0])}


@router.put("/knowledge/{item_id}")
def actualizar_knowledge_item(item_id: str, payload: KnowledgeItemPayload, db: Session = Depends(get_db)):
    db.execute(text("""
        UPDATE cersea_knowledge
        SET categoria = :cat, pregunta = :preg, respuesta = :resp, activo = :act, updated_at = NOW()
        WHERE id = CAST(:iid AS UUID)
    """), {
        "cat": payload.categoria.strip(),
        "preg": payload.pregunta.strip(),
        "resp": payload.respuesta.strip(),
        "act": payload.activo,
        "iid": item_id
    })
    db.commit()
    return {"status": "updated", "id": item_id}


@router.delete("/knowledge/{item_id}")
def eliminar_knowledge_item(item_id: str, db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM cersea_knowledge WHERE id = CAST(:iid AS UUID)"), {"iid": item_id})
    db.commit()
    return {"status": "deleted", "id": item_id}


@router.post("/knowledge/sync-rag")
def sincronizar_rag_cersea(db: Session = Depends(get_db)):
    init_cersea_tables_and_seed(db)
    try:
        return sync_knowledge_to_rag_vectors(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al sincronizar vectores RAG: {e}")


# =====================================================================
# 5. CONFIGURACIÓN DEL ASISTENTE (SERVICIO LLAVE EN MANO SIN API KEY)
# =====================================================================

@router.get("/agent-config")
def obtener_agent_config(db: Session = Depends(get_db)):
    init_cersea_tables_and_seed(db)
    row = db.execute(
        text("SELECT name, tone, system_prompt_config FROM business_configs WHERE id = :tid"),
        {"tid": TENANT_ID}
    ).fetchone()

    cfg = dict(DEFAULT_CERSEA_PROMPT_CONFIG)
    if row and row[2]:
        stored = row[2] if isinstance(row[2], dict) else json.loads(row[2])
        cfg.update(stored)

    return {
        "tenant_id": TENANT_ID,
        "name": row[0] if row else "CERSEA, A.C. S.C.",
        "role": cfg.get("role", DEFAULT_CERSEA_PROMPT_CONFIG["role"]),
        "tone": cfg.get("tone", DEFAULT_CERSEA_PROMPT_CONFIG["tone"]),
        "mission": cfg.get("mission", DEFAULT_CERSEA_PROMPT_CONFIG["mission"]),
        "vision": cfg.get("vision", DEFAULT_CERSEA_PROMPT_CONFIG["vision"]),
        "objective": cfg.get("objective", DEFAULT_CERSEA_PROMPT_CONFIG["objective"]),
        "welcome_message": cfg.get("welcome_message", DEFAULT_CERSEA_PROMPT_CONFIG["welcome_message"]),
        "custom_instructions": cfg.get("custom_instructions", DEFAULT_CERSEA_PROMPT_CONFIG["custom_instructions"])
    }


@router.put("/agent-config")
def guardar_agent_config(payload: AgentConfigPayload, db: Session = Depends(get_db)):
    init_cersea_tables_and_seed(db)
    row = db.execute(
        text("SELECT system_prompt_config FROM business_configs WHERE id = :tid"),
        {"tid": TENANT_ID}
    ).fetchone()

    current_cfg = dict(DEFAULT_CERSEA_PROMPT_CONFIG)
    if row and row[0]:
        stored = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        current_cfg.update(stored)

    updated_cfg = {
        **current_cfg,
        "role": payload.role,
        "tone": payload.tone,
        "mission": payload.mission,
        "vision": payload.vision,
        "objective": payload.objective,
        "welcome_message": payload.welcome_message,
        "custom_instructions": payload.custom_instructions
    }

    db.execute(text("""
        UPDATE business_configs
        SET tone = :tone,
            system_prompt_config = CAST(:cfg AS jsonb)
        WHERE id = :tid
    """), {
        "tone": payload.tone,
        "cfg": json.dumps(updated_cfg),
        "tid": TENANT_ID
    })
    db.commit()
    return {"status": "saved", "tenant_id": TENANT_ID}


# =====================================================================
# 6. MONITOREO DE CONVERSACIONES DEL CHATBOT
# =====================================================================

@router.get("/conversations")
def listar_conversaciones_cersea(limit: int = 80, db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT id, session_id, role, content, timestamp
        FROM chat_histories
        WHERE business_id = :tid
        ORDER BY id DESC
        LIMIT :lim
    """), {"tid": TENANT_ID, "lim": limit}).fetchall()

    return [
        {
            "id": r[0],
            "session_id": r[1],
            "role": r[2],
            "content": r[3],
            "timestamp": r[4]
        }
        for r in reversed(rows)
    ]
