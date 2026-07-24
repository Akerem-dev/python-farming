import base64
import gzip
import json
from pathlib import Path

PAYLOADS = {
    "scripts/stage26/module.b64": "public/content/modules/generators-coroutines.json",
    "scripts/stage26/validator.b64": "src/features/learning/services/advancedPatternTaskValidationService.ts",
    "scripts/stage26/content_test.b64": "src/test/content/generatorsCoroutinesContent.test.ts",
    "scripts/stage26/integration_test.b64": "src/test/integration/generatorValidator.integration.test.ts",
}

for payload_path, target_path in PAYLOADS.items():
    encoded = Path(payload_path).read_text(encoding="utf-8").strip()
    target = Path(target_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(gzip.decompress(base64.b64decode(encoded)))

index_path = Path("public/content/module-packages.json")
index = json.loads(index_path.read_text(encoding="utf-8"))
package_path = "/content/modules/generators-coroutines.json"
if package_path not in index["files"]:
    index["files"].append(package_path)
index_path.write_text(
    json.dumps(index, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
