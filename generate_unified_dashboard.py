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
        first: 100
      ) {
        nodes {
          id
          name
          state
          progress
          lead {name}
          createdAt
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

def calculate_project_metrics(projects):
    """Calcula métricas para proyectos"""
    from datetime import datetime as dt

    # Contar proyectos válidos (excluyendo canceled y discarded)
    valid_projects = [p for p in projects if p.get("state") not in ["canceled", "Discarded"]]

    metrics = {
        "total_projects": len(valid_projects),  # Sin cancelados/descartados
        "pending_ce2": 0,  # CE2 projects NOT Closed/Discarded/canceled
        "in_progress": 0,
        "completed": 0,  # Completed projects
        "canceled": 0,  # Canceled projects (referencia, no en total)
        "closed_2026": 0,  # Closed projects from CE1+CE2 in 2026
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
        lead = project.get("lead", {}).get("name", "Unassigned") if project.get("lead") else "Unassigned"
        progress = project.get("progress", 0)
        name = project.get("name", "Unknown")
        created_at = project.get("createdAt", "")
        teams = project.get("teams", {}).get("nodes", [])

        # Contar In Progress (Linear usa "started" para In Progress)
        if state in ["In Progress", "started"]:
            metrics["in_progress"] += 1

        # Contar completados
        if state in ["Closed", "completed"]:
            metrics["completed"] += 1

        # Contar cancelados
        if state in ["canceled", "Discarded"]:
            metrics["canceled"] += 1

        # Contar pendientes de CE2 (proyectos en Backlog o Planned, sin incluir In Progress)
        is_ce2 = any(t.get("key") == "CE2" for t in teams)
        if is_ce2 and state in ["backlog", "Backlog", "planned", "Planned"]:
            metrics["pending_ce2"] += 1

        # Contar cerrados de 2026
        if state == "Closed" and created_at:
            try:
                created_year = int(created_at.split("-")[0])
                if created_year == current_year:
                    metrics["closed_2026"] += 1
            except:
                pass

        metrics["by_state"][state] = metrics["by_state"].get(state, 0) + 1
        metrics["by_lead"][lead] = metrics["by_lead"].get(lead, 0) + 1

        if progress <= 25:
            metrics["progress_distribution"]["0-25%"] += 1
        elif progress <= 50:
            metrics["progress_distribution"]["25-50%"] += 1
        elif progress <= 75:
            metrics["progress_distribution"]["50-75%"] += 1
        else:
            metrics["progress_distribution"]["75-100%"] += 1

        metrics["projects_list"].append({
            "name": name,
            "state": state,
            "lead": lead,
            "progress": progress
        })

    return metrics

def generate_html(all_months_projects_metrics, all_months_metrics):
    """Genera HTML unificado con drawer menu"""

    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Linear Dashboard - Continuity Engineering</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: #0a0e1a;
                color: #e0e0e0;
            }
            .container {
                display: flex;
                min-height: 100vh;
            }
            .drawer {
                width: 200px;
                background: rgba(15, 21, 36, 0.6);
                backdrop-filter: blur(16px);
                border-right: 1px solid rgba(125, 211, 252, 0.1);
                color: white;
                padding: 15px;
                box-shadow: 0 0 30px rgba(125, 211, 252, 0.05);
                position: fixed;
                height: 100vh;
                overflow-y: auto;
            }
            .drawer h2 {
                font-size: 14px;
                margin-bottom: 15px;
                padding-bottom: 8px;
                border-bottom: 2px solid rgba(125, 211, 252, 0.3);
                font-weight: 600;
            }
            .drawer-item {
                padding: 10px 12px;
                margin-bottom: 6px;
                cursor: pointer;
                border-radius: 6px;
                border-left: 3px solid transparent;
                transition: all 0.2s;
                font-size: 13px;
                background: rgba(125, 211, 252, 0.05);
                border: 1px solid rgba(125, 211, 252, 0.1);
            }
            .drawer-item:hover {
                background: rgba(125, 211, 252, 0.1);
                border-color: rgba(125, 211, 252, 0.2);
                box-shadow: 0 0 15px rgba(125, 211, 252, 0.1);
            }
            .drawer-item.active {
                background: rgba(125, 211, 252, 0.2);
                border-left-color: #7dd3fc;
                box-shadow: 0 0 20px rgba(125, 211, 252, 0.15);
            }
            .content {
                flex: 1;
                margin-left: 200px;
                padding: 30px;
            }
            .section {
                display: none;
            }
            .section.active {
                display: block;
            }
            h1 {
                color: #ffffff;
                margin-bottom: 20px;
            }
            .note {
                background: rgba(15, 21, 36, 0.6);
                backdrop-filter: blur(16px);
                padding: 12px;
                border-left: 4px solid #7dd3fc;
                border: 1px solid rgba(125, 211, 252, 0.2);
                border-left: 4px solid #7dd3fc;
                margin-bottom: 20px;
                border-radius: 8px;
                color: #7dd3fc;
                box-shadow: 0 0 20px rgba(125, 211, 252, 0.05);
            }
            .disclaimer {
                background: rgba(15, 21, 36, 0.6);
                backdrop-filter: blur(16px);
                padding: 15px;
                border-left: 4px solid #c8a0f0;
                border: 1px solid rgba(200, 160, 240, 0.2);
                border-left: 4px solid #c8a0f0;
                margin-bottom: 20px;
                border-radius: 8px;
                font-size: 13px;
                color: #c8a0f0;
                box-shadow: 0 0 20px rgba(200, 160, 240, 0.05);
            }
            .disclaimer strong {
                display: block;
                margin-bottom: 8px;
            }
            .disclaimer-item {
                margin: 5px 0;
            }
            .tabs {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
                border-bottom: 2px solid #333;
                flex-wrap: wrap;
            }
            .tab-button {
                background: none;
                border: none;
                padding: 12px 16px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                color: #999;
                border-bottom: 3px solid transparent;
                transition: all 0.2s;
            }
            .tab-button:hover {
                color: #7dd3fc;
                border-bottom-color: rgba(125, 211, 252, 0.3);
            }
            .tab-button.active {
                color: #7dd3fc;
                border-bottom-color: #7dd3fc;
                box-shadow: 0 2px 10px rgba(125, 211, 252, 0.1);
            }
            .tab-content {
                display: none;
            }
            .tab-content.active {
                display: block;
            }
            .month-summary {
                background: rgba(15, 21, 36, 0.6);
                backdrop-filter: blur(16px);
                padding: 15px;
                border-left: 4px solid #7dd3fc;
                border: 1px solid rgba(125, 211, 252, 0.2);
                border-left: 4px solid #7dd3fc;
                border-radius: 8px;
                margin-bottom: 20px;
                font-size: 14px;
                color: #7dd3fc;
                box-shadow: 0 0 20px rgba(125, 211, 252, 0.05);
            }
            .metrics {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
                margin-bottom: 30px;
            }
            .metric-card {
                background: rgba(15, 21, 36, 0.6);
                backdrop-filter: blur(16px);
                padding: 15px;
                border-radius: 12px;
                box-shadow: 0 0 30px rgba(125, 211, 252, 0.05);
                border: 1px solid rgba(125, 211, 252, 0.15);
                text-align: center;
                transition: all 0.3s ease;
            }
            .metric-card:hover {
                background: rgba(15, 21, 36, 0.75);
                border-color: rgba(125, 211, 252, 0.3);
                box-shadow: 0 0 30px rgba(125, 211, 252, 0.1);
            }
            .metric-card.ce1 {
                border-left-color: #ff687a;
            }
            .metric-card.ce2 {
                border-left-color: #04ffb0;
            }
            .value {
                font-size: 28px;
                font-weight: bold;
                color: #7dd3fc;
                margin: 8px 0;
            }
            .metric-card.ce1 .value {
                color: #7dd3fc;
            }
            .metric-card.ce2 .value {
                color: #7dd3fc;
            }
            .label {
                color: #aaa;
                font-size: 12px;
            }
            .progress-container {
                background: rgba(15, 21, 36, 0.6);
                backdrop-filter: blur(16px);
                padding: 20px;
                border-radius: 12px;
                box-shadow: 0 0 30px rgba(125, 211, 252, 0.05);
                border: 1px solid rgba(125, 211, 252, 0.15);
                margin-bottom: 30px;
            }
            .progress-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }
            .progress-header h4 {
                margin: 0;
                color: #ffffff;
                font-size: 14px;
            }
            .progress-percentage {
                font-size: 18px;
                font-weight: bold;
                color: #7dd3fc;
            }
            .progress-bar {
                width: 100%;
                height: 24px;
                background: rgba(125, 211, 252, 0.1);
                border-radius: 12px;
                overflow: hidden;
                position: relative;
                border: 1px solid rgba(125, 211, 252, 0.2);
            }
            .progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #7dd3fc, #c8a0f0);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: flex-end;
                padding-right: 8px;
                color: #0a0e1a;
                font-size: 11px;
                font-weight: 600;
                transition: width 0.3s ease;
                box-shadow: 0 0 20px rgba(125, 211, 252, 0.3);
            }
            .section-box {
                background: rgba(15, 21, 36, 0.6);
                backdrop-filter: blur(16px);
                padding: 20px;
                border-radius: 12px;
                margin-bottom: 20px;
                box-shadow: 0 0 30px rgba(125, 211, 252, 0.05);
                border: 1px solid rgba(125, 211, 252, 0.15);
            }
            .section-box h2 {
                margin-top: 0;
                margin-bottom: 25px;
                color: #ffffff;
                border-bottom: 2px solid rgba(125, 211, 252, 0.3);
                padding-bottom: 15px;
                font-weight: 600;
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th, td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #333;
                color: #e0e0e0;
            }
            th {
                background: #2a2a2a;
                font-weight: 600;
                color: #ffffff;
            }
            .timestamp {
                text-align: center;
                color: #666;
                font-size: 12px;
                margin-top: 20px;
            }
            .product-summary {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                gap: 25px;
                margin-bottom: 10px;
            }
            .product-card {
                background: rgba(15, 21, 36, 0.6);
                backdrop-filter: blur(16px);
                border: 1px solid rgba(125, 211, 252, 0.15);
                border-radius: 12px;
                padding: 15px;
                transition: all 0.3s ease;
                box-shadow: 0 0 20px rgba(125, 211, 252, 0.03);
            }
            .product-card:hover {
                background: rgba(15, 21, 36, 0.75);
                border-color: rgba(125, 211, 252, 0.3);
                box-shadow: 0 0 30px rgba(125, 211, 252, 0.1);
            }
            .product-name {
                font-weight: 600;
                color: #ffffff;
                margin-bottom: 12px;
                font-size: 13px;
            }
            .product-stats {
                display: flex;
                justify-content: space-between;
                gap: 10px;
            }
            .stat {
                flex: 1;
                text-align: center;
            }
            .stat-label {
                display: block;
                color: #999;
                font-size: 11px;
                margin-bottom: 4px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .stat-value {
                display: block;
                font-size: 16px;
                font-weight: bold;
                color: #7dd3fc;
            }
            .stat-value.pending {
                color: #c8a0f0;
            }
            .stat-value.closed {
                color: #7dd3fc;
            }
            .theme-toggle {
                padding: 10px 12px;
                margin-bottom: 15px;
                cursor: pointer;
                border-radius: 8px;
                background: rgba(125, 211, 252, 0.1);
                border: 1px solid rgba(125, 211, 252, 0.2);
                color: #7dd3fc;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
                text-align: center;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            .theme-toggle:hover {
                background: rgba(125, 211, 252, 0.15);
                border-color: rgba(125, 211, 252, 0.3);
                color: #7dd3fc;
                box-shadow: 0 0 20px rgba(125, 211, 252, 0.1);
            }
            /* MODO CLARO - GLACIER */
            body.light-mode {
                background: linear-gradient(135deg, #f8fafc 0%, #f0f4f8 100%);
                color: #1a1a1a;
            }
            body.light-mode .drawer {
                background: rgba(248, 250, 252, 0.7);
                backdrop-filter: blur(16px);
                color: #1a1a1a;
                box-shadow: 0 0 30px rgba(125, 211, 252, 0.05);
                border-right: 1px solid rgba(125, 211, 252, 0.15);
            }
            body.light-mode .drawer h2 {
                border-bottom-color: rgba(125, 211, 252, 0.3);
                color: #1a1a1a;
                font-weight: 600;
            }
            body.light-mode .drawer-item {
                color: #555;
                background: rgba(125, 211, 252, 0.08);
                border: 1px solid rgba(125, 211, 252, 0.12);
            }
            body.light-mode .drawer-item:hover {
                background: rgba(125, 211, 252, 0.15);
                color: #0a5f8f;
                border-color: rgba(125, 211, 252, 0.25);
                box-shadow: 0 0 15px rgba(125, 211, 252, 0.1);
            }
            body.light-mode .drawer-item.active {
                background: rgba(125, 211, 252, 0.25);
                color: #0a5f8f;
                border-left-color: #7dd3fc;
                box-shadow: 0 0 20px rgba(125, 211, 252, 0.15);
            }
            body.light-mode .content {
                background: linear-gradient(135deg, #f8fafc 0%, #f0f4f8 100%);
            }
            body.light-mode h1, body.light-mode h2, body.light-mode h3, body.light-mode h4 {
                color: #1a1a1a;
                font-weight: 600;
            }
            body.light-mode .section-box {
                background: rgba(248, 250, 252, 0.6);
                backdrop-filter: blur(16px);
                border: 1px solid rgba(125, 211, 252, 0.15);
                box-shadow: 0 0 30px rgba(125, 211, 252, 0.05);
            }
            body.light-mode .metric-card {
                background: rgba(248, 250, 252, 0.6);
                backdrop-filter: blur(16px);
                border: 1px solid rgba(125, 211, 252, 0.15);
                box-shadow: 0 0 20px rgba(125, 211, 252, 0.03);
            }
            body.light-mode .metric-card:hover {
                background: rgba(248, 250, 252, 0.75);
                border-color: rgba(125, 211, 252, 0.3);
                box-shadow: 0 0 30px rgba(125, 211, 252, 0.1);
            }
            body.light-mode .note {
                background: rgba(125, 211, 252, 0.08);
                backdrop-filter: blur(16px);
                color: #0a5f8f;
                border-left: 4px solid #7dd3fc;
                border: 1px solid rgba(125, 211, 252, 0.2);
                border-left: 4px solid #7dd3fc;
                box-shadow: 0 0 20px rgba(125, 211, 252, 0.05);
            }
            body.light-mode .disclaimer {
                background: rgba(200, 160, 240, 0.08);
                backdrop-filter: blur(16px);
                color: #6b4c99;
                border-left: 4px solid #c8a0f0;
                border: 1px solid rgba(200, 160, 240, 0.2);
                border-left: 4px solid #c8a0f0;
                box-shadow: 0 0 20px rgba(200, 160, 240, 0.05);
            }
            body.light-mode table {
                color: #1a1a1a;
            }
            body.light-mode th {
                background: rgba(125, 211, 252, 0.1);
                color: #1a1a1a;
                border-bottom-color: rgba(125, 211, 252, 0.2);
                font-weight: 700;
            }
            body.light-mode td {
                color: #1a1a1a;
                border-bottom-color: rgba(125, 211, 252, 0.1);
                font-weight: 500;
            }
            body.light-mode .product-card {
                background: rgba(248, 250, 252, 0.6);
                backdrop-filter: blur(16px);
                border: 1px solid rgba(125, 211, 252, 0.15);
                box-shadow: 0 0 20px rgba(125, 211, 252, 0.03);
            }
            body.light-mode .product-card:hover {
                border-color: rgba(125, 211, 252, 0.3);
                background: rgba(248, 250, 252, 0.75);
                box-shadow: 0 0 30px rgba(125, 211, 252, 0.1);
            }
            body.light-mode .tab-button {
                color: #888;
            }
            body.light-mode .tab-button:hover {
                color: #7dd3fc;
                border-bottom-color: rgba(125, 211, 252, 0.3);
            }
            body.light-mode .tab-button.active {
                color: #7dd3fc;
                border-bottom-color: #7dd3fc;
                box-shadow: 0 2px 10px rgba(125, 211, 252, 0.1);
            }
            body.light-mode .progress-container {
                background: rgba(248, 250, 252, 0.6);
                backdrop-filter: blur(16px);
                border: 1px solid rgba(125, 211, 252, 0.15);
                box-shadow: 0 0 30px rgba(125, 211, 252, 0.05);
            }
            body.light-mode .progress-bar {
                background: rgba(125, 211, 252, 0.1);
                border: 1px solid rgba(125, 211, 252, 0.2);
            }
            body.light-mode .progress-fill {
                background: linear-gradient(90deg, #7dd3fc, #c8a0f0);
                color: #0a0e1a;
            }
            body.light-mode .progress-percentage {
                color: #7dd3fc;
            }
            body.light-mode .theme-toggle {
                background: rgba(125, 211, 252, 0.1);
                border-color: rgba(125, 211, 252, 0.2);
                color: #7dd3fc;
            }
            body.light-mode .theme-toggle:hover {
                background: rgba(125, 211, 252, 0.15);
                border-color: rgba(125, 211, 252, 0.3);
                color: #7dd3fc;
                box-shadow: 0 0 20px rgba(125, 211, 252, 0.1);
            }
            body.light-mode .product-name {
                color: #0a5f8f;
                font-weight: 700;
            }
            body.light-mode .stat-value {
                color: #7dd3fc;
            }
            body.light-mode .stat-label {
                color: #888;
            }
            body.light-mode .value {
                color: #7dd3fc;
            }
            body.light-mode .month-summary {
                background: rgba(125, 211, 252, 0.08);
                backdrop-filter: blur(16px);
                color: #0a5f8f;
                border-left: 4px solid #7dd3fc;
                border: 1px solid rgba(125, 211, 252, 0.2);
                border-left: 4px solid #7dd3fc;
                box-shadow: 0 0 20px rgba(125, 211, 252, 0.05);
            }
            @media (max-width: 768px) {
                .drawer {
                    width: 100%;
                    height: auto;
                    position: relative;
                }
                .content {
                    margin-left: 0;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="drawer">
                <h2>📊 Dashboard</h2>
                <button class="theme-toggle" onclick="toggleTheme()">🌙 Modo Claro</button>
                <div class="drawer-item active" onclick="switchSection('issues')">Issues CE</div>
                <div class="drawer-item" onclick="switchSection('projects')">Proyectos CE</div>
            </div>

            <div class="content">
    """

    # SECCIÓN ISSUES
    html += """
                <div id="issues" class="section active">
                    <h1>📌 Issues Sin Proyecto CE</h1>

                    <div class="note">
                        <strong>ℹ️ Nota:</strong> Solo se muestran issues que NO pertenecen a ningún proyecto.
                        Los issues asociados a proyectos se ven en la sección "Proyectos".
                    </div>

                    <div class="disclaimer">
                        <strong>📌 Definición de "Pendientes":</strong>
                        <div class="disclaimer-item">✓ Se cuentan: Triage, Planning, Backlog, In Progress, In Review, Blocked</div>
                        <div class="disclaimer-item">✗ NO se cuentan: Closed, Discarded</div>
                    </div>

                    <div class="tabs">
    """

    months_order = ["Enero", "Febrero", "Marzo", "Abril", "Mayo"]
    for month in months_order:
        active = "active" if month == "Mayo" else ""
        html += f'<button class="tab-button {active}" onclick="switchTab(\'{month}\')">{month} 2026</button>'

    html += """
                    </div>
    """

    for month_data in all_months_metrics:
        month_name = month_data["month"]
        active = "active" if month_name == "Mayo" else ""
        pending_total = sum(month_data["pending_by_product"].values())

        html += f"""
                    <div class="tab-content {active}" id="tab-{month_name}">
                        <div class="month-summary">
                            <strong>{month_name} 2026:</strong> {month_data["total_issues"]} issues totales
                            | <strong>Pendientes: {pending_total}</strong>
                        </div>

                        <h3>📊 Resumen</h3>

                        <div class="progress-container">
                            <div class="progress-header">
                                <h4>Progreso General</h4>
                                <span class="progress-percentage">{int((month_data["closed"] / month_data["total_issues"] * 100) if month_data["total_issues"] > 0 else 0)}%</span>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: {int((month_data["closed"] / month_data["total_issues"] * 100) if month_data["total_issues"] > 0 else 0)}%"></div>
                            </div>
                        </div>

                        <div class="metrics">
                            <div class="metric-card">
                                <div class="label">Total Issues</div>
                                <div class="value">{month_data["total_issues"]}</div>
                            </div>
                            <div class="metric-card ce2">
                                <div class="label">CE2 Issues Total</div>
                                <div class="value">{month_data["by_team"]["CE2"]}</div>
                            </div>
                            <div class="metric-card">
                                <div class="label">🔥 In Progress</div>
                                <div class="value">{month_data["active_issues"]}</div>
                            </div>
                            <div class="metric-card">
                                <div class="label">🏷️ Sin Label</div>
                                <div class="value">{month_data["backlog_untracked"]}</div>
                            </div>
                            <div class="metric-card">
                                <div class="label">🚫 Bloqueados</div>
                                <div class="value">{month_data["blocked"]}</div>
                            </div>
                            <div class="metric-card">
                                <div class="label">✅ Cerrados</div>
                                <div class="value">{month_data["closed"]}</div>
                            </div>
                            <div class="metric-card">
                                <div class="label">⏳ Pendientes</div>
                                <div class="value">{pending_total}</div>
                            </div>
                        </div>

                        <div class="section-box" style="margin-bottom: 20px;">
                            <h2>📦 Resumen por Producto (Total vs Pendientes)</h2>
                            <div class="product-summary">
        """

        # Generar resumen por producto (ordenado por total de mayor a menor)
        for product, total in sorted(month_data["by_product"].items(), key=lambda x: x[1], reverse=True):
            pending = month_data["pending_by_product"].get(product, 0)

            html += f"""
                                <div class="product-card">
                                    <div class="product-name">{product}</div>
                                    <div class="product-stats">
                                        <div class="stat">
                                            <span class="stat-label">Total</span>
                                            <span class="stat-value">{total}</span>
                                        </div>
            """

            # Solo mostrar Pendientes si hay
            if pending > 0:
                html += f"""
                                        <div class="stat">
                                            <span class="stat-label">Pendientes</span>
                                            <span class="stat-value pending">{pending}</span>
                                        </div>
                """

            html += """
                                    </div>
                                </div>
            """

        html += """
                            </div>
                        </div>

                        <div class="disclaimer" style="margin-top: 20px;">
                            <strong>📌 Nota sobre los totales:</strong>
                            <div class="disclaimer-item">Pendientes + Cerrados = Issues considerados (con etiqueta de producto)</div>
                            <div class="disclaimer-item">Los issues en estado "Discarded" se excluyen y no se cuentan en ninguna categoría</div>
                            <div class="disclaimer-item">"Sin Label" muestra issues que no tienen etiqueta de producto - NO se incluyen en el total hasta etiquetarlos</div>
                        </div>

                        <div class="section-box">
                            <h2>📊 Por Estado (Desglose por Team)</h2>
                            <table>
                                <tr>
                                    <th>Estado</th>
                                    <th>CE1</th>
                                    <th>CE2</th>
                                    <th>Total</th>
                                </tr>
        """

        for state in sorted(month_data["by_state"].keys()):
            count = month_data["by_state"][state]
            ce1_count = month_data["by_state_by_team"].get(f"CE1_{state}", 0)
            ce2_count = month_data["by_state_by_team"].get(f"CE2_{state}", 0)
            html += f"<tr><td>{state}</td><td>{ce1_count}</td><td>{ce2_count}</td><td>{count}</td></tr>"

        html += """
                            </table>
                        </div>

                        <div class="section-box">
                            <h2>🏢 Por Producto (Pendientes vs Total)</h2>
                            <table>
                                <tr>
                                    <th>Producto</th>
                                    <th>Pendientes</th>
                                    <th>Total</th>
                                    <th>Completado %</th>
                                </tr>
        """

        for product in sorted(month_data["by_product"].keys()):
            total = month_data["by_product"][product]
            pending = month_data["pending_by_product"].get(product, 0)
            closed = total - pending
            closed_pct = (closed / total * 100) if total > 0 else 0

            html += f"""
                                <tr>
                                    <td><strong>{product}</strong></td>
                                    <td>{pending}</td>
                                    <td>{total}</td>
                                    <td>{closed_pct:.1f}%</td>
                                </tr>
            """

        html += """
                            </table>
                        </div>
        """

        # Agregar tabla de Pendientes (con etiqueta)
        if month_data["pending_issues_list"]:
            html += f"""
                        <div class="section-box">
                            <h2>⏳ Pendientes por Revisar ({len(month_data["pending_issues_list"])})</h2>
                            <table>
                                <tr>
                                    <th>ID Issue</th>
                                    <th>Título</th>
                                    <th>Estado</th>
                                    <th>Producto</th>
                                    <th>Team</th>
                                    <th>Asignado a</th>
                                    <th>Link</th>
                                </tr>
            """
            for issue in month_data["pending_issues_list"]:
                issue_id = issue["id"]
                title = issue["title"]
                state = issue["state"]
                products = issue["products"]
                team = issue["team"]
                assignee = issue.get("assignee", "Sin asignar")
                link = f'<a href="https://linear.app/guinea/issue/{issue_id}" target="_blank" style="color: #d3c5ff; text-decoration: none;">Abrir →</a>'

                html += f"""
                                <tr>
                                    <td><strong>{issue_id}</strong></td>
                                    <td>{title}</td>
                                    <td>{state}</td>
                                    <td>{products}</td>
                                    <td>{team}</td>
                                    <td>{assignee}</td>
                                    <td>{link}</td>
                                </tr>
                """

            html += """
                            </table>
                        </div>
            """

        # Agregar tabla de issues sin etiqueta
        if month_data["untracked_issues_list"]:
            html += f"""
                        <div class="section-box">
                            <h2>🏷️ Sin Label por Etiquetar ({len(month_data["untracked_issues_list"])})</h2>
                            <table>
                                <tr>
                                    <th>ID Issue</th>
                                    <th>Título</th>
                                    <th>Estado</th>
                                    <th>Team</th>
                                    <th>Asignado a</th>
                                    <th>Link</th>
                                </tr>
            """
            for issue in month_data["untracked_issues_list"]:
                issue_id = issue["id"]
                title = issue["title"]
                state = issue["state"]
                team = issue["team"]
                assignee = issue.get("assignee", "Sin asignar")
                link = f'<a href="https://linear.app/guinea/issue/{issue_id}" target="_blank" style="color: #d3c5ff; text-decoration: none;">Abrir →</a>'

                html += f"""
                                <tr>
                                    <td><strong>{issue_id}</strong></td>
                                    <td>{title}</td>
                                    <td>{state}</td>
                                    <td>{team}</td>
                                    <td>{assignee}</td>
                                    <td>{link}</td>
                                </tr>
                """

            html += """
                            </table>
                        </div>
            """

        html += """
                    </div>
        """

    html += """
                </div>
    """

    # SECCIÓN PROYECTOS
    html += """
                <div id="projects" class="section">
                    <h1>📦 Proyectos CE</h1>

                    <div class="note">
                        <strong>ℹ️ Nota:</strong> Proyectos del equipo Continuity Engineering con sus métricas de estado.
                    </div>

                    <div class="tabs">
    """

    months_order = ["Enero", "Febrero", "Marzo", "Abril", "Mayo"]
    for month in months_order:
        active = "active" if month == "Mayo" else ""
        html += f'<button class="tab-button {active}" onclick="switchTab(\'{month}_projects\')">{month} 2026</button>'

    html += """
                    </div>
    """

    for month_data in all_months_projects_metrics:
        month_name = month_data["month"]
        active = "active" if month_name == "Mayo" else ""

        html += f"""
                    <div class="tab-content {active}" id="tab-{month_name}_projects">
                        <div class="month-summary">
                            <strong>{month_name} 2026:</strong> {month_data["total_projects"]} proyectos creados
                        </div>

                        <div class="metrics">
                            <div class="metric-card">
                                <div class="label">Total CE2</div>
                                <div class="value">{month_data["total_projects"]}</div>
                            </div>
                            <div class="metric-card">
                                <div class="label">En Progreso</div>
                                <div class="value">{month_data["in_progress"]}</div>
                            </div>
                            <div class="metric-card">
                                <div class="label">Pendientes</div>
                                <div class="value">{month_data["pending_ce2"]}</div>
                            </div>
        """

        # Mostrar Completados solo si hay
        if month_data["completed"] > 0:
            html += f"""
                            <div class="metric-card">
                                <div class="label">✅ Completados</div>
                                <div class="value">{month_data["completed"]}</div>
                            </div>
        """

        # Mostrar Cancelados solo si hay
        canceled_count = month_data.get("canceled", 0)
        if canceled_count > 0:
            html += f"""
                            <div class="metric-card">
                                <div class="label">⛔ Cancelados</div>
                                <div class="value">{canceled_count}</div>
                            </div>
        """

        html += """
                        </div>

                        <div class="section-box">
                            <h2>📊 Por Estado</h2>
                            <table>
                                <tr>
                                    <th>Estado</th>
                                    <th>Total</th>
                                </tr>
        """

        for state in sorted(month_data["by_state"].keys()):
            count = month_data["by_state"][state]
            html += f"<tr><td>{state}</td><td>{count}</td></tr>"

        html += """
                            </table>
                        </div>
                    </div>
        """

    html += f"""
                </div>

                <div class="timestamp">
                    <strong>📊 Continuity Engineering</strong><br>
                    Actualizado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} UTC
                </div>
            </div>
        </div>

        <script>
            // Initialize theme from localStorage
            function initTheme() {{
                const savedTheme = localStorage.getItem('theme');
                if (savedTheme === 'light') {{
                    document.body.classList.add('light-mode');
                    updateToggleButton(true);
                }}
            }}

            // Toggle theme
            function toggleTheme() {{
                const body = document.body;
                const isLightMode = body.classList.toggle('light-mode');

                // Save preference
                localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
                updateToggleButton(isLightMode);
            }}

            // Update toggle button text
            function updateToggleButton(isLightMode) {{
                const btn = document.querySelector('.theme-toggle');
                if (btn) {{
                    btn.textContent = isLightMode ? '☀️ Modo Oscuro' : '🌙 Modo Claro';
                }}
            }}

            function switchSection(sectionId) {{
                // Hide all sections
                const sections = document.querySelectorAll('.section');
                sections.forEach(s => s.classList.remove('active'));

                // Remove active from drawer items
                const items = document.querySelectorAll('.drawer-item');
                items.forEach(i => i.classList.remove('active'));

                // Show selected section
                const section = document.getElementById(sectionId);
                if (section) {{
                    section.classList.add('active');
                }}

                // Add active to clicked item
                event.target.classList.add('active');
            }}

            function switchTab(monthIdentifier) {{
                // Get the active section
                const activeSection = document.querySelector('.section.active');
                if (!activeSection) return;

                // Hide all tabs in this section
                const tabs = activeSection.querySelectorAll('.tab-content');
                tabs.forEach(tab => tab.classList.remove('active'));

                // Remove active from buttons in this section
                const buttons = activeSection.querySelectorAll('.tab-button');
                buttons.forEach(btn => btn.classList.remove('active'));

                // Show selected tab
                const selectedTab = document.getElementById('tab-' + monthIdentifier);
                if (selectedTab) {{
                    selectedTab.classList.add('active');
                }}

                // Add active to clicked button
                event.target.classList.add('active');
            }}

            // Initialize theme on page load
            initTheme();
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
