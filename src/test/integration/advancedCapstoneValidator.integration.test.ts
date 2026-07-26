import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";
import type { TaskValidationResult, TaskValidationSpec } from "../../features/learning/taskValidationTypes";

const workspaces: string[] = [];
const validatorFilename = "__python_farming_advanced_capstone_validator__.py";

function validatorSource() {
  const source = readFileSync(
    resolve(process.cwd(), "src/features/learning/services/advancedCapstoneTaskValidationService.ts"),
    "utf-8",
  );
  const match = source.match(/const VALIDATOR_SOURCE = String\.raw`([\s\S]*?)`;\n\nfunction createRequestId/);
  if (!match?.[1]) throw new Error("Advanced capstone validator source could not be extracted.");
  return match[1].replace(
    "${JSON.stringify(VALIDATOR_PATH)}",
    JSON.stringify(validatorFilename),
  );
}

function finalSpec() {
  const modulePackage = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/content/modules/advanced-project.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
  const lesson = modulePackage.lessons.find(
    (candidate) => candidate.id === "advanced.project.final-platform",
  );
  if (!lesson) throw new Error("Advanced capstone lesson not found.");
  return lesson.validation;
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-advanced-capstone-"));
  workspaces.push(workspace);
  writeFileSync(join(workspace, validatorFilename), validatorSource(), "utf-8");
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(workspace, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }
  const execution = spawnSync("python3", [validatorFilename], {
    cwd: workspace,
    input: JSON.stringify({
      files: [validatorFilename, ...Object.keys(files)],
      entrypoint: "main.py",
      stdin: [],
      spec,
    }),
    encoding: "utf-8",
    timeout: 25_000,
  });
  if (execution.status !== 0) {
    throw new Error(execution.stderr || execution.error?.message || "Advanced validator failed.");
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

const referenceFiles = {
  "main.py": `from farming_platform import platform_raporu

if __name__ == "__main__":
    local = [
        {"event_id": "L1", "source": "local", "category": "sales", "value": "10.00"},
        {"event_id": "L2", "source": "local", "category": "ops", "value": "5.00"},
    ]
    remote = [
        [{"event_id": "R1", "source": "api", "category": "sales", "value": "7.50"}],
        [{"event_id": "R2", "source": "api", "category": "sales", "value": "2.50"}],
    ]
    print(platform_raporu(local, remote))
`,
  "farming_platform/__init__.py": `__version__ = "1.0.0"

from .app import platform_raporu

__all__ = ["platform_raporu", "__version__"]
`,
  "farming_platform/models.py": `from dataclasses import dataclass
from decimal import Decimal

@dataclass(frozen=True)
class Event:
    event_id: str
    source: str
    category: str
    value: Decimal

    @classmethod
    def from_dict(cls, data):
        return cls(
            event_id=str(data["event_id"]),
            source=str(data["source"]),
            category=str(data["category"]),
            value=Decimal(str(data["value"])),
        )
`,
  "farming_platform/ports.py": `from typing import Protocol, runtime_checkable

from .models import Event

@runtime_checkable
class EventRepository(Protocol):
    def save_all(self, events: list[Event]) -> None:
        ...

    def list_all(self) -> list[Event]:
        ...
`,
  "farming_platform/repository.py": `import sqlite3
from decimal import Decimal

from .models import Event

class SQLiteEventRepository:
    def __init__(self, path=":memory:"):
        self.connection = sqlite3.connect(path)
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                event_id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                category TEXT NOT NULL,
                value TEXT NOT NULL
            )
            """
        )
        self.connection.commit()

    def save_all(self, events):
        rows = [(event.event_id, event.source, event.category, str(event.value)) for event in events]
        with self.connection:
            self.connection.executemany(
                "INSERT INTO events (event_id, source, category, value) VALUES (?, ?, ?, ?)",
                rows,
            )

    def list_all(self):
        rows = self.connection.execute(
            "SELECT event_id, source, category, value FROM events ORDER BY event_id"
        ).fetchall()
        return [Event(event_id, source, category, Decimal(value)) for event_id, source, category, value in rows]

    def close(self):
        self.connection.close()
`,
  "farming_platform/transport.py": `import asyncio

class FakeTransport:
    def __init__(self, pages):
        self.pages = [list(page) for page in pages]
        self.active = 0
        self.max_active = 0

    @property
    def page_count(self):
        return len(self.pages)

    async def fetch(self, page_index):
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            await asyncio.sleep(0)
            return list(self.pages[page_index])
        finally:
            self.active -= 1
`,
  "farming_platform/collector.py": `import asyncio

async def collect_remote(transport, limit=2):
    semaphore = asyncio.Semaphore(limit)

    async def load(page_index):
        async with semaphore:
            return await transport.fetch(page_index)

    tasks = [asyncio.create_task(load(index)) for index in range(transport.page_count)]
    pages = await asyncio.gather(*tasks)
    return [item for page in pages for item in page]
`,
  "farming_platform/service.py": `from collections import Counter
from decimal import Decimal

from .collector import collect_remote
from .models import Event

class PlatformService:
    def __init__(self, repository, transport):
        self.repository = repository
        self.transport = transport

    async def synchronize(self, local_events):
        remote_events = await collect_remote(self.transport, 2)
        events = [Event.from_dict(data) for data in [*local_events, *remote_events]]
        if events:
            self.repository.save_all(events)
        return events

    def report(self):
        events = self.repository.list_all()
        total = sum((event.value for event in events), Decimal("0.00")).quantize(Decimal("0.01"))
        counts = Counter(event.category for event in events)
        top_category = sorted(counts, key=lambda category: (-counts[category], category))[0] if counts else None
        return {
            "event_count": len(events),
            "total": f"{total:.2f}",
            "sources": sorted({event.source for event in events}),
            "top_category": top_category,
        }
`,
  "farming_platform/profiling.py": `import cProfile
import io
import pstats
import tracemalloc
from timeit import repeat


def profile_call(function, *args):
    profiler = cProfile.Profile()
    tracemalloc.start()
    before = tracemalloc.take_snapshot()
    profiler.enable()
    result = function(*args)
    profiler.disable()
    after = tracemalloc.take_snapshot()
    memory = sum(stat.size_diff for stat in after.compare_to(before, "lineno"))
    tracemalloc.stop()

    stream = io.StringIO()
    pstats.Stats(profiler, stream=stream).sort_stats("cumulative").print_stats()
    samples = repeat(lambda: function(*args), number=1, repeat=2)
    return {
        "result": result,
        "profiled": function.__name__ in stream.getvalue(),
        "memory_measured": isinstance(memory, int),
        "samples": len(samples),
    }
`,
  "farming_platform/app.py": `import asyncio

from . import __version__
from .profiling import profile_call
from .repository import SQLiteEventRepository
from .service import PlatformService
from .transport import FakeTransport


def platform_raporu(local_events, remote_pages):
    repository = SQLiteEventRepository(":memory:")
    transport = FakeTransport(remote_pages)
    service = PlatformService(repository, transport)
    try:
        asyncio.run(service.synchronize(local_events))
        profile = profile_call(service.report)
        report = dict(profile["result"])
        report["version"] = __version__
        report["profiled"] = bool(profile["profiled"] and profile["memory_measured"] and profile["samples"] == 2)
        return report
    finally:
        repository.close()
`,
  "tests/test_platform.py": `import sqlite3
from decimal import Decimal

from farming_platform.app import platform_raporu
from farming_platform.models import Event
from farming_platform.repository import SQLiteEventRepository


def test_event_modeli():
    event = Event("A", "local", "sales", Decimal("1.25"))
    assert event.event_id == "A"
    assert event.value == Decimal("1.25")


def test_repository_roundtrip():
    repository = SQLiteEventRepository(":memory:")
    event = Event("A", "local", "sales", Decimal("1.25"))
    repository.save_all([event])
    assert repository.list_all() == [event]
    repository.close()


def test_repository_rollback():
    repository = SQLiteEventRepository(":memory:")
    first = Event("A", "local", "sales", Decimal("1.25"))
    repository.save_all([first])
    try:
        repository.save_all([Event("B", "local", "ops", Decimal("2.00")), first])
        assert False, "duplicate event_id hata üretmeliydi"
    except sqlite3.IntegrityError:
        pass
    assert repository.list_all() == [first]
    repository.close()


def test_bos_rapor():
    report = platform_raporu([], [])
    assert report["event_count"] == 0
    assert report["total"] == "0.00"


def test_dolu_rapor():
    report = platform_raporu(
        [{"event_id": "L1", "source": "local", "category": "sales", "value": "10.00"}],
        [[{"event_id": "R1", "source": "api", "category": "sales", "value": "2.50"}]],
    )
    assert report["event_count"] == 2
    assert report["total"] == "12.50"


def test_kategori_esitliginde_alfabetik_secim():
    report = platform_raporu(
        [{"event_id": "L1", "source": "local", "category": "zeta", "value": "1.00"}],
        [[{"event_id": "R1", "source": "api", "category": "alpha", "value": "1.00"}]],
    )
    assert report["top_category"] == "alpha"
`,
};

describe("advanced capstone validator integration", () => {
  it("passes the complete local data platform", () => {
    const result = runValidator(referenceFiles, finalSpec());
    if (!result.passed) throw new Error(JSON.stringify(result, null, 2));
    expect(result.score).toBe(100);
  });

  it("rejects a hard-coded visible report", () => {
    const weakFiles = {
      ...referenceFiles,
      "farming_platform/app.py": `def platform_raporu(local_events, remote_pages):
    return {"event_count": 4, "total": "25.00", "sources": ["api", "local"], "top_category": "sales", "version": "1.0.0", "profiled": True}
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects a repository without a transaction boundary", () => {
    const weakFiles = {
      ...referenceFiles,
      "farming_platform/repository.py": referenceFiles["farming_platform/repository.py"].replace(
        "        with self.connection:\n            self.connection.executemany(",
        "        self.connection.executemany(",
      ),
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects blocking sleep inside the async collector", () => {
    const weakFiles = {
      ...referenceFiles,
      "farming_platform/collector.py": `import asyncio
import time

async def collect_remote(transport, limit=2):
    semaphore = asyncio.Semaphore(limit)
    time.sleep(0)
    tasks = [asyncio.create_task(transport.fetch(index)) for index in range(transport.page_count)]
    pages = await asyncio.gather(*tasks)
    return [item for page in pages for item in page]
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

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

});
