from pathlib import Path

validator = Path("src/features/learning/services/advancedCapstoneTaskValidationService.ts")
validator_text = validator.read_text(encoding="utf-8")
old_regex = '    if not re.search(r"__version__\\s*=\\s*[\'\"]1\\.0\\.0[\'\"]", init_source):'
new_regex = '    if not re.search(r"""__version__\\s*=\\s*[\'\"]1\\.0\\.0[\'\"]""", init_source):'
if old_regex not in validator_text:
    raise SystemExit("version regex pattern not found")
validator.write_text(validator_text.replace(old_regex, new_regex, 1), encoding="utf-8")

integration = Path("src/test/integration/advancedCapstoneValidator.integration.test.ts")
test_text = integration.read_text(encoding="utf-8")
marker = "\n});\n"
index = test_text.rfind(marker)
if index < 0:
    raise SystemExit("integration suite end marker not found")
extra = r'''

  it("accepts a qualified frozen dataclass decorator", () => {
    const qualifiedFiles = {
      ...referenceFiles,
      "farming_platform/models.py": referenceFiles["farming_platform/models.py"]
        .replace("from dataclasses import dataclass", "import dataclasses")
        .replace("@dataclass(frozen=True)", "@dataclasses.dataclass(frozen=True)"),
    };
    expect(runValidator(qualifiedFiles, finalSpec()).passed).toBe(true);
  });

  it("rejects a non-Decimal Event value annotation", () => {
    const weakFiles = {
      ...referenceFiles,
      "farming_platform/models.py": referenceFiles["farming_platform/models.py"].replace(
        "    value: Decimal",
        "    value: str",
      ),
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects an empty repository protocol", () => {
    const weakFiles = {
      ...referenceFiles,
      "farming_platform/ports.py": `from typing import Protocol, runtime_checkable

@runtime_checkable
class EventRepository(Protocol):
    pass
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects a serial collector that ignores the requested overlap", () => {
    const weakFiles = {
      ...referenceFiles,
      "farming_platform/collector.py": referenceFiles["farming_platform/collector.py"].replace(
        "asyncio.Semaphore(limit)",
        "asyncio.Semaphore(1)",
      ),
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects an imported alias of blocking sleep", () => {
    const weakFiles = {
      ...referenceFiles,
      "farming_platform/collector.py": `import asyncio
from time import sleep as block

async def collect_remote(transport, limit=2):
    semaphore = asyncio.Semaphore(limit)

    async def load(page_index):
        async with semaphore:
            block(0)
            return await transport.fetch(page_index)

    tasks = [asyncio.create_task(load(index)) for index in range(transport.page_count)]
    pages = await asyncio.gather(*tasks)
    return [item for page in pages for item in page]
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects profiling calls hidden in unreachable code", () => {
    const weakFiles = {
      ...referenceFiles,
      "farming_platform/profiling.py": `import cProfile
import tracemalloc
from timeit import repeat


def profile_call(function, *args):
    if False:
        cProfile.Profile()
        tracemalloc.start()
        repeat(lambda: None, number=1, repeat=2)
    return {"result": function(*args), "profiled": True, "memory_measured": True, "samples": 2}
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects an application layer that bypasses service injection", () => {
    const weakFiles = {
      ...referenceFiles,
      "farming_platform/app.py": `from collections import Counter
from decimal import Decimal

from . import __version__
from .profiling import profile_call
from .repository import SQLiteEventRepository
from .service import PlatformService
from .transport import FakeTransport


def platform_raporu(local_events, remote_pages):
    events = [*local_events, *(item for page in remote_pages for item in page)]
    counts = Counter(str(item["category"]) for item in events)
    total = sum((Decimal(str(item["value"])) for item in events), Decimal("0.00"))
    return {
        "event_count": len(events),
        "total": f"{total:.2f}",
        "sources": sorted({str(item["source"]) for item in events}),
        "top_category": sorted(counts, key=lambda category: (-counts[category], category))[0] if counts else None,
        "version": __version__,
        "profiled": True,
    }
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("does not count assertions hidden under if False", () => {
    const weakFiles = {
      ...referenceFiles,
      "tests/test_platform.py": `def test_1():
    if False:
        assert True
        assert True

def test_2():
    if False:
        assert True
        assert True

def test_3():
    if False:
        assert True

def test_4():
    if False:
        assert True

def test_5():
    if False:
        assert True

def test_6():
    if False:
        assert True
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });
'''
integration.write_text(test_text[:index] + extra + test_text[index:], encoding="utf-8")
