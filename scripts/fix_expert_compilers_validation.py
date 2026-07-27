from __future__ import annotations

import json
from pathlib import Path

MODULE_PATH = Path("public/content/modules/compilers-metaprogramming.json")
module = json.loads(MODULE_PATH.read_text(encoding="utf-8"))
lessons = {lesson["id"]: lesson for lesson in module["lessons"]}


def replace_check(lesson_id, predicate, replacement):
    checks = lessons[lesson_id]["validation"]["checks"]
    updated = []
    replaced = 0
    for check in checks:
        if predicate(check):
            values = replacement(check) if callable(replacement) else replacement
            updated.extend(values)
            replaced += 1
        else:
            updated.append(check)
    if replaced == 0:
        raise RuntimeError(f"{lesson_id} için beklenen kontrol bulunamadı")
    lessons[lesson_id]["validation"]["checks"] = updated


replace_check(
    "expert.compilers.node-visitor",
    lambda check: check.get("kind") == "class_definition" and check.get("name") == "KodAnalizi",
    [{
        "id": "visitor-class",
        "kind": "file_content_regex",
        "path": "main.py",
        "pattern": r"class\s+KodAnalizi\s*\(\s*ast\.NodeVisitor\s*\)",
        "label": "KodAnalizi NodeVisitor tabanında tanımlandı",
        "visibility": "visible",
    }],
)

replace_check(
    "expert.compilers.node-transformer",
    lambda check: check.get("kind") == "class_definition" and check.get("name") == "PrintDonusturucu",
    [{
        "id": "transformer-class",
        "kind": "file_content_regex",
        "path": "main.py",
        "pattern": r"class\s+PrintDonusturucu\s*\(\s*ast\.NodeTransformer\s*\)",
        "label": "PrintDonusturucu NodeTransformer tabanında tanımlandı",
        "visibility": "visible",
    }],
)

replace_check(
    "expert.compilers.decorator-registry",
    lambda check: check.get("kind") == "raise_exception" and check.get("name") == "ValueError",
    [{
        "id": "duplicate-raise",
        "kind": "file_content_regex",
        "path": "main.py",
        "pattern": r"raise\s+ValueError\s*\(",
        "label": "Tekrarlanan kayıt ValueError ile reddediliyor",
        "visibility": "visible",
    }],
)

checks = lessons["expert.compilers.descriptor-metaclass"]["validation"]["checks"]
updated = []
replaced_descriptor = False
replaced_metaclass = False
replaced_raises = 0
for check in checks:
    if check.get("kind") == "class_definition" and check.get("name") == "Surum":
        updated.extend([
            {
                "id": "descriptor-class",
                "kind": "file_content_regex",
                "path": "main.py",
                "pattern": r"class\s+Surum\s*:",
                "label": "Surum descriptor sınıfı tanımlandı",
                "visibility": "visible",
            },
            {
                "id": "descriptor-methods",
                "kind": "file_content_regex",
                "path": "main.py",
                "pattern": r"def\s+__set_name__[\s\S]*def\s+__get__[\s\S]*def\s+__set__",
                "flags": "s",
                "label": "Descriptor protokol metotları tanımlandı",
                "visibility": "visible",
            },
        ])
        replaced_descriptor = True
    elif check.get("kind") == "class_definition" and check.get("name") == "EklentiMeta":
        updated.append({
            "id": "metaclass-def",
            "kind": "file_content_regex",
            "path": "main.py",
            "pattern": r"class\s+EklentiMeta\s*\(\s*type\s*\)",
            "label": "EklentiMeta type tabanında tanımlandı",
            "visibility": "visible",
        })
        replaced_metaclass = True
    elif check.get("kind") == "raise_exception":
        exception_name = check["name"]
        updated.append({
            "id": check["id"],
            "kind": "file_content_regex",
            "path": "main.py",
            "pattern": rf"raise\s+{exception_name}\s*\(",
            "label": check["label"],
            "visibility": check["visibility"],
        })
        replaced_raises += 1
    else:
        updated.append(check)
if not replaced_descriptor or not replaced_metaclass or replaced_raises < 2:
    raise RuntimeError("Descriptor/metaclass validator kontrolleri beklenen biçimde bulunamadı")
lessons["expert.compilers.descriptor-metaclass"]["validation"]["checks"] = updated

checks = lessons["expert.compilers.final"]["validation"]["checks"]
updated = []
replaced_dataclass = False
replaced_visitor = False
for check in checks:
    if check.get("kind") == "dataclass_definition" and check.get("name") == "Bulgu":
        updated.extend([
            {
                "id": "bulgu-frozen-dataclass",
                "kind": "file_content_regex",
                "path": "statik_analiz/models.py",
                "pattern": r"@dataclass\s*\(\s*frozen\s*=\s*True\s*,\s*order\s*=\s*True\s*\)",
                "label": "Bulgu frozen ve sıralanabilir dataclass olarak tanımlandı",
                "visibility": "visible",
            },
            {
                "id": "bulgu-fields",
                "kind": "file_content_regex",
                "path": "statik_analiz/models.py",
                "pattern": r"class\s+Bulgu\s*:[\s\S]*satir\s*:\s*int[\s\S]*tur\s*:\s*str[\s\S]*ad\s*:\s*str",
                "flags": "s",
                "label": "Bulgu alanları tip açıklamalarıyla tanımlandı",
                "visibility": "visible",
            },
        ])
        replaced_dataclass = True
    elif check.get("kind") == "class_definition" and check.get("name") == "DenetimZiyaretcisi":
        updated.append({
            "id": "visitor-class",
            "kind": "file_content_regex",
            "path": "statik_analiz/visitor.py",
            "pattern": r"class\s+DenetimZiyaretcisi\s*\(\s*ast\.NodeVisitor\s*\)",
            "label": "DenetimZiyaretcisi NodeVisitor tabanında tanımlandı",
            "visibility": "visible",
        })
        replaced_visitor = True
    else:
        updated.append(check)
if not replaced_dataclass or not replaced_visitor:
    raise RuntimeError("Final proje özel validator kontrolleri beklenen biçimde bulunamadı")
lessons["expert.compilers.final"]["validation"]["checks"] = updated

specialized = {
    "dataclass_definition",
    "protocol_definition",
    "class_definition",
    "class_cases",
    "raise_exception",
    "function_raises",
    "exception_handling",
    "exception_class",
    "stdlib_function_cases",
    "enum_definition",
    "decorator_usage",
}
remaining = [
    (lesson["id"], check["kind"])
    for lesson in module["lessons"]
    for check in lesson["validation"]["checks"]
    if check["kind"] in specialized
]
if remaining:
    raise RuntimeError(f"Yanlış validator seçimine yol açan kontroller kaldı: {remaining}")

MODULE_PATH.write_text(json.dumps(module, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
Path("scripts/fix_expert_compilers_validation.py").unlink(missing_ok=True)
Path(".github/workflows/fix-expert-compilers-validation.yml").unlink(missing_ok=True)
