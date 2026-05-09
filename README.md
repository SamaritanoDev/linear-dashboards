# 📊 Linear Dashboard - Continuity Engineering

Dashboard unificado para monitorear **proyectos CE2** e **issues L1/L2** de CE1 y CE2 en Linear, con actualización automática diaria.

## 🎯 Características

### Para Ejecutivos
- **Team Health**: Overview de issues activos, bloqueados, SLA en riesgo
- **Backlog Pendiente**: Issues listos pero sin iniciar
- **Close Rate**: Throughput de issues cerrados en últimos 7 días
- **Severidad & SLA**: L1/L2 distribution y risk alerts

### Para Tech Leads / PMs
- **Roadmap por Producto**: Desglose de 8 líneas de negocio (Cuy, Guinea, Habla+, Wings, PeruSim+, Fimo, Airalo, B2B)
- **In Progress %**: Progreso por producto
- **L1/L2 Load**: Distribución de severidad
- **Blocked Issues**: Impedimentos críticos

### Para Individual Contributors
- **Mi Workload**: Issues asignados en In Progress
- **My High Severity**: Issues L1 asignados a ti
- **Team Blockers**: Impedimentos que afectan al equipo
- **Stale Issues**: Items que necesitan revisión

## 📁 Estructura del Dashboard

### Sección 1: Issues (CE1 + CE2)
- **Pendientes por Revisar**: Issues en estado "In Review", "Planning", "Backlog", "Triage" o "Blocked" (con etiqueta de producto)
- **Sin Label por Etiquetar**: Issues sin etiqueta que necesitan categorización
- **Resumen por Producto**: Total vs Pendientes por línea de negocio
- **Por Estado**: Desglose detallado de issues por estado y team

### Sección 2: Proyectos (CE2)
- **Métrica de Salud**: Total, En Progreso, Pendientes, Completados, Cancelados
- **Por Estado**: Distribución de proyectos por estado
- **Por Lead**: Asignación de liderazgo de proyectos

## 🚀 Actualización Automática

### GitHub Actions Workflow
- **Hora**: 8:00 AM UTC diariamente
- **Trigger Manual**: Disponible via GitHub Actions UI
- **Proceso**:
  1. Ejecuta `generate_unified_dashboard.py`
  2. Genera `index.html` actualizado
  3. Auto-commit si hay cambios
  4. Auto-push a `main`
  5. Vercel deploya automáticamente

### Variables de Entorno Requeridas
```bash
LINEAR_API_KEY=<tu-api-key>
```

Se configura en GitHub Secrets de forma segura.

## 🎨 Paleta de Colores

| Elemento | Color | Hex |
|----------|-------|-----|
| Primario | Rosa Vibrante | `#fa76b1` |
| Secundario | Rosa Claro | `#ffcfec` |
| Éxito | Verde | `#04ffb0` |
| Fondo Oscuro | Negro | `#0f0f0f` |
| Fondo Claro | Gris Claro | `#f5f5f7` |

## 🌙 Modo Claro / Oscuro

- **Toggle**: Botón en el drawer del lado izquierdo
- **Persistencia**: Preferencia guardada en `localStorage`
- **Auto-load**: Se aplica automáticamente al cargar la página

## 📊 Definiciones de Métricas

### Estados de Issues
- **Triage**: Nuevo, requiere clasificación
- **Planning**: Planeado, en backlog
- **Backlog**: Listo pero sin iniciar
- **In Progress**: Trabajo activo
- **In Review**: En revisión
- **Blocked**: Impedido, bloqueado
- **Closed**: Completado
- **Discarded**: Descartado (excluido)

### Estados de Proyectos
- **Planned**: Planeado
- **Started**: En progreso
- **Completed**: Completado
- **Canceled**: Cancelado (no suma en total)
- **Backlog**: En backlog

### Severidad
- **L1 (High)**: Crítico, requiere atención inmediata
- **L2 (Medium)**: Importante, debe incluirse en sprint
- **Sin Label**: Requiere etiquetación

## 📂 Archivos Principales

```
.
├── generate_unified_dashboard.py  # Script principal de generación
├── index.html                     # Dashboard generado
├── .github/workflows/
│   └── update-dashboard.yml       # GitHub Actions workflow
├── README.md                      # Este archivo
└── .claude/launch.json            # Configuración de preview local
```

## 🔧 Desarrollo Local

### Requisitos
- Python 3.11+
- curl (para GraphQL queries)
- LINEAR_API_KEY configurada

### Ejecutar localmente
```bash
# Generar dashboard
python3 generate_unified_dashboard.py

# Previewizar en navegador
python3 -m http.server --directory . --bind 0.0.0.0 8000
# Abre http://localhost:8000
```

### Estructura del Script
1. `get_projects()` - Obtiene proyectos CE2
2. `get_projects_for_month()` - Filtra por mes (timezone-aware)
3. `get_issues_for_month()` - Obtiene issues sin proyecto
4. `calculate_metrics()` - Calcula métricas de issues
5. `calculate_project_metrics()` - Calcula métricas de proyectos
6. `generate_html()` - Genera HTML con CSS y JavaScript

## 📋 Columnas de Tablas

### Pendientes por Revisar
| Campo | Descripción |
|-------|-------------|
| ID Issue | Identificador único |
| Título | Nombre del issue |
| Estado | Estado actual (In Review, Planning, etc) |
| Producto | Línea de negocio |
| Team | CE1 o CE2 |
| Asignado a | Persona responsable |
| Link | Enlace a Linear |

### Sin Label por Etiquetar
| Campo | Descripción |
|-------|-------------|
| ID Issue | Identificador único |
| Título | Nombre del issue |
| Estado | Estado actual |
| Team | CE1 o CE2 |
| Asignado a | Persona responsable |
| Link | Enlace a Linear |

## 🔐 Seguridad

- **API Key**: Almacenada en GitHub Secrets (no versionada)
- **Autenticación**: Ninguna requerida para ver el dashboard (público)
- **Datos**: Solo lee de Linear API, no modifica datos

## 📈 Métricas Tracked

### Issues
- Total, activos, bloqueados, cerrados, pendientes
- Distribución por product, team, state
- Edad de issues (createdAt)
- SLA status

### Proyectos
- Total, en progreso, completados, cancelados, pendientes
- Distribución por state, lead
- Progress distribution (0-25%, 25-50%, etc)

## 🚢 Despliegue

### Vercel
- **Trigger**: Auto en cada push a `main`
- **URL**: https://linear-dashboards.vercel.app (o tu dominio)
- **Ambiente**: Production
- **Secrets**: Solo en GitHub Actions (no visible en Vercel)

### GitHub
- **Repo**: SamaritanoDev/linear-dashboards
- **Branch**: main
- **Workflow**: `.github/workflows/update-dashboard.yml`

## 🔄 Próximas Mejoras

- [ ] Agregar OKRs y ciclos cuando estén listos
- [ ] Sprint Burndown chart
- [ ] Velocity por OKR
- [ ] Predicción de capacidad
- [ ] Alertas por Slack
- [ ] Exportar datos a CSV/PDF
- [ ] Filtros interactivos por team/producto

## 📞 Soporte

Para reportar bugs o sugerir mejoras:
1. Abre un issue en GitHub
2. Describe el problema/sugerencia
3. Tag: `@dashboard` o `@continuity-engineering`

## 📝 Notas

- **Zona Horaria**: UTC (ajusta según necesidad)
- **Actualización**: Diaria 8:00 AM UTC (configurable en workflow)
- **Datos**: Obtiene solo issues SIN proyecto (los con proyecto están en CE2 Projects)
- **Etiquetas**: Usa product labels (Cuy, Guinea, etc) para clasificar

---

**Última actualización**: 2026-05-08  
**Dashboard**: [Continuity Engineering - Linear](https://linear.app/guinea/team/CE1/all)
