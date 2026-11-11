"""
Router de API para CERSEA, A.C. (Público + Panel Administrativo + MCP Server)
=============================================================================
Expone los endpoints REST para:
1. Agendamiento público de visitas, consulta de horarios por día y resumen de próximos días.
2. Manipulación avanzada de agendas: creación, edición/reprogramación, filtrado por fecha/búsqueda,
   cambio de estado y eliminación de citas (`visitas`).
3. Servidor de Herramientas MCP (`/api/cersea/mcp/tools` y `/api/cersea/mcp/execute`).
4. Dashboard de Consumo de Créditos IA y botón de Upsell.
5. Administración de `cersea_knowledge` y configuración del asistente.
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
    get_upcoming_availability_summary,
    book_visita_concurrent_safe,
    search_visitas,
    reschedule_or_update_visita,
    get_tenant_credits_status,
    trigger_upsell_webhook,
    approve_tenant_credits_topup,
    reset_tenant_monthly_cycle,
    _format_time_val
)
from app.mcp_server import OPENAI_MCP_TOOLS_SCHEMA, execute_mcp_tool

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


class UpdateVisitaPayload(BaseModel):
    nueva_fecha_hora: Optional[str] = None
    nombre_visitante: Optional[str] = None
    telefono: Optional[str] = None
    nombre_interno_prospecto: Optional[str] = None
    tipo_visita: Optional[str] = None
    estado: Optional[str] = None
    notas: Optional[str] = None


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
    mission: Optional[str] = ""
    vision: Optional[str] = ""
    objective: Optional[str] = ""
    welcome_message: str
    custom_instructions: str


class UpsellRequestPayload(BaseModel):
    solicitante: Optional[str] = "Administración CERSEA, A.C."
    telefono_contacto: Optional[str] = "653 534 6760"
    paquete_solicitado: Optional[str] = "+1,000 créditos IA ($500 MXN)"
    paquete: Optional[str] = None
    notas: Optional[str] = ""


class ApproveTopupPayload(BaseModel):
    tenant_id: Optional[str] = TENANT_ID
    creditos_extra: int = 1000
    request_id: Optional[str] = None
    notas: Optional[str] = None


class ResetCyclePayload(BaseModel):
    tenant_id: Optional[str] = TENANT_ID
    nuevo_limite_base: Optional[int] = None


class McpToolExecutionPayload(BaseModel):
    name: str
    arguments: Dict[str, Any] = {}


# =====================================================================
# 1. INICIALIZACIÓN, SALUD Y GESTOR DE CRÉDITOS IA
# =====================================================================

@router.get("/health")
def cersea_health(db: Session = Depends(get_db)):
    init_cersea_tables_and_seed(db)
    total_visitas = db.execute(text("SELECT COUNT(*) FROM visitas")).scalar() or 0
    total_knowledge = db.execute(text("SELECT COUNT(*) FROM cersea_knowledge WHERE activo = 1 OR activo = TRUE")).scalar() or 0
    total_vectors = db.execute(
        text("SELECT COUNT(*) FROM document_chunks WHERE business_id = :tid"),
        {"tid": TENANT_ID}
    ).scalar() or 0
    credits = get_tenant_credits_status(db, TENANT_ID)

    return {
        "status": "ok",
        "tenant_id": TENANT_ID,
        "project": "CERSEA WEB & BOT",
        "mcp_server": "cersea-agenda-mcp (activo)",
        "stats": {
            "total_visitas": total_visitas,
            "knowledge_items": total_knowledge,
            "rag_vectors": total_vectors
        },
        "credits": credits
    }


@router.get("/credits")
def obtener_estado_creditos(db: Session = Depends(get_db)):
    return get_tenant_credits_status(db, TENANT_ID)


@router.post("/credits/request-upsell")
def solicitar_mas_creditos(payload: UpsellRequestPayload, db: Session = Depends(get_db)):
    paq = payload.paquete_solicitado or payload.paquete or "+1,000 créditos IA ($500 MXN)"
    return trigger_upsell_webhook(
        db=db,
        solicitante=payload.solicitante or "Administración CERSEA, A.C.",
        telefono_contacto=payload.telefono_contacto or "653 534 6760",
        paquete=paq,
        notas=payload.notas or ""
    )


@router.post("/credits/approve-topup")
def aprobar_recarga_creditos(payload: ApproveTopupPayload, db: Session = Depends(get_db)):
    """
    Endpoint para el Gestor de Tenants de SmartOps / Webhook de n8n / Stripe:
    Suma `creditos_extra` al `mensajes_limite_mes` del tenant y marca el upsell como 'Aprobado'.
    """
    return approve_tenant_credits_topup(
        db=db,
        tenant_id=payload.tenant_id or TENANT_ID,
        creditos_extra=payload.creditos_extra,
        request_id=payload.request_id,
        notas=payload.notas
    )


@router.post("/credits/reset-cycle")
def reiniciar_ciclo_mensual(payload: ResetCyclePayload, db: Session = Depends(get_db)):
    """
    Reinicia `mensajes_consumidos_mes` a 0 al iniciar el nuevo ciclo de facturación mensual.
    """
    return reset_tenant_monthly_cycle(
        db=db,
        tenant_id=payload.tenant_id or TENANT_ID,
        nuevo_limite_base=payload.nuevo_limite_base
    )


# =====================================================================
# 2. ENDPOINTS DEL MCP SERVER (MODEL CONTEXT PROTOCOL)
# =====================================================================

@router.get("/mcp/tools")
def listar_herramientas_mcp():
    """
    Lista las herramientas expuestas por el MCP Server de CERSEA (`consulta_agenda`, `agendar`,
    `buscar_cita`, `reprogramar_cita`, `cancelar_cita`, `consultar_informacion_cersea`).
    """
    return {
        "server": "cersea-agenda-mcp",
        "version": "1.0.0",
        "tools": [t["function"] for t in OPENAI_MCP_TOOLS_SCHEMA]
    }


@router.post("/mcp/execute")
def ejecutar_herramienta_mcp(payload: McpToolExecutionPayload):
    """
    Permite probar o invocar directamente cualquier herramienta del MCP Server de CERSEA.
    """
    result = execute_mcp_tool(payload.name, payload.arguments)
    return {
        "tool": payload.name,
        "result": result
    }


# =====================================================================
# 3. HORARIOS DISPONIBLES, RESUMEN SEMANAL Y CONFIGURACIÓN DE AGENDA
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


@router.get("/horarios/resumen")
def obtener_resumen_proximos_dias(
    dias: int = Query(10, ge=1, le=21),
    fecha_inicio: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Devuelve la disponibilidad de los próximos N días con el conteo de bloques y cupos libres,
    para mostrar indicadores reales en las tarjetas del Home y en el gestor de agendas.
    """
    init_cersea_tables_and_seed(db)
    return get_upcoming_availability_summary(db, start_date_str=fecha_inicio, days=dias)


@router.get("/horarios/config")
def listar_configuracion_horarios(db: Session = Depends(get_db)):
    init_cersea_tables_and_seed(db)
    rows = db.execute(text("""
        SELECT id, dia_semana, nombre_dia,
               hora_inicio, hora_fin,
               duracion_slot_min, capacidad_por_slot, activo
        FROM horarios_disponibles
        ORDER BY dia_semana ASC
    """)).fetchall()

    return [
        {
            "id": str(r[0]),
            "dia_semana": int(r[1]),
            "nombre_dia": r[2],
            "hora_inicio": _format_time_val(r[3]),
            "hora_fin": _format_time_val(r[4]),
            "duracion_slot_min": int(r[5] or 60),
            "capacidad_por_slot": int(r[6] or 3),
            "activo": bool(r[7])
        }
        for r in rows
    ]


@router.put("/horarios/config/{dia_semana}")
def actualizar_horario_dia(
    dia_semana: int,
    payload: HorarioDiaPayload,
    db: Session = Depends(get_db)
):
    init_cersea_tables_and_seed(db)
    db.execute(text("""
        UPDATE horarios_disponibles
        SET hora_inicio = :h_ini,
            hora_fin = :h_fin,
            duracion_slot_min = :dur,
            capacidad_por_slot = :cap,
            activo = :act
        WHERE dia_semana = :wd
    """), {
        "h_ini": payload.hora_inicio.strip()[:5],
        "h_fin": payload.hora_fin.strip()[:5],
        "dur": int(payload.duracion_slot_min),
        "cap": int(payload.capacidad_por_slot),
        "act": bool(payload.activo),
        "wd": dia_semana
    })
    db.commit()
    return {"status": "updated", "dia_semana": dia_semana}


# =====================================================================
# 4. GESTIÓN Y MANIPULACIÓN AVANZADA DE VISITAS Y AGENDAS
# =====================================================================

@router.get("/visitas")
def listar_visitas(
    estado: Optional[str] = None,
    fecha: Optional[str] = None,
    tipo_visita: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 150,
    db: Session = Depends(get_db)
):
    """
    Lista y filtra las citas agendadas por estado, fecha exacta (`YYYY-MM-DD`),
    tipo de visita (`Familiar` / `Primer Ingreso`) o búsqueda libre (`q`: folio, nombre, teléfono).
    """
    return search_visitas(
        db=db,
        query=q,
        fecha=fecha,
        estado=estado,
        tipo_visita=tipo_visita,
        limit=limit
    )


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


@router.put("/visitas/{visita_id}")
def actualizar_o_reprogramar_visita(
    visita_id: str,
    payload: UpdateVisitaPayload,
    db: Session = Depends(get_db)
):
    """
    Permite reprogramar fecha/hora o editar datos del familiar, interna, tipo de visita,
    notas y estado directamente desde el gestor de agendas.
    """
    try:
        return reschedule_or_update_visita(
            db=db,
            identifier=visita_id,
            nueva_fecha_hora=payload.nueva_fecha_hora,
            nombre_visitante=payload.nombre_visitante,
            telefono=payload.telefono,
            nombre_interno_prospecto=payload.nombre_interno_prospecto,
            tipo_visita=payload.tipo_visita,
            estado=payload.estado,
            notas=payload.notas
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
    try:
        return reschedule_or_update_visita(
            db=db,
            identifier=visita_id,
            estado=payload.estado
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.delete("/visitas/{visita_id}")
def eliminar_visita(visita_id: str, db: Session = Depends(get_db)):
    init_cersea_tables_and_seed(db)
    db.execute(text("DELETE FROM visitas WHERE CAST(id AS TEXT) = :vid"), {"vid": visita_id})
    db.commit()
    return {"status": "deleted", "id": visita_id}


# =====================================================================
# 5. BASE DE CONOCIMIENTO (`cersea_knowledge`) + RAG SYNC
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
            "activo": bool(r[4]),
            "updated_at": r[5].isoformat() if hasattr(r[5], "isoformat") else str(r[5] or "")
        }
        for r in rows
    ]


@router.post("/knowledge", status_code=201)
def crear_knowledge_item(payload: KnowledgeItemPayload, db: Session = Depends(get_db)):
    import uuid
    from datetime import datetime
    from app.services.cersea_service import _is_pg
    new_id = str(uuid.uuid4())
    now_str = datetime.now().isoformat()
    if _is_pg(db):
        row = db.execute(text("""
            INSERT INTO cersea_knowledge (categoria, pregunta, respuesta, activo, updated_at)
            VALUES (:cat, :preg, :resp, :act, NOW())
            RETURNING id
        """), {
            "cat": payload.categoria.strip(),
            "preg": payload.pregunta.strip(),
            "resp": payload.respuesta.strip(),
            "act": bool(payload.activo)
        }).fetchone()
        new_id = str(row[0])
    else:
        db.execute(text("""
            INSERT INTO cersea_knowledge (id, categoria, pregunta, respuesta, activo, updated_at)
            VALUES (:id, :cat, :preg, :resp, :act, :now)
        """), {
            "id": new_id,
            "cat": payload.categoria.strip(),
            "preg": payload.pregunta.strip(),
            "resp": payload.respuesta.strip(),
            "act": bool(payload.activo),
            "now": now_str
        })
    db.commit()
    return {"status": "created", "id": new_id}


@router.put("/knowledge/{item_id}")
def actualizar_knowledge_item(item_id: str, payload: KnowledgeItemPayload, db: Session = Depends(get_db)):
    from datetime import datetime
    from app.services.cersea_service import _is_pg
    now_str = datetime.now().isoformat()
    if _is_pg(db):
        db.execute(text("""
            UPDATE cersea_knowledge
            SET categoria = :cat, pregunta = :preg, respuesta = :resp, activo = :act, updated_at = NOW()
            WHERE CAST(id AS TEXT) = :iid
        """), {
            "cat": payload.categoria.strip(),
            "preg": payload.pregunta.strip(),
            "resp": payload.respuesta.strip(),
            "act": bool(payload.activo),
            "iid": item_id
        })
    else:
        db.execute(text("""
            UPDATE cersea_knowledge
            SET categoria = :cat, pregunta = :preg, respuesta = :resp, activo = :act, updated_at = :now
            WHERE CAST(id AS TEXT) = :iid
        """), {
            "cat": payload.categoria.strip(),
            "preg": payload.pregunta.strip(),
            "resp": payload.respuesta.strip(),
            "act": bool(payload.activo),
            "now": now_str,
            "iid": item_id
        })
    db.commit()
    return {"status": "updated", "id": item_id}


@router.delete("/knowledge/{item_id}")
def eliminar_knowledge_item(item_id: str, db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM cersea_knowledge WHERE CAST(id AS TEXT) = :iid"), {"iid": item_id})
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
# 6. CONFIGURACIÓN DEL ASISTENTE Y CONVERSACIONES
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
        "custom_instructions": cfg.get("custom_instructions", DEFAULT_CERSEA_PROMPT_CONFIG["custom_instructions"]),
        "model": cfg.get("model", "gpt-4o-mini"),
        "temperature": cfg.get("temperature", 0.2)
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
        "mission": payload.mission or current_cfg.get("mission", ""),
        "vision": payload.vision or current_cfg.get("vision", ""),
        "objective": payload.objective or current_cfg.get("objective", ""),
        "welcome_message": payload.welcome_message,
        "custom_instructions": payload.custom_instructions
    }

    db.execute(text("""
        UPDATE business_configs
        SET tone = :tone,
            system_prompt_config = :cfg
        WHERE id = :tid
    """), {
        "tone": payload.tone,
        "cfg": json.dumps(updated_cfg),
        "tid": TENANT_ID
    })
    db.commit()
    return {"status": "saved", "tenant_id": TENANT_ID}


@router.get("/conversations")
def listar_conversaciones_cersea(limit: int = 80, db: Session = Depends(get_db)):
    init_cersea_tables_and_seed(db)
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
