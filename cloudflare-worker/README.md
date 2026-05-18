# Linear API Worker

Cloudflare Worker en TypeScript que sirve datos de Linear API de forma segura.

## Estructura

```
src/
├── index.ts              # Router principal y endpoints
├── types.ts              # Tipos TypeScript
├── linear/
│   ├── client.ts         # Cliente para Linear API
│   └── queries.ts        # Queries GraphQL
├── services/
│   ├── issues.ts         # Lógica de issues
│   └── projects.ts       # Lógica de proyectos
└── utils.ts              # Funciones auxiliares
```

## Endpoints

### GET /api/issues-ce?month=Enero
Retorna issues de CE1/CE2 sin proyecto para un mes específico.

**Parámetros:**
- `month` (required): Nombre del mes (Enero, Febrero, etc.)

**Respuesta:**
```json
[
  {
    "id": "issue-id",
    "identifier": "CE2-123",
    "title": "Issue title",
    "state": {"name": "In Progress"},
    "priority": 1,
    ...
  }
]
```

### GET /api/projects-ce?month=Enero
Retorna proyectos de CE2 para un mes específico.

**Parámetros:**
- `month` (required): Nombre del mes

**Respuesta:**
```json
[
  {
    "id": "project-id",
    "name": "Project name",
    "state": "Active",
    ...
  }
]
```

### GET /api/metrics?month=Enero
Retorna métricas calculadas para issues y proyectos.

**Parámetros:**
- `month` (required): Nombre del mes

**Respuesta:**
```json
{
  "issues": {
    "month": "Enero",
    "total_issues": 42,
    "active_issues": 15,
    "by_state": {...},
    "by_product": {...}
  },
  "projects": {
    "total_projects": 8,
    "in_progress": 3,
    "completed": 2
  }
}
```

### POST /api/regenerate
Regenera el caché para todos los meses.

**Headers:**
- `Authorization: Bearer <API_KEY>` (requiere autenticación)

## Instalación

1. **Instalar dependencias:**
```bash
npm install
```

2. **Configurar secrets de Cloudflare:**
```bash
wrangler secret put LINEAR_API_KEY
```
Pega tu Linear API key cuando se pida.

## Desarrollo

Ejecutar localmente:
```bash
npm run dev
```

El worker correrá en `http://localhost:8787`

## Deploy

```bash
npm run deploy
```

El worker se desplegará a Cloudflare Workers.

## Configuración

### wrangler.toml
- Edita el nombre, rutas, y configuración de KV según sea necesario
- KV namespace `CACHE` se usa para cachear respuestas (1 hora de TTL)

### Caché
El worker cachea respuestas en Cloudflare KV para mejorar performance:
- Issues/Proyectos: 1 hora
- Métricas: 1 hora
- Regeneración manual: 24 horas

## Seguridad

- **LINEAR_API_KEY**: Almacenada en Cloudflare Environment Variables (secrets)
- **No está en el frontend**: La API key nunca se expone al cliente
- **CORS habilitado**: Configurado para acceso desde el dashboard
- **POST /api/regenerate**: Requiere Bearer token (para GitHub Actions)

## Testing

```bash
# Local
curl "http://localhost:8787/api/metrics?month=Enero"

# Production
curl "https://linear-api-worker.ACCOUNT.workers.dev/api/metrics?month=Enero"
```
