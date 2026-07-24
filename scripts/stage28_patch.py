import json
from pathlib import Path

path = Path("public/content/modules/databases-advanced.json")
data = json.loads(path.read_text(encoding="utf-8"))
lesson = next(item for item in data["lessons"] if item["id"] == "advanced.db.order-database-project")
checks = lesson["validation"]["checks"]
if not any(check.get("kind") == "node_count" and check.get("nodeName") == "For" for check in checks):
    checks.insert(-1, {
        "id": "order-loop",
        "kind": "node_count",
        "nodeName": "For",
        "min": 2,
        "file": "service.py",
        "label": "Sipariş ve satır döngüleri",
        "visibility": "visible",
    })
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
