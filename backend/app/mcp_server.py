"""
MCP Server Oficial para CERSEA WEB & BOT (Centro Cersea)
========================================================
Servidor bajo el protocolo Model Context Protocol (FastMCP) + Tool Registry para el Agente IA.

Herramientas incluidas:
1. `consulta_agenda`: Consulta horarios disponibles y cupos para una fecha específica o un rango de próximos días.
2. `agendar`: Reserva una cita de valoración (Primer Ingreso) o visita familiar validando disponibilidad real y devolviendo folio `CERSEA-XXXXXXXX`.
3. `buscar_cita`: Busca citas existentes por folio (`CERSEA-XXXX`), teléfono o nombre del familiar/interna.
4. `reprogramar_cita`: Cambia la fecha/hora o actualiza datos de una cita existente verificando cupo en el nuevo bloque.
5. `cancelar_cita`: Cancela una cita existente por folio o teléfono, liberando inmediatamente el cupo en la agenda.
6. `consultar_informacion_cersea`: Consulta la base de conocimiento institucional (`cersea_knowledge`) sobre requisitos de ingreso, ubicaciones, servicios clínicos y convenios.
"""

from datetime import date
from typing import Optional, Dict, Any, List
from sqlalchemy import text

from app.db import SessionLocal
from app.services.cersea_service import (
    init_cersea_tables_and_seed,
    get_available_slots_for_date,
    get_upcoming_availability_summary,
    book_visita_concurrent_safe,
    search_visitas,
    reschedule_or_update_visita
)

try:
    from mcp.server.fastmcp import FastMCP
    mcp_server = FastMCP("cersea-agenda-mcp")
except Exception:
    mcp_server = None


# =====================================================================
# IMPLEMENTACIÓN DE HERRAMIENTAS MCP (EJECUTABLES POR MCP Y AGENTE IA)
# =====================================================================

def tool_consulta_agenda(
    fecha: Optional[str] = None,
    dias_adelante: int = 7
) -> Dict[str, Any]:
    """
    Consulta la agenda clínica de CERSEA:
    - Si se proporciona `fecha` (`YYYY-MM-DD`), devuelve todos los bloques horarios de ese día y cuántos cupos quedan libres.
    - Si no se proporciona `fecha` (o además de ella), devuelve el resumen de disponibilidad de los próximos `dias_adelante` días.
    """
    db = SessionLocal()
    try:
        init_cersea_tables_and_seed(db)
        hoy_str = date.today().strftime("%Y-%m-%d")
        resumen_proximos = get_upcoming_availability_summary(db, start_date_str=fecha or hoy_str, days=dias_adelante)

        detalle_dia = None
        if fecha and fecha.strip():
            try:
                detalle_dia = get_available_slots_for_date(db, fecha.strip()[:10])
            except ValueError as ve:
                return {"status": "error", "message": str(ve)}

        return {
            "status": "success",
            "fecha_actual_referencia": hoy_str,
            "detalle_fecha_solicitada": detalle_dia,
            "proximos_dias_disponibles": resumen_proximos
        }
    except Exception as e:
        return {"status": "error", "message": f"Error al consultar la agenda: {e}"}
    finally:
        db.close()


def tool_agendar(
    nombre_visitante: str,
    telefono: str,
    fecha_hora: str,
    nombre_interno_prospecto: Optional[str] = None,
    tipo_visita: str = "Familiar",
    notas: Optional[str] = None
) -> Dict[str, Any]:
    """
    Agenda una visita familiar o cita de valoración de Primer Ingreso en CERSEA.
    Valida que el horario tenga cupo disponible y genera un folio único `CERSEA-XXXXXXXX`.
    - `fecha_hora` puede ser `YYYY-MM-DDTHH:MM` o `YYYY-MM-DD HH:MM`.
    """
    db = SessionLocal()
    try:
        init_cersea_tables_and_seed(db)
        record = book_visita_concurrent_safe(
            db=db,
            nombre_visitante=nombre_visitante,
            telefono=telefono,
            tipo_visita=tipo_visita,
            fecha_hora_str=fecha_hora,
            nombre_interno_prospecto=nombre_interno_prospecto,
            notas=notas,
            origen="chatbot_mcp"
        )
        return record
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


def tool_buscar_cita(
    busqueda: str
) -> Dict[str, Any]:
    """
    Busca citas registradas en la agenda por Folio (`CERSEA-XXXX`), número de teléfono,
    nombre del familiar visitante o nombre de la interna/prospecto.
    """
    db = SessionLocal()
    try:
        init_cersea_tables_and_seed(db)
        citas = search_visitas(db, query=busqueda, limit=10)
        return {
            "status": "success",
            "total_encontradas": len(citas),
            "citas": citas
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


def tool_reprogramar_cita(
    folio_o_id: str,
    nueva_fecha_hora: str,
    notas: Optional[str] = None
) -> Dict[str, Any]:
    """
    Reprograma una cita existente a una `nueva_fecha_hora` (`YYYY-MM-DD HH:MM`)
    verificando primero que exista cupo disponible en el nuevo horario.
    """
    db = SessionLocal()
    try:
        init_cersea_tables_and_seed(db)
        updated = reschedule_or_update_visita(
            db=db,
            identifier=folio_o_id,
            nueva_fecha_hora=nueva_fecha_hora,
            estado="Confirmada",
            notas=notas
        )
        return {
            "status": "success",
            "message": f"Cita {updated.get('folio')} reprogramada exitosamente para el {updated.get('fecha')} a las {updated.get('hora')} hrs.",
            "cita": updated
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


def tool_cancelar_cita(
    folio_o_id: str,
    motivo: Optional[str] = None
) -> Dict[str, Any]:
    """
    Cancela una cita existente por su Folio (`CERSEA-XXXX`) o ID, liberando el cupo en la agenda.
    """
    db = SessionLocal()
    try:
        init_cersea_tables_and_seed(db)
        updated = reschedule_or_update_visita(
            db=db,
            identifier=folio_o_id,
            estado="Cancelada",
            notas=f"Cancelada: {motivo}" if motivo else None
        )
        return {
            "status": "success",
            "message": f"La cita con folio {updated.get('folio')} ha sido cancelada y su espacio fue liberado.",
            "cita": updated
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


def tool_consultar_informacion_cersea(
    tema: Optional[str] = None
) -> Dict[str, Any]:
    """
    Consulta la base de conocimiento oficial de CERSEA (`cersea_knowledge`) para responder
    sobre requisitos de ingreso, ubicaciones, teléfonos, servicios clínicos y convenios (ISEA/CUSON).
    """
    db = SessionLocal()
    try:
        init_cersea_tables_and_seed(db)
        rows = db.execute(text("""
            SELECT categoria, pregunta, respuesta
            FROM cersea_knowledge
            WHERE activo = 1 OR activo = TRUE
            ORDER BY categoria ASC
        """)).fetchall()
        items = [
            {"categoria": r[0], "pregunta": r[1], "respuesta": r[2]}
            for r in rows
        ]
        if tema and tema.strip():
            q = tema.strip().lower()
            filtrados = [
                it for it in items
                if q in it["categoria"].lower()
                or q in it["pregunta"].lower()
                or q in it["respuesta"].lower()
            ]
            if filtrados:
                items = filtrados
        return {"status": "success", "resultados": items}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


# =====================================================================
# REGISTRO EN EL PROTOCOLO MCP (FastMCP)
# =====================================================================
if mcp_server is not None:
    mcp_server.tool(
        name="consulta_agenda",
        description="Consulta los horarios disponibles y cupos libres en la agenda de CERSEA para una fecha YYYY-MM-DD o para los próximos días."
    )(tool_consulta_agenda)

    mcp_server.tool(
        name="agendar",
        description="Agenda una cita de valoración (Primer Ingreso) o visita familiar en CERSEA validando cupo y generando folio CERSEA-XXXXXXXX."
    )(tool_agendar)

    mcp_server.tool(
        name="buscar_cita",
        description="Busca citas en la agenda de CERSEA por folio (CERSEA-XXXX), teléfono o nombre del familiar/interna."
    )(tool_buscar_cita)

    mcp_server.tool(
        name="reprogramar_cita",
        description="Reprograma una cita existente a una nueva fecha y hora (YYYY-MM-DD HH:MM) verificando disponibilidad."
    )(tool_reprogramar_cita)

    mcp_server.tool(
        name="cancelar_cita",
        description="Cancela una cita existente por folio (CERSEA-XXXX) o ID y libera su horario en la agenda."
    )(tool_cancelar_cita)

    mcp_server.tool(
        name="consultar_informacion_cersea",
        description="Consulta información oficial de CERSEA: requisitos de ingreso, ubicaciones, teléfonos, servicios clínicos y convenios."
    )(tool_consultar_informacion_cersea)


# =====================================================================
# DEFINICIÓN DE TOOLS PARA OPENAI FUNCTION CALLING & AGENTE CHAT
# =====================================================================
OPENAI_MCP_TOOLS_SCHEMA: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "consulta_agenda",
            "description": "Consulta los horarios y cupos disponibles en la agenda de CERSEA para una fecha específica (YYYY-MM-DD) y/o para los próximos días.",
            "parameters": {
                "type": "object",
                "properties": {
                    "fecha": {
                        "type": "string",
                        "description": "Fecha a consultar en formato YYYY-MM-DD. Opcional; si se omite muestra los próximos 7 días."
                    },
                    "dias_adelante": {
                        "type": "integer",
                        "description": "Cantidad de días próximos a consultar (por defecto 7).",
                        "default": 7
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "agendar",
            "description": "Agenda y confirma una visita familiar o cita de valoración de Primer Ingreso en CERSEA devolviendo el folio oficial CERSEA-XXXXXXXX.",
            "parameters": {
                "type": "object",
                "properties": {
                    "nombre_visitante": {
                        "type": "string",
                        "description": "Nombre completo del familiar o solicitante."
                    },
                    "telefono": {
                        "type": "string",
                        "description": "Teléfono de contacto del familiar."
                    },
                    "fecha_hora": {
                        "type": "string",
                        "description": "Fecha y hora elegida en formato YYYY-MM-DDTHH:MM o YYYY-MM-DD HH:MM (ej. 2026-11-14 11:00)."
                    },
                    "nombre_interno_prospecto": {
                        "type": "string",
                        "description": "Nombre de la interna o prospecto a ingresar/visitar."
                    },
                    "tipo_visita": {
                        "type": "string",
                        "enum": ["Familiar", "Primer Ingreso"],
                        "description": "Tipo de cita: 'Familiar' o 'Primer Ingreso'."
                    },
                    "notas": {
                        "type": "string",
                        "description": "Notas adicionales opcionales."
                    }
                },
                "required": ["nombre_visitante", "telefono", "fecha_hora"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "buscar_cita",
            "description": "Busca citas agendadas por folio (CERSEA-XXXX), teléfono o nombre del familiar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "busqueda": {
                        "type": "string",
                        "description": "Folio CERSEA-XXXX, número de teléfono o nombre del visitante."
                    }
                },
                "required": ["busqueda"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "reprogramar_cita",
            "description": "Reprograma una cita existente a una nueva fecha y hora verificando disponibilidad.",
            "parameters": {
                "type": "object",
                "properties": {
                    "folio_o_id": {
                        "type": "string",
                        "description": "Folio de la cita (ej. CERSEA-1A2B3C4D) o ID."
                    },
                    "nueva_fecha_hora": {
                        "type": "string",
                        "description": "Nueva fecha y hora en formato YYYY-MM-DD HH:MM."
                    },
                    "notas": {
                        "type": "string",
                        "description": "Motivo o nota de reprogramación."
                    }
                },
                "required": ["folio_o_id", "nueva_fecha_hora"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cancelar_cita",
            "description": "Cancela una cita existente por folio (CERSEA-XXXX) y libera el horario.",
            "parameters": {
                "type": "object",
                "properties": {
                    "folio_o_id": {
                        "type": "string",
                        "description": "Folio de la cita (ej. CERSEA-1A2B3C4D) o ID."
                    },
                    "motivo": {
                        "type": "string",
                        "description": "Motivo opcional de cancelación."
                    }
                },
                "required": ["folio_o_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_informacion_cersea",
            "description": "Consulta información oficial del centro CERSEA: requisitos de ingreso, ubicaciones, teléfonos y servicios clínicos.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tema": {
                        "type": "string",
                        "description": "Tema o palabra clave a buscar (ej. 'requisitos', 'ubicaciones', 'servicios')."
                    }
                }
            }
        }
    }
]

MCP_TOOLS_DISPATCHER = {
    "consulta_agenda": tool_consulta_agenda,
    "consultar_horarios_cersea": tool_consulta_agenda,
    "agendar": tool_agendar,
    "agendar_visita_cersea": tool_agendar,
    "buscar_cita": tool_buscar_cita,
    "reprogramar_cita": tool_reprogramar_cita,
    "cancelar_cita": tool_cancelar_cita,
    "consultar_informacion_cersea": tool_consultar_informacion_cersea,
}


def execute_mcp_tool(tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ejecuta cualquier herramienta registrada en el MCP Server de CERSEA.
    """
    fn = MCP_TOOLS_DISPATCHER.get(tool_name)
    if not fn:
        return {"status": "error", "message": f"Herramienta MCP '{tool_name}' no encontrada."}
    clean_args = {k: v for k, v in (arguments or {}).items() if k != "business_id"}
    return fn(**clean_args)


if __name__ == "__main__":
    if mcp_server is not None:
        mcp_server.run()

