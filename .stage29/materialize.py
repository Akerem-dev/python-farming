from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRAGMENTS = ROOT / ".stage29"
OUTPUT = ROOT / "public/content/modules/architecture-patterns.json"
INDEX = ROOT / "public/content/module-packages.json"
WORKFLOW = ROOT / ".github/workflows/stage29-materialize.yml"
PACKAGE_PATH = "/content/modules/architecture-patterns.json"

lessons = []
for order in range(1, 8):
    path = FRAGMENTS / f"lesson{order}.json"
    lesson = json.loads(path.read_text(encoding="utf-8"))
    if lesson.get("moduleId") != "architecture-patterns" or lesson.get("order") != order:
        raise SystemExit(f"Geçersiz ders parçası: {path}")
    lessons.append(lesson)

package = {"moduleId": "architecture-patterns", "lessons": lessons}
OUTPUT.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

index = json.loads(INDEX.read_text(encoding="utf-8"))
files = index["files"]
if PACKAGE_PATH not in files:
    after = "/content/modules/databases-advanced.json"
    position = files.index(after) + 1 if after in files else len(files)
    files.insert(position, PACKAGE_PATH)
INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

shutil.rmtree(FRAGMENTS)
WORKFLOW.unlink(missing_ok=True)
