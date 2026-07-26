import { readFile, writeFile } from "node:fs/promises";

async function replace(path, before, after) {
  const source = await readFile(path, "utf8");
  if (!source.includes(before)) throw new Error(`${path}: marker not found`);
  await writeFile(path, source.replace(before, after));
}

await replace(
  "README.md",
  "39 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı",
  "40 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı",
);
await replace(
  "README.md",
  "- Windows, Linux ve macOS için taslak release üretim akışı",
  "- Windows, Linux ve macOS için imzalı uygulama içi güncelleme ve production release kapıları",
);
await replace(
  "README.md",
  "Workflow önce bütün kalite kontrollerini çalıştırır, ardından GitHub üzerinde **taslak ve ön sürüm** release oluşturur. macOS paketleri sertifika bulunmadığında ad-hoc imzalanır. Windows kod imzası ve macOS notarizasyonu henüz yapılandırılmadığı için taslak release incelenmeden yayımlanmamalıdır.",
  "Manuel workflow çalıştırmaları yalnız **taslak preview** release üretir. Production yayınları tam sürüm etiketiyle çalışır; updater private key, Windows code-signing sertifikası ve Apple Developer ID/notarizasyon sırlarından biri eksikse workflow daha build başlamadan durur. Uygulama içindeki güncelleme denetimi yalnız kullanıcı isteğiyle başlar; kurulumdan önce yerel ilerleme yedeği alınır ve Tauri artifact imzası doğrulanır.",
);
await replace(
  "README.md",
  "Kod imzalama, notarizasyon ve platform paket güvenliği sonraki sağlamlaştırma aşamalarında tamamlanacaktır.",
  "Platform release hattı updater artifact imzasını zorunlu tutar; production etiketi Windows Authenticode ve macOS notarizasyon sırları olmadan yayımlanamaz.",
);

for (const path of [
  "src/test/content/portablePythonRuntime.test.ts",
  "src/test/content/runtimeIsolation.test.ts",
]) {
  const source = await readFile(path, "utf8");
  await writeFile(
    path,
    source.replace(
      "39 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı",
      "40 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı",
    ),
  );
}

const checklistPath = "docs/RELEASE_CHECKLIST.md";
let checklist = await readFile(checklistPath, "utf8");
if (!checklist.includes("### Güvenli çalışma motoru denemeleri")) {
  checklist = checklist.replace(
    "- Uygulamayı kapatıp yeniden açınca ilerlemenin korunması\n\n## 7. Uygulama içi güncelleme testi",
    `- Uygulamayı kapatıp yeniden açınca ilerlemenin korunması\n\n### Güvenli çalışma motoru denemeleri\n\nTek ve çok dosyalı görevlerde ayrı ayrı şu kaçış denemeleri yapılmalıdır:\n\n- çalışma alanındaki normal dosya okuma/yazma başarılı olur,\n- çalışma alanı dışındaki dosya okuma ve yazma \`PermissionError\` üretir,\n- dış klasör listeleme reddedilir,\n- \`socket.socket()\` ve bağlantı denemesi reddedilir,\n- \`subprocess.Popen\`, \`os.system\` ve spawn/fork reddedilir,\n- \`ctypes.CDLL\` ve sembolik bağlantı oluşturma reddedilir,\n- sonsuz döngü timeout olur ve çocuk süreç bırakmaz,\n- 16 MB veya 512 dosya kotası aşımı \`WORKSPACE_LIMIT_EXCEEDED\` üretir.\n\n## 7. Uygulama içi güncelleme testi`,
  );
}
await writeFile(checklistPath, checklist);
