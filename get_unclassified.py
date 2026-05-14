#!/usr/bin/env python3
import json
import subprocess
import os
from datetime import datetime, timezone

API_KEY = os.environ.get("LINEAR_API_KEY")
if not API_KEY:
    print("❌ Error: LINEAR_API_KEY no está configurada")
    exit(1)

LINEAR_API = "https://api.linear.app/graphql"

def query_linear(query_str):
    """Ejecuta una query GraphQL en Linear"""
    try:
        cmd = [
            "curl", "-s", "-X", "POST", LINEAR_API,
            "-H", "Content-Type: application/json",
            "-H", f"Authorization: {API_KEY}",
            "-d", json.dumps({"query": query_str})
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return json.loads(result.stdout)
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def get_ce2_projects():
    """Obtiene TODOS los proyectos de CE2"""
    query = """
    {
      projects(first: 150) {
        nodes {
          id
          name
          state
          createdAt
          labels(first: 10) {
            nodes { name }
          }
          teams(first: 5) {
            nodes { key }
          }
        }
      }
    }
    """
    result = query_linear(query)
    if not result or "errors" in result:
        print("❌ Error obteniendo proyectos")
        return []

    all_projects = result["data"]["projects"]["nodes"]
    ce2_projects = [p for p in all_projects if any(t.get("key") == "CE2" for t in p.get("teams", {}).get("nodes", []))]
    return ce2_projects

# Marcas válidas (excluye "Sin clasificar")
BRANDS = ["Cuy", "PeruSim", "Habla+", "Wings", "Fimo", "Guinea", "B2B", "Partner", "Legales", "Finanzas", "Airalo"]

def is_classified(project_name, labels):
    """Verifica si el proyecto tiene alguna marca en nombre o labels"""
    # Buscar en el nombre
    for brand in BRANDS:
        if brand.lower() in project_name.lower():
            return True

    # Buscar en los labels
    label_names = [label.get("name", "").lower() for label in labels]
    for brand in BRANDS:
        if any(brand.lower() in label for label in label_names):
            return True

    return False

def is_valid_project(state):
    """Verifica si es un proyecto válido"""
    return state not in ["canceled", "discarded"]

# Obtener proyectos
projects = get_ce2_projects()
print(f"Total CE2 proyectos: {len(projects)}\n")

# Agrupar por mes y encontrar sin clasificar
months_data = {}

for project in projects:
    created_at_str = project.get("createdAt", "")
    name = project.get("name", "")
    state = project.get("state", "")
    project_id = project.get("id", "")
    labels = project.get("labels", {}).get("nodes", [])

    if not created_at_str or not is_valid_project(state):
        continue

    try:
        created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
        month_key = f"{created_at.year}-{created_at.month:02d}"  # YYYY-MM
        month_name = created_at.strftime("%B").capitalize()

        if month_key not in months_data:
            months_data[month_key] = {"name": month_name, "unclassified": []}

        if not is_classified(name, labels):
            months_data[month_key]["unclassified"].append({
                "name": name,
                "id": project_id,
                "state": state,
                "labels": [l.get("name") for l in labels]
            })
    except:
        pass

# Mostrar resultados
for month_key in sorted(months_data.keys()):
    data = months_data[month_key]
    unclassified = data["unclassified"]
    print(f"📅 {data['name']}:")
    print(f"   Sin clasificar: {len(unclassified)}")
    for proj in unclassified:
        print(f"   - {proj['name']} (ID: {proj['id']})")
        # Link format: https://linear.app/guinea/project/{project_id}
        print(f"     Link: https://linear.app/guinea/project/{proj['id']}")
    print()
