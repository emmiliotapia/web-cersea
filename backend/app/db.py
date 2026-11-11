"""
Capa de Conexión a Base de Datos para CERSEA WEB & BOT
======================================================
Soporta PostgreSQL en producción (`DATABASE_URL`) y SQLite transaccional
en entorno de desarrollo local (`sqlite:///./cersea_local.db`), garantizando
compatibilidad multi-motor y ejecución inmediata en local.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DEFAULT_SQLITE_URL = "sqlite:///./cersea_local.db"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def is_postgres_engine() -> bool:
    return not DATABASE_URL.startswith("sqlite")

