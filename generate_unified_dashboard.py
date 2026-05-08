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
    """Obtiene proyectos de CE1 y CE2"""
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

    print("📊 Obteniendo proyectos...")
    result = query_linear(query)

    if not result or "errors" in result:
        print("❌ Error en query de proyectos")
        if result and "errors" in result:
            print(f"   Detalle: {result['errors']}")
        return []

    all_projects = result["data"]["projects"]["nodes"]
    # Filtrar solo proyectos de CE1 y CE2
    ce_projects = []
    for p in all_projects:
        teams = p.get("teams", {}).get("nodes", [])
        if teams and any(t.get("key") in ["CE1", "CE2"] for t in teams):
            ce_projects.append(p)

    print(f"✅ {len(ce_projects)} proyectos de CE1+CE2 obtenidos (de {len(all_projects)} totales)\n")
    return ce_projects

def get_issues_for_month(year, month, month_name):
    """Obtiene issues SIN proyecto para un mes específico de CE1 + CE2"""
    from datetime import datetime as dt

    start_date = dt(year, month, 1)
    if month == 12:
        end_date = dt(year + 1, 1, 1)
    else:
        end_date = dt(year, month + 1, 1)

    query = f"""
    {{
      issues(
        first: 250
        filter: {{
          team: {{key: {{in: ["CE1", "CE2"]}}}}
          createdAt: {{gte: "{start_date.isoformat()}Z", lt: "{end_date.isoformat()}Z"}}
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
            metrics["untracked_issues_list"].append({
                "id": issue["identifier"],
                "title": issue["title"],
                "state": state,
                "team": team
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
                metrics["pending_issues_list"].append({
                    "id": issue["identifier"],
                    "title": issue["title"],
                    "state": state,
                    "team": team,
                    "products": ", ".join(product_labels)
                })

    return metrics

def calculate_project_metrics(projects):
    """Calcula métricas para proyectos"""
    from datetime import datetime as dt

    metrics = {
        "total_projects": len(projects),
        "pending_ce2": 0,  # CE2 projects NOT Closed/Discarded
        "in_progress": 0,
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

        # Contar In Progress
        if state == "In Progress":
            metrics["in_progress"] += 1

        # Contar pendientes de CE2 (NOT Closed, NOT Discarded)
        is_ce2 = any(t.get("key") == "CE2" for t in teams)
        if is_ce2 and state not in ["Closed", "Discarded"]:
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

def generate_html(projects_metrics, all_months_metrics):
    """Genera HTML unificado con drawer menu"""

    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Linear Dashboard - CE1, CE2 & Proyectos</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: #f5f5f5;
            }
            .container {
                display: flex;
                min-height: 100vh;
            }
            .drawer {
                width: 280px;
                background: #1a1a1a;
                color: white;
                padding: 20px;
                box-shadow: 2px 0 10px rgba(0,0,0,0.1);
                position: fixed;
                height: 100vh;
                overflow-y: auto;
            }
            .drawer h2 {
                font-size: 18px;
                margin-bottom: 20px;
                padding-bottom: 10px;
                border-bottom: 2px solid #0052ff;
            }
            .drawer-item {
                padding: 12px 16px;
                margin-bottom: 8px;
                cursor: pointer;
                border-radius: 6px;
                border-left: 3px solid transparent;
                transition: all 0.2s;
            }
            .drawer-item:hover {
                background: #2a2a2a;
            }
            .drawer-item.active {
                background: #0052ff;
                border-left-color: #00d4ff;
            }
            .content {
                flex: 1;
                margin-left: 280px;
                padding: 30px;
            }
            .section {
                display: none;
            }
            .section.active {
                display: block;
            }
            h1 {
                color: #333;
                margin-bottom: 20px;
            }
            .note {
                background: #e3f2fd;
                padding: 12px;
                border-left: 4px solid #1976d2;
                margin-bottom: 20px;
                border-radius: 4px;
            }
            .disclaimer {
                background: #fff3cd;
                padding: 15px;
                border-left: 4px solid #ffc107;
                margin-bottom: 20px;
                border-radius: 4px;
                font-size: 13px;
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
                border-bottom: 2px solid #ddd;
                flex-wrap: wrap;
            }
            .tab-button {
                background: none;
                border: none;
                padding: 12px 16px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                color: #666;
                border-bottom: 3px solid transparent;
                transition: all 0.2s;
            }
            .tab-button:hover {
                color: #0052ff;
            }
            .tab-button.active {
                color: #0052ff;
                border-bottom-color: #0052ff;
            }
            .tab-content {
                display: none;
            }
            .tab-content.active {
                display: block;
            }
            .month-summary {
                background: #f0f7ff;
                padding: 15px;
                border-left: 4px solid #0052ff;
                border-radius: 4px;
                margin-bottom: 20px;
                font-size: 14px;
            }
            .metrics {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
                margin-bottom: 30px;
            }
            .metric-card {
                background: white;
                padding: 15px;
                border-radius: 8px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                border-left: 4px solid #0052ff;
                text-align: center;
            }
            .metric-card.ce1 {
                border-left-color: #ff6b6b;
            }
            .metric-card.ce2 {
                border-left-color: #4ecdc4;
            }
            .value {
                font-size: 28px;
                font-weight: bold;
                color: #0052ff;
                margin: 8px 0;
            }
            .metric-card.ce1 .value {
                color: #ff6b6b;
            }
            .metric-card.ce2 .value {
                color: #4ecdc4;
            }
            .label {
                color: #666;
                font-size: 12px;
            }
            .progress-container {
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
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
                color: #333;
                font-size: 14px;
            }
            .progress-percentage {
                font-size: 18px;
                font-weight: bold;
                color: #0052ff;
            }
            .progress-bar {
                width: 100%;
                height: 24px;
                background: #f0f0f0;
                border-radius: 12px;
                overflow: hidden;
                position: relative;
            }
            .progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #0052ff, #00d4ff);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: flex-end;
                padding-right: 8px;
                color: white;
                font-size: 11px;
                font-weight: 600;
                transition: width 0.3s ease;
            }
            .section-box {
                background: white;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 20px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .section-box h2 {
                margin-top: 0;
                color: #333;
                border-bottom: 2px solid #0052ff;
                padding-bottom: 10px;
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th, td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #eee;
            }
            th {
                background: #f9f9f9;
                font-weight: 600;
                color: #333;
            }
            .timestamp {
                text-align: center;
                color: #999;
                font-size: 12px;
                margin-top: 20px;
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
                <div class="drawer-item active" onclick="switchSection('issues')">Issues (CE1 + CE2)</div>
                <div class="drawer-item" onclick="switchSection('projects')">Proyectos (CE2)</div>
            </div>

            <div class="content">
    """

    # SECCIÓN ISSUES
    html += """
                <div id="issues" class="section active">
                    <h1>📌 Issues Sin Proyecto - CE1 + CE2</h1>

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
                            (CE1: {month_data["by_team"]["CE1"]} + CE2: {month_data["by_team"]["CE2"]})
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
                            <div class="metric-card ce1">
                                <div class="label">CE1 Issues Total</div>
                                <div class="value">{month_data["by_team"]["CE1"]}</div>
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
                                    <th>Link</th>
                                </tr>
            """
            for issue in month_data["pending_issues_list"]:
                issue_id = issue["id"]
                title = issue["title"]
                state = issue["state"]
                products = issue["products"]
                team = issue["team"]
                link = f'<a href="https://linear.app/guinea/issue/{issue_id}" target="_blank" style="color: #0052ff; text-decoration: none;">Abrir →</a>'

                html += f"""
                                <tr>
                                    <td><strong>{issue_id}</strong></td>
                                    <td>{title}</td>
                                    <td>{state}</td>
                                    <td>{products}</td>
                                    <td>{team}</td>
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
                                    <th>Link</th>
                                </tr>
            """
            for issue in month_data["untracked_issues_list"]:
                issue_id = issue["id"]
                title = issue["title"]
                state = issue["state"]
                team = issue["team"]
                link = f'<a href="https://linear.app/guinea/issue/{issue_id}" target="_blank" style="color: #0052ff; text-decoration: none;">Abrir →</a>'

                html += f"""
                                <tr>
                                    <td><strong>{issue_id}</strong></td>
                                    <td>{title}</td>
                                    <td>{state}</td>
                                    <td>{team}</td>
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
    html += f"""
                <div id="projects" class="section">
                    <h1>📦 Proyectos - CE1 + CE2</h1>

                    <div class="note">
                        <strong>ℹ️ Nota:</strong> Proyectos de los equipos CE1 y CE2 con sus métricas de progreso.
                    </div>

                    <div class="metrics">
                        <div class="metric-card">
                            <div class="label">Total Proyectos</div>
                            <div class="value">{projects_metrics["total_projects"]}</div>
                        </div>
                        <div class="metric-card">
                            <div class="label">Pendientes CE2</div>
                            <div class="value">{projects_metrics["pending_ce2"]}</div>
                        </div>
                        <div class="metric-card">
                            <div class="label">En Progreso</div>
                            <div class="value">{projects_metrics["in_progress"]}</div>
                        </div>
                        <div class="metric-card">
                            <div class="label">Cerrados 2026</div>
                            <div class="value">{projects_metrics["closed_2026"]}</div>
                        </div>
                    </div>

                    <div class="section-box">
                        <h2>👥 Por Lead</h2>
                        <table>
                            <tr>
                                <th>Lead</th>
                                <th>Proyectos</th>
                            </tr>
    """

    for lead, count in sorted(projects_metrics["by_lead"].items(), key=lambda x: x[1], reverse=True):
        html += f"<tr><td>{lead}</td><td>{count}</td></tr>"

    html += """
                        </table>
                    </div>

                    <div class="section-box">
                        <h2>📈 Distribución de Progreso</h2>
                        <table>
                            <tr>
                                <th>Rango</th>
                                <th>Count</th>
                            </tr>
    """

    for range_label in ["0-25%", "25-50%", "50-75%", "75-100%"]:
        count = projects_metrics["progress_distribution"][range_label]
        html += f"<tr><td>{range_label}</td><td>{count}</td></tr>"

    html += f"""
                        </table>
                    </div>
                </div>

                <div class="timestamp">
                    Actualizado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} UTC
                </div>
            </div>
        </div>

        <script>
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

            function switchTab(monthName) {{
                // Hide all tabs
                const tabs = document.querySelectorAll('.tab-content');
                tabs.forEach(tab => tab.classList.remove('active'));

                // Remove active from buttons
                const buttons = document.querySelectorAll('.tab-button');
                buttons.forEach(btn => btn.classList.remove('active'));

                // Show selected tab
                const selectedTab = document.getElementById('tab-' + monthName);
                if (selectedTab) {{
                    selectedTab.classList.add('active');
                }}

                // Add active to clicked button
                event.target.classList.add('active');
            }}
        </script>
    </body>
    </html>
    """

    return html

if __name__ == "__main__":
    print("🔄 Generando dashboard unificado...\n")

    # Obtener proyectos
    projects = get_projects()
    if projects:
        projects_metrics = calculate_project_metrics(projects)
    else:
        projects_metrics = {
            "total_projects": 0,
            "by_state": {},
            "by_lead": {},
            "progress_distribution": {
                "0-25%": 0,
                "25-50%": 0,
                "50-75%": 0,
                "75-100%": 0
            }
        }

    # Obtener issues por mes
    all_months = [
        (1, "Enero"),
        (2, "Febrero"),
        (3, "Marzo"),
        (4, "Abril"),
        (5, "Mayo")
    ]

    all_months_metrics = []

    print("Obteniendo issues sin proyecto...\n")

    for month_num, month_name in all_months:
        issues = get_issues_for_month(2026, month_num, month_name)
        metrics = calculate_metrics(issues, month_name)
        all_months_metrics.append(metrics)

        pending_total = sum(metrics['pending_by_product'].values())
        print(f"📈 {month_name}: {metrics['total_issues']} issues (CE1: {metrics['by_team']['CE1']}, CE2: {metrics['by_team']['CE2']}) | Pendientes: {pending_total}")

    html = generate_html(projects_metrics, all_months_metrics)
    with open("index.html", "w") as f:
        f.write(html)
    print("\n✅ Dashboard unificado generado: index.html")
