#!/usr/bin/env python3
"""
Linear Dashboard Generator
Conecta a Linear API y genera métricas para CE1 y CE2
Lee API_KEY desde variable de entorno
"""

import json
import subprocess
import os
from datetime import datetime, timedelta

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
        print(f"❌ Error conectando a Linear: {e}")
        return None

def get_issues_for_month(year, month, month_name):
    """Obtiene issues para un mes específico de CE1 + CE2"""
    start_date = datetime(year, month, 1)
    if month == 12:
        end_date = datetime(year + 1, 1, 1)
    else:
        end_date = datetime(year, month + 1, 1)

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
    print(f"✅ {len(issues)} issues obtenidos para {month_name}\n")
    return issues

def calculate_metrics(issues, month_name):
    """Calcula métricas para un conjunto de issues"""
    metrics = {
        "month": month_name,
        "total_issues": len(issues),
        "active_issues": 0,
        "backlog": 0,
        "blocked": 0,
        "closed": 0,
        "by_state": {},
        "by_product": {},
        "by_team": {"CE1": 0, "CE2": 0},
        "pending_by_product": {},
        "by_state_by_team": {}
    }

    for issue in issues:
        state = issue["state"]["name"]
        team = issue.get("team", {}).get("key", "Unknown")
        labels = [l["name"] for l in issue["labels"]["nodes"]]

        metrics["by_state"][state] = metrics["by_state"].get(state, 0) + 1

        if team in metrics["by_team"]:
            metrics["by_team"][team] += 1

        key = f"{team}_{state}"
        metrics["by_state_by_team"][key] = metrics["by_state_by_team"].get(key, 0) + 1

        if state in ["In Progress", "In Review"]:
            metrics["active_issues"] += 1

        if state in ["Backlog", "Planning"]:
            metrics["backlog"] += 1

        if state == "Blocked":
            metrics["blocked"] += 1

        if state == "Closed":
            metrics["closed"] += 1

        product_labels = [l for l in labels if l in ["Cuy", "Guinea", "Habla+", "Wings", "PeruSim+", "Fimo", "Airalo", "B2B"]]
        if product_labels:
            for product in product_labels:
                metrics["by_product"][product] = metrics["by_product"].get(product, 0) + 1
                if state not in ["Closed", "Discarded"]:
                    metrics["pending_by_product"][product] = metrics["pending_by_product"].get(product, 0) + 1

    return metrics

def generate_multimonth_html(all_months_metrics):
    """Genera HTML con tabs para múltiples meses"""

    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Linear Dashboard Multimonth (CE1+CE2)</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: #f5f5f5;
                padding: 20px;
                margin: 0;
            }
            .container {
                max-width: 1200px;
                margin: 0 auto;
            }
            h1 {
                color: #333;
                text-align: center;
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
            .section {
                background: white;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 20px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .section h2 {
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
            .team-ce1 {
                background: #fff5f5;
            }
            .team-ce2 {
                background: #f0fffe;
            }
            .timestamp {
                text-align: center;
                color: #999;
                font-size: 12px;
                margin-top: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>📊 Linear Dashboard Multimonth (CE1 + CE2)</h1>

            <div class="note">
                <strong>ℹ️ Nota:</strong> Dashboard que filtra por AMBOS teams (CE1 y CE2).
                Haz clic en las pestañas para ver cada mes. Cada mes muestra desglose por team.
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
                <div class="metrics">
                    <div class="metric-card">
                        <div class="label">Total Issues</div>
                        <div class="value">{month_data["total_issues"]}</div>
                    </div>
                    <div class="metric-card ce1">
                        <div class="label">CE1 Issues</div>
                        <div class="value">{month_data["by_team"]["CE1"]}</div>
                    </div>
                    <div class="metric-card ce2">
                        <div class="label">CE2 Issues</div>
                        <div class="value">{month_data["by_team"]["CE2"]}</div>
                    </div>
                    <div class="metric-card">
                        <div class="label">🔥 Activos</div>
                        <div class="value">{month_data["active_issues"]}</div>
                    </div>
                    <div class="metric-card">
                        <div class="label">📚 Backlog</div>
                        <div class="value">{month_data["backlog"]}</div>
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

                <div class="section">
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

                <div class="section">
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
            </div>
        """

    html += f"""
            <div class="timestamp">
                Actualizado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} UTC
            </div>
        </div>

        <script>
            function switchTab(monthName) {{
                const tabs = document.querySelectorAll('.tab-content');
                tabs.forEach(tab => tab.classList.remove('active'));

                const buttons = document.querySelectorAll('.tab-button');
                buttons.forEach(btn => btn.classList.remove('active'));

                const selectedTab = document.getElementById('tab-' + monthName);
                if (selectedTab) {{
                    selectedTab.classList.add('active');
                }}

                event.target.classList.add('active');
            }}
        </script>
    </body>
    </html>
    """

    return html

if __name__ == "__main__":
    all_months = [
        (1, "Enero"),
        (2, "Febrero"),
        (3, "Marzo"),
        (4, "Abril"),
        (5, "Mayo")
    ]

    all_months_metrics = []

    print("🔄 Generando dashboards para CE1 + CE2 (ambos teams)...\n")

    for month_num, month_name in all_months:
        issues = get_issues_for_month(2026, month_num, month_name)
        metrics = calculate_metrics(issues, month_name)
        all_months_metrics.append(metrics)

        pending_total = sum(metrics['pending_by_product'].values())
        print(f"📈 {month_name}: {metrics['total_issues']} issues (CE1: {metrics['by_team']['CE1']}, CE2: {metrics['by_team']['CE2']}) | Pendientes: {pending_total}")

    html_multi = generate_multimonth_html(all_months_metrics)
    with open("index.html", "w") as f:
        f.write(html_multi)
    print("\n✅ Dashboard generado: index.html")
