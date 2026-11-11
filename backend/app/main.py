"""
Motor Local y Producción para CERSEA WEB & BOT (FastAPI + WebSocket Gateway + MCP Agent)
========================================================================================
Permite correr todo el ecosistema CERSEA localmente (`uvicorn app.main:app --port 8000`)
sin tocar el VPS, habilitando:
1. API REST completa de CERSEA (`/api/cersea/...`)
2. Servidor de Herramientas MCP (`/api/cersea/mcp/tools`, `/api/cersea/mcp/execute`)
3. Omnichannel Gateway WebSocket (`/api/gateway/ws/webchat/CERSEA`) y REST (`/api/gateway/inbound/webchat/CERSEA`)
4. Agente Conversacional con Habilidad de Consulta y Manipulación de Agenda vía MCP:
   - Usa OpenAI Function Calling si `OPENAI_API_KEY` está configurada.
   - Si no hay `OPENAI_API_KEY` en local, incluye un Orquestador Inteligente MCP determinístico
     que interpreta intenciones de consulta de agenda, agendamiento, búsqueda, reprogramación,
     cancelación y dudas frecuentes, ejecutando las herramientas reales de `mcp_server.py`.
"""

import os
import re
import json
import requests
from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.routers.cersea import router as cersea_router, get_db
from app.services.cersea_service import (
    TENANT_ID,
    SATURATION_FALLBACK_MESSAGE,
    DEFAULT_CERSEA_PROMPT_CONFIG,
    init_cersea_tables_and_seed,
    check_and_consume_tenant_credit,
    get_active_openai_key
)
from app.mcp_server import OPENAI_MCP_TOOLS_SCHEMA, execute_mcp_tool

app = FastAPI(
    title="CERSEA WEB & BOT — Clinical & MCP Server API",
    version="2.0.0",
    description="API y Agente con MCP Server para gestión de agendas y orientación familiar en CERSEA, A.C."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cersea_router)


class InboundChatPayload(BaseModel):
    user_id: str = "web_user"
    message: str


def _save_chat_message(db: Session, session_id: str, role: str, content: str):
    try:
        db.execute(text("""
            INSERT INTO chat_histories (session_id, business_id, role, content, timestamp)
            VALUES (:sid, :bid, :role, :content, :ts)
        """), {
            "sid": session_id,
            "bid": TENANT_ID,
            "role": role,
            "content": content,
            "ts": datetime.now().isoformat()
        })
        db.commit()
    except Exception:
        pass


def _format_mcp_tool_reply(tool_name: str, tool_result: Dict[str, Any]) -> str:
    """
    Formatea de manera cálida, breve y limpia la respuesta de una herramienta MCP.
    """
    if tool_result.get("status") == "error":
        return f"Lo siento, no pude completar esa acción en la agenda: {tool_result.get('message')}"

    if tool_name in ("consulta_agenda", "consultar_horarios_cersea"):
        detalle = tool_result.get("detalle_fecha_solicitada")
        if detalle:
            libres = [s["hora"] for s in detalle.get("slots", []) if s.get("disponible")]
            if libres:
                horas_txt = ", ".join(libres)
                return (
                    f"Para el **{detalle.get('nombre_dia')} {detalle.get('fecha')}** tenemos estos horarios disponibles:\n"
                    f"- **Horarios con cupo:** {horas_txt} hrs\n\n"
                    f"Si deseas agendar, compárteme tu **nombre completo**, **teléfono**, **nombre de tu familiar** y la **hora** que prefieres."
                )
            return f"Para la fecha {detalle.get('fecha')} ya no quedan bloques disponibles. ¿Te gustaría consultar otro día?"

        proximos = tool_result.get("proximos_dias_disponibles", [])
        dias_con_cupo = [d for d in proximos if d.get("activo") and d.get("total_bloques_libres", 0) > 0][:5]
        if not dias_con_cupo:
            return "Por el momento no encontré bloques disponibles en los próximos días. Puedes llamarnos al 653 534 6760."

        lineas = [
            f"- **{d['nombre_dia']} {d['fecha']}**: {', '.join(d['horas_disponibles'][:5])} hrs ({d['total_cupos_libres']} lugares libres)"
            for d in dias_con_cupo
        ]
        return (
            "Consulté nuestra agenda en tiempo real. Estos son los próximos días y horarios disponibles:\n"
            + "\n".join(lineas)
            + "\n\n¿Qué día y hora te gustaría reservar? Solo dime tu **nombre**, **teléfono** y el **nombre de tu familiar**."
        )

    if tool_name in ("agendar", "agendar_visita_cersea"):
        return (
            f"¡Tu cita ha quedado confirmada en la agenda de CERSEA!\n"
            f"- **Folio de Reserva:** `{tool_result.get('folio')}`\n"
            f"- **Familiar:** {tool_result.get('nombre_visitante')} ({tool_result.get('telefono')})\n"
            f"- **Interna / Prospecto:** {tool_result.get('nombre_interno_prospecto')}\n"
            f"- **Fecha y Hora:** {tool_result.get('fecha')} a las {tool_result.get('hora')} hrs ({tool_result.get('tipo_visita')})\n\n"
            f"Te esperamos en Callejón Oaxaca y 23 #2301 / Callejón Jalisco. Si necesitas reprogramar usa tu folio `{tool_result.get('folio')}`."
        )

    if tool_name == "buscar_cita":
        citas = tool_result.get("citas", [])
        if not citas:
            return "No encontré ninguna cita registrada con ese dato. Verifica tu folio `CERSEA-XXXX` o número de teléfono."
        lineas = [
            f"- **{c['folio']}** ({c['estado']}): {c['nombre_visitante']} • {c['fecha']} a las {c['hora']} hrs ({c['tipo_visita']})"
            for c in citas[:4]
        ]
        return "Encontré las siguientes citas en la agenda:\n" + "\n".join(lineas)

    if tool_name in ("reprogramar_cita", "cancelar_cita"):
        return tool_result.get("message", "La cita fue actualizada correctamente.")

    return "Operación realizada en la agenda de CERSEA."


def _extract_date_from_text(text_msg: str) -> Optional[str]:
    """
    Extrae una fecha YYYY-MM-DD o interpreta referencias naturales ('hoy', 'mañana', 'sábado', 'domingo', 'lunes'...).
    """
    msg_lower = text_msg.lower()
    iso_match = re.search(r"\b(202\d-\d{2}-\d{2})\b", text_msg)
    if iso_match:
        return iso_match.group(1)

    today = date.today()
    if "pasado mañana" in msg_lower or "pasado manana" in msg_lower:
        return (today + timedelta(days=2)).strftime("%Y-%m-%d")
    if "mañana" in msg_lower or "manana" in msg_lower:
        return (today + timedelta(days=1)).strftime("%Y-%m-%d")
    if "hoy" in msg_lower:
        return today.strftime("%Y-%m-%d")

    dias_map = {
        "lunes": 0,
        "martes": 1,
        "miercoles": 2,
        "miércoles": 2,
        "jueves": 3,
        "viernes": 4,
        "sabado": 5,
        "sábado": 5,
        "domingo": 6,
    }
    for nombre, wd in dias_map.items():
        if nombre in msg_lower:
            diff = (wd - today.weekday()) % 7
            return (today + timedelta(days=diff)).strftime("%Y-%m-%d")

    return None


def _extract_time_from_text(text_msg: str) -> Optional[str]:
    """
    Extrae una hora en formato HH:MM (ej. '11:00', '10 am', 'a las 12').
    """
    hhmm = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", text_msg)
    if hhmm:
        return f"{int(hhmm.group(1)):02d}:{hhmm.group(2)}"

    alas = re.search(r"(?:a las|las|hora)\s*(\d{1,2})\s*(am|pm|hrs|horas)?", text_msg.lower())
    if alas:
        hr = int(alas.group(1))
        ampm = alas.group(2) or ""
        if ampm == "pm" and hr < 12:
            hr += 12
        elif hr < 8:
            hr += 12
        return f"{hr:02d}:00"
    return None


def _run_local_mcp_orchestrator(db: Session, session_id: str, user_message: str) -> Dict[str, Any]:
    """
    Orquestador inteligente local que conecta al agente con el MCP Server (`consulta_agenda`,
    `agendar`, `buscar_cita`, `reprogramar_cita`, `cancelar_cita`, `consultar_informacion_cersea`)
    incluso cuando no hay conexión externa a OpenAI.
    """
    msg_low = user_message.lower().strip()

    # 1. ¿Quiere cancelar una cita con folio?
    folio_match = re.search(r"(cersea-[a-z0-9]{6,10})", msg_low)
    if "cancelar" in msg_low and folio_match:
        folio = folio_match.group(1).upper()
        res = execute_mcp_tool("cancelar_cita", {"folio_o_id": folio})
        return {"reply": _format_mcp_tool_reply("cancelar_cita", res), "tool_called": "cancelar_cita", "data": res}

    # 2. ¿Quiere reprogramar una cita con folio?
    if ("reprogramar" in msg_low or "cambiar" in msg_low) and folio_match:
        folio = folio_match.group(1).upper()
        f_date = _extract_date_from_text(user_message) or date.today().strftime("%Y-%m-%d")
        f_time = _extract_time_from_text(user_message) or "11:00"
        res = execute_mcp_tool("reprogramar_cita", {"folio_o_id": folio, "nueva_fecha_hora": f"{f_date} {f_time}"})
        return {"reply": _format_mcp_tool_reply("reprogramar_cita", res), "tool_called": "reprogramar_cita", "data": res}

    # 3. ¿Quiere buscar una cita por folio?
    if folio_match and ("buscar" in msg_low or "consultar" in msg_low or "estado" in msg_low or "cita" in msg_low):
        folio = folio_match.group(1).upper()
        res = execute_mcp_tool("buscar_cita", {"busqueda": folio})
        return {"reply": _format_mcp_tool_reply("buscar_cita", res), "tool_called": "buscar_cita", "data": res}

    # 4. ¿Proporciona datos para agendar (teléfono de 7-10 dígitos + intención o fecha/hora)?
    phone_match = re.search(r"(\d{3}[\s\-]?\d{3}[\s\-]?\d{4}|\d{10})", user_message)
    if phone_match and any(w in msg_low for w in ["agendar", "cita", "visita", "reservar", "confirmar", "nombre", "llamo", "soy", "a las", ":00"]):
        telefono = phone_match.group(1).strip()
        target_date = _extract_date_from_text(user_message)
        if not target_date:
            # Siguiente sábado por defecto
            today = date.today()
            sat_diff = (5 - today.weekday()) % 7
            target_date = (today + timedelta(days=sat_diff)).strftime("%Y-%m-%d")
        target_time = _extract_time_from_text(user_message) or "11:00"

        # Extraer nombre de forma limpia ("me llamo X", "mi nombre es X", "soy X")
        name_match = re.search(
            r"(?:me llamo|mi nombre es|nombre:|soy)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,45}?)(?=\s+(?:y\s+|mi\s+|tel|cel|al\s+|\d|,|\.)|$)",
            user_message,
            re.IGNORECASE
        )
        if name_match:
            nombre_visitante = " ".join(name_match.group(1).split()).strip().title()
        else:
            cleaned_name = re.sub(r"(\d{3}[\s\-]?\d{3}[\s\-]?\d{4}|\d{10})", "", user_message)
            cleaned_name = re.sub(
                r"\b(?i)(hola|quiero|agendar|reservar|confirmar|cita|visita|familiar|primer|ingreso|mi|nombre|es|me|llamo|soy|telefono|teléfono|tel|para|el|la|los|las|un|una|sabado|sábado|domingo|lunes|martes|miercoles|miércoles|jueves|viernes|hoy|mañana|manana|a|hrs|horas|am|pm|y|con)\b",
                " ",
                cleaned_name
            )
            cleaned_name = re.sub(r"(\d{1,2}:\d{2}|[,.:;-])", " ", cleaned_name)
            cleaned_name = " ".join(cleaned_name.split()).strip()
            nombre_visitante = cleaned_name[:60].title() if len(cleaned_name) >= 3 else "Familiar CERSEA"
        tipo_v = "Primer Ingreso" if "ingreso" in msg_low or "valorac" in msg_low else "Familiar"

        res = execute_mcp_tool("agendar", {
            "nombre_visitante": nombre_visitante,
            "telefono": telefono,
            "fecha_hora": f"{target_date}T{target_time}",
            "tipo_visita": tipo_v,
            "nombre_interno_prospecto": "Por especificar"
        })
        return {"reply": _format_mcp_tool_reply("agendar", res), "tool_called": "agendar", "data": res}

    # 5. ¿Pregunta por horarios disponibles, agenda o quiere agendar una visita?
    if any(w in msg_low for w in ["agenda", "horario", "disponible", "cupo", "cita", "visita", "sabado", "sábado", "domingo", "fin de semana"]):
        f_date = _extract_date_from_text(user_message)
        res = execute_mcp_tool("consulta_agenda", {"fecha": f_date, "dias_adelante": 7})
        return {"reply": _format_mcp_tool_reply("consulta_agenda", res), "tool_called": "consulta_agenda", "data": res}

    # 6. Búsqueda en la base de conocimiento (`cersea_knowledge`)
    know_res = execute_mcp_tool("consultar_informacion_cersea", {"tema": user_message})
    items = know_res.get("resultados", [])
    # Buscar la mejor coincidencia por palabras clave
    for item in items:
        cat_low = item["categoria"].lower()
        if ("ingreso" in msg_low or "llevar" in msg_low or "requisito" in msg_low) and "ingreso" in cat_low:
            return {"reply": item["respuesta"], "tool_called": "consultar_informacion_cersea", "data": item}
        if ("ubicac" in msg_low or "donde" in msg_low or "dónde" in msg_low or "direcc" in msg_low or "telefono" in msg_low or "teléfono" in msg_low) and ("ubicac" in cat_low or "contact" in cat_low):
            return {"reply": item["respuesta"], "tool_called": "consultar_informacion_cersea", "data": item}
        if ("psicolog" in msg_low or "medic" in msg_low or "médic" in msg_low or "servicio" in msg_low or "tratamiento" in msg_low) and "servicio" in cat_low:
            return {"reply": item["respuesta"], "tool_called": "consultar_informacion_cersea", "data": item}
        if ("isea" in msg_low or "cuson" in msg_low or "estudio" in msg_low or "taller" in msg_low or "emprend" in msg_low) and "convenio" in cat_low:
            return {"reply": item["respuesta"], "tool_called": "consultar_informacion_cersea", "data": item}

    return {
        "reply": (
            "En **CERSEA, A.C.** estamos para apoyarte con calidez y profesionalismo.\n"
            "- **Ubicaciones:** Callejón Oaxaca y 23 #2301 y Callejón Jalisco (San Luis Río Colorado).\n"
            "- **Teléfonos:** 653 534 6760 y 653 123 2800.\n\n"
            "¿Deseas que consulte los **horarios disponibles en la agenda** para programar una visita o cita de valoración?"
        ),
        "tool_called": None,
        "data": None
    }


def process_cersea_chat(db: Session, session_id: str, user_message: str) -> Dict[str, Any]:
    """
    Procesa un mensaje entrante del usuario:
    1. Valida y descuenta 1 crédito del tenant `CERSEA`.
    2. Si hay `OPENAI_API_KEY` configurada, usa `gpt-4o-mini` con todas las herramientas del MCP Server.
    3. Si no hay `OPENAI_API_KEY` en entorno local, usa el Orquestador MCP Local conectado a la BD.
    """
    init_cersea_tables_and_seed(db)
    _save_chat_message(db, session_id, "user", user_message)

    allowed, key_override = check_and_consume_tenant_credit(db, TENANT_ID)
    if not allowed:
        _save_chat_message(db, session_id, "assistant", SATURATION_FALLBACK_MESSAGE)
        return {
            "type": "agent_response",
            "reply": SATURATION_FALLBACK_MESSAGE,
            "session_id": session_id,
            "action_required": False,
            "tool_called": None,
            "timestamp": datetime.now().isoformat()
        }

    api_key = key_override or get_active_openai_key(db, TENANT_ID)
    if api_key and api_key.startswith("sk-"):
        try:
            know_rows = db.execute(text("SELECT categoria, pregunta, respuesta FROM cersea_knowledge WHERE activo = 1 OR activo = TRUE")).fetchall()
            rag_context = "\n\n".join([f"[{r[0]}] {r[1]}: {r[2]}" for r in know_rows])
            hoy_str = date.today().strftime("%Y-%m-%d")

            system_prompt = (
                f"Eres el {DEFAULT_CERSEA_PROMPT_CONFIG['role']}.\n"
                f"Fecha actual del sistema: {hoy_str}.\n"
                f"Tono: {DEFAULT_CERSEA_PROMPT_CONFIG['tone']}.\n"
                f"Instrucciones:\n{DEFAULT_CERSEA_PROMPT_CONFIG['custom_instructions']}\n\n"
                f"CONOCIMIENTO OFICIAL DE LA CLÍNICA:\n{rag_context}"
            )

            hist_rows = db.execute(text("""
                SELECT role, content FROM chat_histories
                WHERE session_id = :sid AND business_id = :bid
                ORDER BY id DESC LIMIT 8
            """), {"sid": session_id, "bid": TENANT_ID}).fetchall()

            messages = [{"role": "system", "content": system_prompt}]
            for hr in reversed(hist_rows):
                if hr[0] in ("user", "assistant"):
                    messages.append({"role": hr[0], "content": hr[1]})

            resp = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": messages,
                    "tools": OPENAI_MCP_TOOLS_SCHEMA,
                    "tool_choice": "auto",
                    "temperature": 0.2
                },
                timeout=30
            )
            resp.raise_for_status()
            choice = resp.json()["choices"][0]["message"]

            if choice.get("tool_calls"):
                tc = choice["tool_calls"][0]
                t_name = tc["function"]["name"]
                t_args = json.loads(tc["function"].get("arguments") or "{}")
                t_result = execute_mcp_tool(t_name, t_args)
                reply_text = _format_mcp_tool_reply(t_name, t_result)
                _save_chat_message(db, session_id, "assistant", reply_text)
                return {
                    "type": "agent_response",
                    "reply": reply_text,
                    "session_id": session_id,
                    "action_required": True,
                    "tool_called": t_name,
                    "data": t_result,
                    "timestamp": datetime.now().isoformat()
                }

            reply_text = choice.get("content") or "Estamos aquí para apoyarte en CERSEA."
            _save_chat_message(db, session_id, "assistant", reply_text)
            return {
                "type": "agent_response",
                "reply": reply_text,
                "session_id": session_id,
                "action_required": False,
                "tool_called": None,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            print(f"[Fallback a Orquestador MCP Local]: {e}")

    # Ejecución con el Orquestador MCP Local
    local_out = _run_local_mcp_orchestrator(db, session_id, user_message)
    _save_chat_message(db, session_id, "assistant", local_out["reply"])
    return {
        "type": "agent_response",
        "reply": local_out["reply"],
        "session_id": session_id,
        "action_required": bool(local_out.get("tool_called")),
        "tool_called": local_out.get("tool_called"),
        "data": local_out.get("data"),
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/gateway/inbound/webchat/CERSEA")
def inbound_webchat_cersea(payload: InboundChatPayload, db: Session = Depends(get_db)):
    return process_cersea_chat(db, payload.user_id, payload.message)


@app.websocket("/api/gateway/ws/webchat/CERSEA")
async def websocket_webchat_cersea(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            user_id = data.get("user_id", "ws_local")
            message = data.get("message", "")
            db = SessionLocal()
            try:
                response_payload = process_cersea_chat(db, user_id, message)
            finally:
                db.close()
            await websocket.send_text(json.dumps(response_payload))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
