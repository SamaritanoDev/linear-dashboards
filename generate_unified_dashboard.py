#!/usr/bin/env python3
"""
Linear Dashboard Unificado
- Proyectos de CE2
- Issues sueltos de CE1 y CE2 (sin proyecto)
"""

import json
import subprocess
import os
from datetime import datetime

API_KEY = os.environ.get("LINEAR_API_KEY")
if not API_KEY:
    print("❌ Error: LINEAR_API_KEY no está configurada")
    exit(1)
LINEAR_API = "https://api.linear.app/graphql"

def query_linear(query_str):
    """Ejecuta una query GraphQL en Linear usando curl"""
    try:
        cmd = [
            "curl",
            "-s",
            "-X", "POST",
            LINEAR_API,
            "-H", "Content-Type: application/json",
            "-H", f"Authorization: {API_KEY}",
            "-d", json.dumps({"query": query_str})
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return json.loads(result.stdout)
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def get_projects():
    """Obtiene proyectos de CE2"""
    query = """
    {
      projects(
        first: 150
      ) {
        nodes {
          id
          name
          state
          status {
            name
            type
          }
          progress
          lead {name}
          createdAt
          labels(first: 10) {
            nodes {
              name
            }
          }
          teams(first: 5) {
            nodes {
              key
            }
          }
        }
      }
    }
    """

    print("📊 Obteniendo proyectos de CE2...")
    result = query_linear(query)

    if not result or "errors" in result:
        print("❌ Error en query de proyectos")
        if result and "errors" in result:
            print(f"   Detalle: {result['errors']}")
        return []

    all_projects = result["data"]["projects"]["nodes"]
    # Filtrar solo proyectos de CE2
    ce2_projects = []
    for p in all_projects:
        teams = p.get("teams", {}).get("nodes", [])
        if teams and any(t.get("key") == "CE2" for t in teams):
            ce2_projects.append(p)

    print(f"✅ {len(ce2_projects)} proyectos de CE2 obtenidos (de {len(all_projects)} totales)\n")
    return ce2_projects

def get_projects_for_month(year, month, month_name, all_projects):
    """Filtra proyectos de CE2 para un mes específico"""
    from datetime import datetime as dt, timezone

    # Crear fechas de inicio y fin del mes (timezone-aware)
    start_date = dt(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end_date = dt(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = dt(year, month + 1, 1, tzinfo=timezone.utc)

    projects_in_month = []
    for p in all_projects:
        created_at_str = p.get("createdAt", "")
        if created_at_str:
            try:
                created_at = dt.fromisoformat(created_at_str.replace('Z', '+00:00'))
                if start_date <= created_at < end_date:
                    projects_in_month.append(p)
            except Exception as e:
                pass

    return projects_in_month

def get_issues_for_month(year, month, month_name):
    """Obtiene issues SIN proyecto para un mes específico de CE1 + CE2"""
    from datetime import datetime as dt, timezone

    start_date = dt(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end_date = dt(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = dt(year, month + 1, 1, tzinfo=timezone.utc)

    # Format dates for GraphQL (remove timezone info, use Z suffix)
    start_str = start_date.replace(tzinfo=None).isoformat()
    end_str = end_date.replace(tzinfo=None).isoformat()

    query = f"""
    {{
      issues(
        first: 250
        filter: {{
          team: {{key: {{in: ["CE1", "CE2"]}}}}
          createdAt: {{gte: "{start_str}Z", lt: "{end_str}Z"}}
          project: {{null: true}}
        }}
      ) {{
        nodes {{
          id
          identifier
          title
          state {{name}}
          priority
          createdAt
          startedAt
          completedAt
          assignee {{name}}
          team {{key}}
          project {{id}}
          labels(first: 10) {{
            nodes {{name}}
          }}
        }}
      }}
    }}
    """

    print(f"📊 Obteniendo issues de {month_name} ({year})...")
    result = query_linear(query)

    if not result or "errors" in result:
        print(f"❌ Error en query para {month_name}")
        return []

    issues = result["data"]["issues"]["nodes"]
    # Filtrar solo issues SIN proyecto Y excluir Discarded
    issues_without_project = [i for i in issues if not i.get("project") and i.get("state", {}).get("name") != "Discarded"]
    print(f"✅ {len(issues_without_project)} issues sin proyecto obtenidos para {month_name} (de {len(issues)} totales)\n")
    return issues_without_project

def calculate_metrics(issues, month_name):
    """Calcula métricas para issues"""
    # Labels de Customer obligatorios (productos + categorías)
    customer_labels = ["Cuy", "Guinea", "Habla+", "Wings", "PeruSim+", "Fimo", "Airalo", "B2B", "Finanzas", "Legales", "Partner"]
    pending_states = ["Triage", "Planning", "Backlog", "In Progress", "In Review", "Blocked"]

    metrics = {
        "month": month_name,
        "total_issues": 0,  # Solo issues considerados (con etiqueta o cerrados)
        "untracked_issues": 0,  # Issues sin etiqueta en estado pendiente
        "active_issues": 0,
        "backlog": 0,
        "backlog_untracked": 0,  # Backlog sin etiqueta
        "blocked": 0,
        "closed": 0,
        "by_state": {},
        "by_product": {},
        "by_team": {"CE1": 0, "CE2": 0},
        "pending_by_product": {},
        "by_state_by_team": {},
        "pending_issues_list": [],  # Lista de issues pendientes (con etiqueta)
        "untracked_issues_list": []  # Lista de issues sin etiqueta
    }

    for issue in issues:
        state = issue["state"]["name"]
        team = issue.get("team", {}).get("key", "Unknown")
        labels = [l["name"] for l in issue["labels"]["nodes"]]
        product_labels = [l for l in labels if l in customer_labels]

        # Contar todos los estados para referencia
        metrics["by_state"][state] = metrics["by_state"].get(state, 0) + 1

        # Issues sin etiqueta en estado pendiente (EXCLUIDOS del total)
        if not product_labels and state in pending_states:
            metrics["untracked_issues"] += 1
            metrics["backlog_untracked"] += 1
            # Guardar en lista para mostrar en tabla
            assignee_name = issue.get("assignee", {}).get("name", "Sin asignar") if issue.get("assignee") else "Sin asignar"
            metrics["untracked_issues_list"].append({
                "id": issue["identifier"],
                "title": issue["title"],
                "state": state,
                "team": team,
                "assignee": assignee_name
            })
            continue  # No contarlos en el total

        # Contar en total solo si tienen etiqueta o están cerrados
        metrics["total_issues"] += 1

        if team in metrics["by_team"]:
            metrics["by_team"][team] += 1

        key = f"{team}_{state}"
        metrics["by_state_by_team"][key] = metrics["by_state_by_team"].get(key, 0) + 1

        if state == "In Progress":
            metrics["active_issues"] += 1

        if state in ["Backlog", "Planning"]:
            metrics["backlog"] += 1

        if state == "Blocked":
            metrics["blocked"] += 1

        if state == "Closed":
            metrics["closed"] += 1

        if product_labels:
            for product in product_labels:
                metrics["by_product"][product] = metrics["by_product"].get(product, 0) + 1
                # Pendientes = todo excepto Closed (Discarded ya están filtrados)
                if state != "Closed":
                    metrics["pending_by_product"][product] = metrics["pending_by_product"].get(product, 0) + 1

            # Guardar en lista de pendientes si está en estado pendiente
            if state != "Closed":
                assignee_name = issue.get("assignee", {}).get("name", "Sin asignar") if issue.get("assignee") else "Sin asignar"
                metrics["pending_issues_list"].append({
                    "id": issue["identifier"],
                    "title": issue["title"],
                    "state": state,
                    "team": team,
                    "products": ", ".join(product_labels),
                    "assignee": assignee_name
                })

    return metrics

def generate_issues_section_html(all_months_metrics):
    """Genera la sección HTML completa para Issues Sin Proyecto CE"""
    if not all_months_metrics:
        return '<section id="issues" style="display: none;"><p>No hay datos de issues</p></section>'

    mayo_metrics = next((m for m in all_months_metrics if m["month"] == "Mayo"), all_months_metrics[0] if all_months_metrics else {})

    if not mayo_metrics:
        return '<section id="issues" style="display: none;"><p>No hay datos para mayo</p></section>'

    month_tabs = ""
    for m in all_months_metrics:
        is_active = m["month"] == "Mayo"
        class_active = "text-primary border-b-2 border-primary font-semibold" if is_active else "text-on-surface-variant font-medium hover:text-on-surface"
        month_tabs += f'    <button class="px-5 py-2.5 rounded-full text-sm {class_active} transition-all whitespace-nowrap" data-month="{m["month"]}">{m["month"]} 2026</button>\n'

    total_issues = mayo_metrics.get("total_issues", 0)
    pending_issues = sum(mayo_metrics.get("pending_by_product", {}).values())
    closed_issues = mayo_metrics.get("closed", 0)
    progress_percent = int((closed_issues / total_issues * 100)) if total_issues > 0 else 0

    product_cards = ""
    for product, count in sorted(mayo_metrics.get("by_product", {}).items()):
        pending = mayo_metrics.get("pending_by_product", {}).get(product, 0)
        product_cards += f'''    <div class="glacier-card p-5 rounded-xl flex flex-col gap-3">
        <h3 class="text-sm font-bold text-on-surface">{product}</h3>
        <div class="flex justify-between items-center">
            <div class="flex flex-col">
                <span class="text-[10px] uppercase font-bold text-on-surface-variant tracking-tighter">Total</span>
                <span class="text-xl font-bold text-on-surface">{count}</span>
            </div>
            <div class="flex flex-col text-right">
                <span class="text-[10px] uppercase font-bold text-secondary tracking-tighter">Pendientes</span>
                <span class="text-xl font-bold text-secondary">{pending}</span>
            </div>
        </div>
    </div>
'''

    status_rows = ""
    states_by_team = mayo_metrics.get("by_state_by_team", {})

    states_dict = {}
    for key, count in states_by_team.items():
        if "_" in key:
            team, state = key.split("_", 1)
            if state not in states_dict:
                states_dict[state] = {"CE1": 0, "CE2": 0}
            states_dict[state][team] = count

    for state in sorted(states_dict.keys()):
        ce1_count = states_dict[state].get("CE1", 0)
        ce2_count = states_dict[state].get("CE2", 0)
        total = ce1_count + ce2_count
        status_rows += f'''        <tr class="hover:bg-surface-container-highest/50 transition-colors">
            <td class="px-6 py-4 text-sm text-on-surface">{state}</td>
            <td class="px-6 py-4 text-sm text-on-surface-variant text-right">{ce1_count}</td>
            <td class="px-6 py-4 text-sm text-on-surface-variant text-right font-medium">{ce2_count}</td>
            <td class="px-6 py-4 text-sm text-on-surface text-right font-bold">{total}</td>
        </tr>
'''

    pending_rows = ""
    for issue in mayo_metrics.get("pending_issues_list", []):
        state = issue.get("state", "Unknown")
        team = issue.get("team", "N/A")
        identifier = issue.get("id", "")
        title = (issue.get("title", "")[:50] + "...") if len(issue.get("title", "")) > 50 else issue.get("title", "")
        product = issue.get("products", "N/A")

        state_badge_color = "bg-primary/10 text-primary" if state == "In Progress" else "bg-tertiary-container/20 text-tertiary" if state == "In Review" else "bg-surface-container text-on-surface-variant"

        pending_rows += f'''        <tr class="hover:bg-surface-container-highest/50 transition-colors group">
            <td class="px-6 py-4 text-sm font-bold text-on-surface">{identifier}</td>
            <td class="px-6 py-4 text-sm text-on-surface group-hover:text-white">{title}</td>
            <td class="px-6 py-4 text-sm">
                <span class="px-2 py-1 rounded-md {state_badge_color} text-xs font-medium">{state}</span>
            </td>
            <td class="px-6 py-4 text-sm text-on-surface-variant">{product}</td>
            <td class="px-6 py-4 text-sm text-on-surface-variant">{team}</td>
            <td class="px-6 py-4 text-right">
                <a class="text-primary hover:underline text-sm font-medium flex items-center justify-end gap-1" href="https://linear.app/guinea/issue/{identifier}" target="_blank">
                    Abrir <span class="material-symbols-outlined text-xs">arrow_forward</span>
                </a>
            </td>
        </tr>
'''

    return f'''<div class="max-w-6xl mx-auto">
        <div class="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
                <h1 class="text-4xl font-bold text-on-surface tracking-tight flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary text-4xl">bug_report</span>
                    Issues Sin Proyecto CE
                </h1>
                <p class="text-on-surface-variant mt-2">Seguimiento de incidencias operativas no vinculadas a proyectos</p>
            </div>
        </div>

        <div class="border-l-4 border-primary p-4 rounded-r-xl mb-6 flex items-start gap-4">
            <span class="material-symbols-outlined text-primary mt-0.5">info</span>
            <p class="text-sm text-on-surface leading-relaxed"><strong class="text-primary">Nota:</strong> Solo se muestran issues que NO pertenecen a ningún proyecto.</p>
        </div>

        <div class="flex items-center gap-2 mb-8 overflow-x-auto pb-2" data-purpose="month-navigation">
{month_tabs}        </div>

        <div class="tab-content" id="tab-issues" data-month="Mayo">
            <div class="flex items-center gap-2 mb-6">
                <span class="h-2 w-2 rounded-full bg-primary"></span>
                <span class="text-sm font-medium text-on-surface-variant uppercase tracking-widest">Mayo 2026: {total_issues} issues totales | Pendientes: {pending_issues}</span>
            </div>

            <div class="glacier-card p-6 rounded-xl mb-10">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="text-sm font-bold text-on-surface">Progreso General</h4>
                    <span class="text-lg font-bold text-primary">{progress_percent}%</span>
                </div>
                <div class="w-full bg-surface-container rounded-full overflow-hidden h-6">
                    <div class="h-full rounded-full transition-all duration-1000" style="width: {progress_percent}%; background: linear-gradient(90deg, rgb(125, 211, 252) 0%, rgb(186, 230, 253) 100%);"></div>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10 lg:grid-cols-6">
                <div class="bg-surface-container-low p-4 rounded-lg flex flex-col items-center justify-center text-center border border-outline-variant/20 shadow-sm">
                    <span class="text-on-surface-variant text-[10px] font-bold uppercase mb-2 tracking-widest">Total Issues</span>
                    <span class="text-3xl font-bold text-on-surface">{total_issues}</span>
                </div>
                <div class="bg-surface-container-low p-4 rounded-lg flex flex-col items-center justify-center text-center border border-outline-variant/20 shadow-sm">
                    <span class="text-on-surface-variant text-[10px] font-bold uppercase mb-2 tracking-widest">En Progreso</span>
                    <span class="text-3xl font-bold text-primary">{mayo_metrics.get("by_state", {}).get("In Progress", 0)}</span>
                </div>
                <div class="bg-surface-container-low p-4 rounded-lg flex flex-col items-center justify-center text-center border border-outline-variant/20 shadow-sm">
                    <span class="text-on-surface-variant text-[10px] font-bold uppercase mb-2 tracking-widest">Pendientes</span>
                    <span class="text-3xl font-bold text-on-surface">{pending_issues}</span>
                </div>
                <div class="bg-surface-container-low p-4 rounded-lg flex flex-col items-center justify-center text-center border border-outline-variant/20 shadow-sm">
                    <span class="text-on-surface-variant text-[10px] font-bold uppercase mb-2 tracking-widest">Bloqueados</span>
                    <span class="text-3xl font-bold text-error">{mayo_metrics.get("blocked", 0)}</span>
                </div>
                <div class="bg-surface-container-low p-4 rounded-lg flex flex-col items-center justify-center text-center border border-outline-variant/20 shadow-sm">
                    <span class="text-on-surface-variant text-[10px] font-bold uppercase mb-2 tracking-widest">Sin Label</span>
                    <span class="text-3xl font-bold text-on-surface-variant">{mayo_metrics.get("untracked_issues", 0)}</span>
                </div>
                <div class="bg-tertiary-container/30 p-4 rounded-lg flex flex-col items-center justify-center text-center border border-tertiary/20 shadow-sm">
                    <span class="text-tertiary text-[10px] font-bold uppercase mb-2 tracking-widest">Cerrados</span>
                    <span class="text-3xl font-bold text-tertiary">{closed_issues}</span>
                </div>
            </div>

            <div class="glacier-surface p-8 rounded-2xl mb-10">
                <div class="flex items-center justify-between mb-8">
                    <h2 class="text-xl font-bold text-on-surface flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary">bar_chart</span>
                        Por Estado (Team)
                    </h2>
                </div>
                <div class="overflow-hidden rounded-xl border border-outline-variant/50">
                    <table class="w-full text-left">
                        <thead>
                            <tr class="bg-surface-container-high">
                                <th class="px-6 py-4 text-xs font-bold text-primary uppercase tracking-widest">Estado</th>
                                <th class="px-6 py-4 text-xs font-bold text-primary uppercase tracking-widest text-right">CE1</th>
                                <th class="px-6 py-4 text-xs font-bold text-primary uppercase tracking-widest text-right">CE2</th>
                                <th class="px-6 py-4 text-xs font-bold text-primary uppercase tracking-widest text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-outline-variant/30">
{status_rows}                        </tbody>
                    </table>
                </div>
            </div>

            <div class="glacier-surface p-8 rounded-2xl">
                <div class="flex items-center justify-between mb-8">
                    <h2 class="text-xl font-bold text-on-surface flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary">hourglass_empty</span>
                        Pendientes por Revisar ({pending_issues})
                    </h2>
                </div>
                <div class="overflow-x-auto rounded-xl border border-outline-variant/50">
                    <table class="w-full text-left">
                        <thead>
                            <tr class="bg-surface-container-high">
                                <th class="px-6 py-4 text-xs font-bold text-primary uppercase tracking-widest">ID Issue</th>
                                <th class="px-6 py-4 text-xs font-bold text-primary uppercase tracking-widest">Título</th>
                                <th class="px-6 py-4 text-xs font-bold text-primary uppercase tracking-widest">Estado</th>
                                <th class="px-6 py-4 text-xs font-bold text-primary uppercase tracking-widest">Producto</th>
                                <th class="px-6 py-4 text-xs font-bold text-primary uppercase tracking-widest">Team</th>
                                <th class="px-6 py-4 text-xs font-bold text-primary uppercase tracking-widest text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-outline-variant/30">
{pending_rows}                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>'''

def calculate_project_metrics(projects):
    """Calcula métricas para proyectos"""
    from datetime import datetime as dt

    # Contar proyectos válidos (excluyendo canceled y discarded)
    def is_valid_project(p):
        state = p.get("state", "")
        state_lower = str(state).lower() if state else ""
        return state_lower not in ["canceled", "discarded"]

    valid_projects = [p for p in projects if is_valid_project(p)]

    metrics = {
        "total_projects": len(valid_projects),  # Sin cancelados/descartados
        "pending_ce2": 0,  # CE2 projects NOT Closed/Discarded/canceled
        "in_progress": 0,
        "completed": 0,  # Completed projects
        "canceled": 0,  # Canceled projects (referencia, no en total)
        "closed_2026": 0,  # Closed projects from CE1+CE2 in 2026
        "blocked": 0,  # Blocked projects
        "by_state": {},
        "by_lead": {},
        "progress_distribution": {
            "0-25%": 0,
            "25-50%": 0,
            "50-75%": 0,
            "75-100%": 0
        },
        "projects_list": []
    }

    current_year = dt.now().year

    for project in projects:
        state = project.get("state", "Unknown")
        state_lower = str(state).lower() if state else ""

        # Obtener el status.name si está disponible (tiene más información que state)
        status_obj = project.get("status", {})
        status_name = status_obj.get("name", state) if isinstance(status_obj, dict) else state
        status_name_lower = str(status_name).lower() if status_name else ""

        lead = project.get("lead", {}).get("name", "Unassigned") if project.get("lead") else "Unassigned"
        progress = project.get("progress", 0)
        name = project.get("name", "Unknown")
        created_at = project.get("createdAt", "")
        teams = project.get("teams", {}).get("nodes", [])

        # Usar status_name si está disponible, sino usar state
        state_to_display = status_name if status_name != state else state

        # Contar In Progress (Linear usa "started" para In Progress, o status "In Progress")
        if status_name_lower in ["in progress"] or state_lower in ["in progress", "started"]:
            if status_name_lower != "blocked":  # No contar si está bloqueado
                metrics["in_progress"] += 1

        # Contar completados
        if state_lower in ["closed", "completed"]:
            metrics["completed"] += 1

        # Contar cancelados
        if state_lower in ["canceled", "discarded"]:
            metrics["canceled"] += 1

        # Contar bloqueados (ahora con status.name)
        if status_name_lower == "blocked":
            metrics["blocked"] += 1

        # Contar pendientes de CE2 (proyectos en Backlog o Planned, sin incluir In Progress)
        is_ce2 = any(t.get("key") == "CE2" for t in teams)
        if is_ce2 and state_lower in ["backlog", "planned"]:
            metrics["pending_ce2"] += 1

        # Contar cerrados de 2026
        if state_lower == "closed" and created_at:
            try:
                created_year = int(created_at.split("-")[0])
                if created_year == current_year:
                    metrics["closed_2026"] += 1
            except:
                pass

        metrics["by_state"][state_to_display] = metrics["by_state"].get(state_to_display, 0) + 1
        metrics["by_lead"][lead] = metrics["by_lead"].get(lead, 0) + 1

        if progress <= 25:
            metrics["progress_distribution"]["0-25%"] += 1
        elif progress <= 50:
            metrics["progress_distribution"]["25-50%"] += 1
        elif progress <= 75:
            metrics["progress_distribution"]["50-75%"] += 1
        else:
            metrics["progress_distribution"]["75-100%"] += 1

        # Solo agregar proyectos válidos a la lista (mismo filtro que total_projects)
        if is_valid_project(project):
            labels = project.get("labels", {}).get("nodes", []) if isinstance(project.get("labels"), dict) else []
            metrics["projects_list"].append({
                "name": name,
                "state": state_to_display,
                "lead": lead,
                "progress": progress,
                "labels": labels
            })

    return metrics


def generate_html(all_months_projects_metrics, all_months_metrics):
    """Genera HTML con Tailwind CSS - Proyectos CE coincide con oscuro.html/claro.html"""
    import json

    # Leer archivo existente para extraer sección de Issues CE
    original = ""
    try:
        with open("index.html", "r") as f:
            original = f.read()
    except FileNotFoundError:
        pass

    # Extraer datos de marcas de los nombres de proyectos
    brands = ["Cuy", "PeruSim", "Habla+", "Wings", "Fimo", "Guinea", "B2B", "Partner", "Legales", "Finanzas", "Airalo", "Sin clasificar"]

    # Generar datos de todos los meses para JavaScript
    months_data = {}
    for month_data in all_months_projects_metrics:
        month_name = month_data.get("month", "")
        projects_list = month_data.get("projects_list", [])

        # Contar proyectos por marca basándose en los nombres y labels
        brands_count = {brand: {"total": 0, "pending": 0, "completed": 0} for brand in brands}
        for project in projects_list:
            project_name = project.get("name", "")
            state = project.get("state", "").lower()
            is_pending = state not in ["closed", "completed", "canceled", "discarded"]
            # labels puede ser una lista directa o un diccionario con "nodes"
            labels_data = project.get("labels", [])
            if isinstance(labels_data, dict):
                labels = labels_data.get("nodes", [])
            else:
                labels = labels_data if isinstance(labels_data, list) else []
            label_names = [l.get("name", "").lower() if isinstance(l, dict) else str(l).lower() for l in labels] if labels else []

            # Buscar coincidencias de marca en el nombre o labels
            found_brand = False
            for brand in brands[:-1]:  # Excluir "Sin clasificar" del loop
                brand_lower = brand.lower()
                # Buscar en nombre
                if brand_lower in project_name.lower():
                    brands_count[brand]["total"] += 1
                    if is_pending:
                        brands_count[brand]["pending"] += 1
                    else:
                        brands_count[brand]["completed"] += 1
                    found_brand = True
                    break  # Solo contar en la primera marca encontrada
                # Buscar en labels
                for label in label_names:
                    if brand_lower in label:
                        brands_count[brand]["total"] += 1
                        if is_pending:
                            brands_count[brand]["pending"] += 1
                        else:
                            brands_count[brand]["completed"] += 1
                        found_brand = True
                        break
                if found_brand:
                    break

            # Si no encontró marca, contar en "Sin clasificar"
            if not found_brand:
                brands_count["Sin clasificar"]["total"] += 1
                if is_pending:
                    brands_count["Sin clasificar"]["pending"] += 1
                else:
                    brands_count["Sin clasificar"]["completed"] += 1

        months_data[month_name] = {
            "total_projects": month_data.get("total_projects", 0),
            "in_progress": month_data.get("in_progress", 0),
            "pending_ce2": month_data.get("pending_ce2", 0),
            "blocked": month_data.get("blocked", 0),
            "completed": month_data.get("completed", 0),
            "by_state": month_data.get("by_state", {}),
            "brands": brands_count
        }

    # Obtener datos del mes actual (último en la lista)
    current_month_projects = all_months_projects_metrics[-1] if all_months_projects_metrics else {
        "total_projects": 0, "in_progress": 0, "pending_ce2": 0, "by_state": {}, "month": "Mayo"
    }
    current_month = current_month_projects.get("month", "Mayo")
    current_data = months_data.get(current_month, {})

    # Contar totales por estado en todos los meses
    projects_by_state = {}
    for month_data in all_months_projects_metrics:
        for state, count in month_data.get("by_state", {}).items():
            if state not in projects_by_state:
                projects_by_state[state] = 0
            projects_by_state[state] += count

    # Generar filas de tabla con IDs dinámicos
    status_rows = ""
    states_order = ["Backlog", "Planned", "In Progress", "Blocked", "In Review", "Canceled", "Archived"]

    # Crear un mapeo case-insensitive de los estados encontrados en el mes actual
    current_states_map = {}
    for state, count in current_month_projects.get("by_state", {}).items():
        current_states_map[state.lower()] = count

    for state in states_order:
        state_lower = state.lower()
        count = current_states_map.get(state_lower, 0)
        state_id = state_lower.replace(" ", "-")
        status_rows += '        <tr class="hover:bg-surface-container-highest/50 transition-colors group">\n'
        status_rows += '            <td class="px-6 py-4 flex items-center gap-3">\n'
        status_rows += '                <span class="h-2 w-2 rounded-full bg-secondary"></span>\n'
        status_rows += '                <span class="text-on-surface group-hover:text-white transition-colors capitalize">' + state + '</span>\n'
        status_rows += '            </td>\n'
        status_rows += '            <td class="px-6 py-4 text-right font-semibold text-on-surface" id="status-' + state_id + '">' + str(count) + '</td>\n'
        status_rows += '        </tr>\n'

    # Generar botones de meses
    month_buttons = ""
    months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo"]
    for i, month in enumerate(months):
        is_active = (i == len(months) - 1)
        classes = 'text-primary bg-primary/10 border border-primary/30 shadow-lg shadow-primary/5 font-semibold' if is_active else 'text-on-surface-variant hover:text-white hover:bg-surface-container transition-all font-medium'
        month_buttons += '    <button class="px-5 py-2.5 rounded-full text-sm ' + classes + ' whitespace-nowrap" data-month="' + month + '">' + month + ' 2026</button>\n'

    # Generar tarjetas de marcas con datos actuales
    current_brands = current_data.get("brands", {brand: {"total": 0, "pending": 0, "completed": 0} for brand in brands})
    brands_cards = ""
    for brand in brands:
        brand_data = current_brands.get(brand, {"total": 0, "pending": 0, "completed": 0})
        total = brand_data.get("total", 0)
        pending = brand_data.get("pending", 0)
        completed = brand_data.get("completed", 0)
        # Calcular porcentaje de completados
        completed_percentage = int((completed / total) * 100) if total > 0 else 0
        # Generar tarjeta para TODAS las marcas (JavaScript controlará visibilidad)
        display_style = 'block' if (total > 0 or pending > 0) else 'none'
        brands_cards += '    <div class="glacier-card p-6 rounded-xl brand-card" data-brand="' + brand + '" style="display: ' + display_style + ';">\n'
        brands_cards += '        <div class="flex flex-col items-center">\n'
        brands_cards += '            <div class="text-primary font-bold text-sm border-b border-outline-variant/20 pb-3 w-full text-center">' + brand + '</div>\n'
        brands_cards += '            <div class="text-3xl text-tertiary font-bold mt-3 brand-percentage text-center w-full">' + str(completed_percentage) + '%</div>\n'
        brands_cards += '            <div class="text-sm text-tertiary font-semibold text-center w-full brand-completed-label">completado</div>\n'
        brands_cards += '        </div>\n'
        brands_cards += '        <div class="grid grid-cols-2 gap-2 mt-4">\n'
        brands_cards += '            <div class="flex flex-col"><span class="text-[10px] text-on-surface-variant uppercase font-bold">Total</span><span class="text-lg font-bold text-white brand-total">' + str(total) + '</span></div>\n'
        brands_cards += '            <div class="flex flex-col"><span class="text-[10px] text-on-surface-variant uppercase font-bold">Pend.</span><span class="text-lg font-bold text-secondary brand-pending">' + str(pending) + '</span></div>\n'
        brands_cards += '        </div>\n'
        brands_cards += '    </div>\n'

    # Generar tarjetas de métricas con datos actuales
    total = current_month_projects.get("total_projects", 0)
    in_progress = current_month_projects.get("in_progress", 0)
    pending = current_month_projects.get("pending_ce2", 0)
    blocked = current_month_projects.get("blocked", 0)
    completed = current_month_projects.get("completed", 0)
    metrics_cards = '        <div class="glacier-card p-6 rounded-xl flex items-center justify-between">\n'
    metrics_cards += '            <span class="text-on-surface-variant text-xs font-bold uppercase tracking-tighter">Total</span>\n'
    metrics_cards += '            <span class="text-4xl font-bold text-white" id="metric-total">' + str(total) + '</span>\n'
    metrics_cards += '        </div>\n'
    metrics_cards += '        <div class="glacier-card p-6 rounded-xl flex items-center justify-between">\n'
    metrics_cards += '            <span class="text-on-surface-variant text-xs font-bold uppercase tracking-tighter">En Progreso</span>\n'
    metrics_cards += '            <span class="text-4xl font-bold text-primary" id="metric-progress">' + str(in_progress) + '</span>\n'
    metrics_cards += '        </div>\n'
    metrics_cards += '        <div class="glacier-card p-6 rounded-xl flex items-center justify-between">\n'
    metrics_cards += '            <span class="text-on-surface-variant text-xs font-bold uppercase tracking-tighter">Pendientes</span>\n'
    metrics_cards += '            <span class="text-4xl font-bold text-secondary" id="metric-pending">' + str(pending) + '</span>\n'
    metrics_cards += '        </div>\n'
    metrics_cards += '        <div class="glacier-card p-6 rounded-xl flex items-center justify-between">\n'
    metrics_cards += '            <span class="text-on-surface-variant text-xs font-bold uppercase tracking-tighter">Bloqueados</span>\n'
    metrics_cards += '            <span class="text-4xl font-bold text-error/60" id="metric-blocked">' + str(blocked) + '</span>\n'
    metrics_cards += '        </div>\n'
    metrics_cards += '        <div class="glacier-card p-6 rounded-xl border-tertiary border-2 flex items-center justify-between">\n'
    metrics_cards += '            <span class="text-tertiary text-xs font-bold uppercase tracking-tighter">Completados</span>\n'
    metrics_cards += '            <span class="text-4xl font-bold text-tertiary" id="metric-completed">' + str(completed) + '</span>\n'
    metrics_cards += '        </div>\n'

    # Generar sección de Issues CE
    issues_section = generate_issues_section_html(all_months_metrics)

    # Convertir datos a JSON para usar en JavaScript
    months_data_json = json.dumps(months_data)

    month_text = current_month_projects.get("month", "Mayo")

    html = """    <!DOCTYPE html>
    <html class="dark" lang="es">
    <head>
        <meta charset="utf-8"/>
        <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
        <title>Proyectos CE - Continuity Engineering Dashboard</title>
        <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
        <script id="tailwind-config">
            tailwind.config = {
                darkMode: "class",
                theme: {
                    extend: {
                        "colors": {
                            "surface-dim": "#0f1524",
                            "surface-bright": "#1a2438",
                            "surface": "#0f1524",
                            "on-tertiary-fixed-variant": "#4d2a73",
                            "on-tertiary-container": "#e8d0ff",
                            "inverse-on-surface": "#0a0e1a",
                            "outline-variant": "#2a3a48",
                            "primary-fixed-dim": "#7dd3fc",
                            "on-secondary-fixed": "#0d1f2b",
                            "surface-container": "#141c2e",
                            "inverse-surface": "#e0e8f0",
                            "tertiary-fixed": "#e8d0ff",
                            "on-secondary-container": "#c0d8e8",
                            "on-primary-fixed": "#001f2e",
                            "primary-fixed": "#c8eaff",
                            "on-tertiary": "#1a002e",
                            "error": "#ff6b6b",
                            "on-surface-variant": "#a0b4c4",
                            "secondary-fixed": "#c0d8e8",
                            "surface-container-lowest": "#0a0e1a",
                            "tertiary-container": "#3d2060",
                            "surface-tint": "#7dd3fc",
                            "surface-container-high": "#1a2438",
                            "surface-variant": "#1a2438",
                            "on-surface": "#e0e8f0",
                            "background": "#0a0e1a",
                            "on-error": "#1a0000",
                            "outline": "#4a6070",
                            "on-error-container": "#ffb3b3",
                            "on-primary-container": "#c8eaff",
                            "tertiary-fixed-dim": "#c8a0f0",
                            "tertiary": "#c8a0f0",
                            "secondary-fixed-dim": "#88b4cc",
                            "on-secondary": "#001f2e",
                            "primary-container": "#0e4d6e",
                            "error-container": "#3d1414",
                            "inverse-primary": "#0a4c6e",
                            "on-secondary-fixed-variant": "#2a4a5e",
                            "secondary": "#88b4cc",
                            "primary": "#7dd3fc",
                            "surface-container-highest": "#202c42",
                            "on-primary": "#001f2e",
                            "secondary-container": "#1a3a4e",
                            "on-background": "#e0e8f0",
                            "on-tertiary-fixed": "#1a002e",
                            "surface-container-low": "#111828",
                            "on-primary-fixed-variant": "#004d73"
                        },
                        "borderRadius": {
                            "DEFAULT": "0.5rem",
                            "lg": "1rem",
                            "xl": "1.5rem",
                            "full": "9999px"
                        },
                        "fontFamily": {
                            "headline": ["Inter", "sans-serif"],
                            "display": ["Inter", "sans-serif"],
                            "body": ["Inter", "sans-serif"],
                            "label": ["Inter", "sans-serif"]
                        }
                    },
                },
            }
        </script>
        <style data-purpose="layout-and-theme">
            body {
                font-family: 'Inter', sans-serif;
                background-color: #0a0e1a;
                color: #e0e8f0;
            }
            .glacier-surface {
                background-color: #0f1524;
                border: 1px solid rgba(74, 96, 112, 0.3);
            }
            .glacier-card {
                background-color: #141c2e;
                border: 1px solid rgba(125, 211, 252, 0.1);
                transition: all 0.3s ease;
            }
            .glacier-card:hover {
                border-color: #7dd3fc;
                background-color: #1a2438;
            }
            .drawer-item {
                transition: all 0.2s;
            }
            .drawer-item.active {
                background-color: rgba(125, 211, 252, 0.1);
                color: #7dd3fc;
                border-right: 3px solid #7dd3fc;
            }
        </style>
    </head>
    <body class="min-h-screen bg-background text-on-surface">
        <div class="flex min-h-screen">
            <aside class="w-64 glacier-surface border-r border-outline-variant fixed h-full z-10 flex flex-col" data-purpose="navigation-sidebar">
                <div class="p-6">
                    <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-8 flex items-center gap-2">
                        <span class="material-symbols-outlined text-xl">grid_view</span>
                        Dashboard
                    </h2>
                    <nav class="space-y-2">
                        <div class="drawer-item flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer hover:bg-surface-variant text-on-surface-variant font-medium text-sm" onclick="switchSection('issues')">
                            <span class="material-symbols-outlined text-lg">bug_report</span>
                            Issues CE
                        </div>
                        <div class="drawer-item active flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer font-medium text-sm" onclick="switchSection('projects')">
                            <span class="material-symbols-outlined text-lg">inventory_2</span>
                            Proyectos CE
                        </div>
                    </nav>
                </div>
                <div class="mt-auto p-6">
                    <button id="theme-toggle" class="w-full glacier-surface px-4 py-3 rounded-xl border border-primary/20 flex items-center justify-center gap-2 text-sm cursor-pointer hover:border-primary/40 transition-all mb-4" title="Cambiar tema">
                        <span class="material-symbols-outlined text-primary" id="theme-icon">light_mode</span>
                        <span class="text-on-surface-variant text-xs font-medium" id="theme-label">Modo Claro</span>
                    </button>
                    <div class="bg-surface-container rounded-xl p-4 border border-outline-variant/30">
                        <p class="text-xs text-primary font-semibold mb-1 uppercase tracking-tighter">Continuity Eng.</p>
                        <p class="text-[10px] text-on-surface-variant">v2.4.0 Glacier Stable</p>
                    </div>
                </div>
            </aside>

            <main class="flex-1 ml-64 p-8 lg:p-12" data-purpose="dashboard-content">
                <section class="max-w-6xl mx-auto" id="projects">
                    <div class="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                        <div>
                            <h1 class="text-4xl font-bold text-white tracking-tight flex items-center gap-3">
                                <span class="material-symbols-outlined text-primary text-4xl">inventory_2</span>
                                Proyectos CE
                            </h1>
                            <p class="text-on-surface-variant mt-2">Seguimiento de iniciativas de continuidad de ingeniería</p>
                        </div>
                        <div class="glacier-surface px-4 py-2 rounded-xl border border-primary/20 flex items-center gap-3 text-sm">
                            <span class="material-symbols-outlined text-primary animate-pulse">sync</span>
                            <span class="text-on-surface-variant">Live Data Active</span>
                        </div>
                    </div>

                    <div class="bg-surface-container border-l-4 border-primary p-4 rounded-r-xl mb-10 flex items-start gap-4">
                        <span class="material-symbols-outlined text-primary mt-0.5">info</span>
                        <p class="text-sm text-on-primary-container leading-relaxed"><strong class="text-primary">Nota:</strong> Los Pendientes son la suma de los estados Backlog, Planned, In progress, Blocked e In Review. No cuenta cancelados, ni archivados, ni completados.</p>
                    </div>

                    <div class="flex items-center gap-2 mb-8 overflow-x-auto pb-2" data-purpose="month-navigation">
""" + month_buttons + """                    </div>

                    <div class="tab-content" data-purpose="projects-data" id="tab-projects">
                        <div class="flex items-center gap-2 mb-6">
                            <span class="h-2 w-2 rounded-full bg-primary"></span>
                            <span class="text-sm font-medium text-on-surface-variant uppercase tracking-widest" id="month-header">""" + month_text + """ 2026: """ + str(total) + """ proyectos creados</span>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
""" + metrics_cards + """                        </div>

                        <div class="mb-10">
                            <h2 class="text-xl font-bold text-white flex items-center gap-2 mb-6">
                                <span class="material-symbols-outlined text-primary">branding_watermark</span>
                                Proyectos por Marca
                            </h2>
                            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-4">
""" + brands_cards + """                            </div>
                            <div id="unclassified-disclaimer" class="bg-tertiary/10 border border-tertiary/30 rounded-lg p-3 text-xs text-on-surface-variant flex items-start gap-2">
                                <span class="material-symbols-outlined text-tertiary text-sm flex-shrink-0">info</span>
                                <span><span class="text-tertiary font-semibold">Sin clasificar:</span> Proyectos que no contienen ningún nombre de marca en su título y no pueden asignarse automáticamente a una categoría específica.</span>
                            </div>
                        </div>

                        <div class="glacier-surface p-8 rounded-2xl shadow-xl shadow-black/40" data-purpose="status-table-container">
                            <div class="flex items-center justify-between mb-8">
                                <h2 class="text-xl font-bold text-white flex items-center gap-2">
                                    <span class="material-symbols-outlined text-primary">bar_chart</span>
                                    Por Estado
                                </h2>
                            </div>
                            <div class="overflow-hidden rounded-xl border border-outline-variant/30">
                                <table aria-label="Desglose de proyectos por estado" class="w-full text-left">
                                    <thead>
                                        <tr class="bg-surface-container-high">
                                            <th class="px-6 py-4 text-xs font-bold text-primary uppercase tracking-widest">Estado</th>
                                            <th class="px-6 py-4 text-xs font-bold text-primary uppercase tracking-widest text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-outline-variant/20">
""" + status_rows + """                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="issues" style="display: none;">
""" + issues_section + """
                </section>
            </main>
        </div>

        <script data-purpose="ui-interactions">
            // Datos de todos los meses desde el servidor
            const monthsData = """ + months_data_json + """;

            // ========== THEME TOGGLE ==========
            const themeToggle = document.getElementById('theme-toggle');
            const themeIcon = document.getElementById('theme-icon');
            const themeLabel = document.getElementById('theme-label');
            const htmlElement = document.documentElement;

            // Restaurar preferencia de tema guardada
            const savedTheme = localStorage.getItem('theme') || 'light';
            if (savedTheme === 'dark') {
                htmlElement.classList.add('dark');
                updateThemeUI(true);
            }

            function updateThemeUI(isDark) {
                if (isDark) {
                    themeIcon.textContent = 'dark_mode';
                    themeLabel.textContent = 'Modo Oscuro';
                } else {
                    themeIcon.textContent = 'light_mode';
                    themeLabel.textContent = 'Modo Claro';
                }
            }

            themeToggle.addEventListener('click', () => {
                const isDark = htmlElement.classList.toggle('dark');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
                updateThemeUI(isDark);
            });
            // ========== END THEME TOGGLE ==========

            function switchSection(section) {
                document.getElementById('projects').style.display = section === 'projects' ? 'block' : 'none';
                document.getElementById('issues').style.display = section === 'issues' ? 'block' : 'none';
                document.querySelectorAll('.drawer-item').forEach(item => item.classList.remove('active'));
                event.target.closest('.drawer-item').classList.add('active');
            }

            function updateMonthData(monthName) {
                const data = monthsData[monthName];
                if (!data) return;

                // Actualizar encabezado del mes
                document.getElementById('month-header').textContent = monthName + ' 2026: ' + data.total_projects + ' proyectos creados';

                // Actualizar métricas
                document.getElementById('metric-total').textContent = data.total_projects;
                document.getElementById('metric-progress').textContent = data.in_progress;
                document.getElementById('metric-pending').textContent = data.pending_ce2;
                document.getElementById('metric-blocked').textContent = data.blocked;
                document.getElementById('metric-completed').textContent = data.completed;

                // Actualizar tabla Por Estado
                const byState = data.by_state || {};
                const statesOrder = ['backlog', 'planned', 'in progress', 'blocked', 'in review', 'canceled', 'archived'];
                statesOrder.forEach(state => {
                    const stateId = state.replace(' ', '-');
                    const statusElement = document.getElementById('status-' + stateId);
                    if (statusElement) {
                        // Buscar en byState con diferentes capitalizaciones
                        let count = 0;
                        for (const key in byState) {
                            if (key.toLowerCase() === state.toLowerCase()) {
                                count = byState[key];
                                break;
                            }
                        }
                        statusElement.textContent = count;
                    }
                });

                // Actualizar tarjetas de marcas
                let hasUnclassified = false;
                document.querySelectorAll('.brand-card').forEach(card => {
                    const brand = card.getAttribute('data-brand');
                    const brandData = data.brands[brand];
                    if (brandData) {
                        const total = brandData.total || 0;
                        const pending = brandData.pending || 0;
                        const completed = brandData.completed || 0;
                        card.querySelector('.brand-total').textContent = total;
                        card.querySelector('.brand-pending').textContent = pending;
                        // Calcular y actualizar porcentaje
                        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
                        card.querySelector('.brand-percentage').textContent = percentage + '%';
                        // Mostrar u ocultar según si tiene datos
                        if (total > 0 || pending > 0) {
                            card.style.display = 'block';
                            // Detectar si hay "Sin clasificar"
                            if (brand === 'Sin clasificar') {
                                hasUnclassified = true;
                            }
                        } else {
                            card.style.display = 'none';
                        }
                    }
                });

                // Mostrar u ocultar disclaimer de Sin clasificar
                const unclassifiedDisclaimer = document.getElementById('unclassified-disclaimer');
                if (unclassifiedDisclaimer) {
                    unclassifiedDisclaimer.style.display = hasUnclassified ? 'flex' : 'none';
                }
            }

            document.querySelectorAll('[data-month]').forEach(button => {
                button.addEventListener('click', () => {
                    const month = button.getAttribute('data-month');

                    // Actualizar estilos de botones
                    document.querySelectorAll('[data-month]').forEach(btn => {
                        btn.classList.remove('text-primary', 'bg-primary/10', 'border-primary/30', 'shadow-lg', 'shadow-primary/5', 'font-semibold');
                        btn.classList.add('text-on-surface-variant', 'font-medium');
                    });
                    button.classList.add('text-primary', 'bg-primary/10', 'border-primary/30', 'shadow-lg', 'shadow-primary/5', 'font-semibold');
                    button.classList.remove('text-on-surface-variant', 'font-medium');

                    // Actualizar datos
                    updateMonthData(month);
                });
            });
        </script>
    </body>
    </html>
    """

    return html


if __name__ == "__main__":
    print("🔄 Generando dashboard unificado...\n")

    # Obtener todos los proyectos de CE2
    all_projects = get_projects()

    # Meses a procesar
    all_months = [
        (1, "Enero"),
        (2, "Febrero"),
        (3, "Marzo"),
        (4, "Abril"),
        (5, "Mayo")
    ]

    # Procesar proyectos por mes
    all_months_projects_metrics = []

    print("Procesando proyectos por mes...\n")

    for month_num, month_name in all_months:
        projects_in_month = get_projects_for_month(2026, month_num, month_name, all_projects)
        if projects_in_month:
            projects_metrics = calculate_project_metrics(projects_in_month)
        else:
            projects_metrics = {
                "month": month_name,
                "total_projects": 0,
                "in_progress": 0,
                "pending_ce2": 0,
                "completed": 0,
                "by_state": {},
                "by_lead": {},
                "progress_distribution": {
                    "0-25%": 0,
                    "25-50%": 0,
                    "50-75%": 0,
                    "75-100%": 0
                },
                "projects_list": []
            }

        projects_metrics["month"] = month_name
        all_months_projects_metrics.append(projects_metrics)
        print(f"📈 {month_name}: {projects_metrics['total_projects']} proyectos (En Progreso: {projects_metrics['in_progress']}, Pendientes: {projects_metrics['pending_ce2']})")

    # Obtener issues por mes
    all_months_metrics = []

    print("\nObteniendo issues sin proyecto...\n")

    for month_num, month_name in all_months:
        issues = get_issues_for_month(2026, month_num, month_name)
        metrics = calculate_metrics(issues, month_name)
        all_months_metrics.append(metrics)

        pending_total = sum(metrics['pending_by_product'].values())
        print(f"📈 {month_name}: {metrics['total_issues']} issues CE | Pendientes: {pending_total}")

    html = generate_html(all_months_projects_metrics, all_months_metrics)
    with open("index.html", "w") as f:
        f.write(html)
    print("\n✅ Dashboard unificado generado: index.html")
