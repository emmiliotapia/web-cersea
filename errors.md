# Registro de Errores Conocidos y Post-Mortems

## ⚠️ Proyecto: Centro Cersea

### Formato Estándar de Error
```json
{
  "error": {
    "code": "ERR_SMARTOPS_INTERNAL",
    "message": "Mensaje entendible para el humano.",
    "context": {}
  }
}
```

### Matriz de Troubleshooting Rápido
| Código / Síntoma | Causa Frecuente | Solución Inmediata |
| :--- | :--- | :--- |
| `ERR_DB_PGVECTOR` | Extensión `vector` no activada en PostgreSQL | Ejecutar `CREATE EXTENSION IF NOT EXISTS vector;` |
| `ERR_WAHA_DISCONNECTED` | Sesión de WhatsApp deslogueada o reinicio de container | Escanear QR en panel de WAHA o reiniciar sesión |
| `ERR_N8N_TIMEOUT` | Workflow de n8n tardó más de 30s | Revisar sub-nodos y credenciales en n8n |
| `ERR_CONTAINER_EXIT` | OOM o fallo en variable de entorno | Ejecutar `docker compose logs [servicio] --tail=100` |
