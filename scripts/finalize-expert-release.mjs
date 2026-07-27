import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const VERSION = "1.1.0";
const read = (path) => readFileSync(resolve(path), "utf8");
const write = (path, content) => writeFileSync(resolve(path), content.endsWith("\n") ? content : `${content}\n`, "utf8");

function replaceRequired(path, search, replacement) {
  const current = read(path);
  if (!current.includes(search)) {
    throw new Error(`${path} içinde beklenen metin bulunamadı: ${search}`);
  }
  write(path, current.replace(search, replacement));
}

function updateJson(path, update) {
  const value = JSON.parse(read(path));
  update(value);
  write(path, JSON.stringify(value, null, 2));
}

updateJson("package.json", (value) => {
  value.version = VERSION;
});

updateJson("package-lock.json", (value) => {
  value.version = VERSION;
  value.packages[""].version = VERSION;
});

updateJson("src-tauri/tauri.conf.json", (value) => {
  value.version = VERSION;
});

replaceRequired(
  "src-tauri/Cargo.toml",
  'name = "python-farming"\nversion = "1.0.0"',
  `name = "python-farming"\nversion = "${VERSION}"`,
);
replaceRequired(
  "src-tauri/Cargo.lock",
  'name = "python-farming"\nversion = "1.0.0"',
  `name = "python-farming"\nversion = "${VERSION}"`,
);
replaceRequired("src/app/appConfig.ts", 'version: "1.0.0"', `version: "${VERSION}"`);

let readme = read("README.md");
readme = readme
  .replace(
    "Python Farming, Python'ı başlangıçtan ileri seviyeye kadar uygulamalı görevler, hata ayıklama laboratuvarları ve çok dosyalı projelerle öğreten Tauri tabanlı masaüstü uygulamasıdır.",
    "Python Farming, Python'ı başlangıçtan uzman seviyeye kadar uygulamalı görevler, hata ayıklama laboratuvarları ve çok dosyalı projelerle öğreten Tauri tabanlı masaüstü uygulamasıdır.",
  )
  .replace(
    "**41 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı.**",
    "**41 ana geliştirme ve ürün sağlamlaştırma aşaması ile 6 modüllük Uzman Seviye ürün yolu tamamlandı.**",
  )
  .replace(
    "`1.0.0`, doğrulanmış yerel Python çalışma motoru, Başlangıç, Orta Seviye ve İleri Seviye eğitim yolları, mezuniyet projeleri, güvenli yerel ilerleme yönetimi ve davranışsal görev doğrulama sistemiyle ilk kararlı kaynak sürümüdür. Uzman Seviye yolu İleri Seviye mezuniyetinden sonra açılır; uzman içerikleri ayrı ürün yolunda geliştirilecektir.",
    "`1.1.0`, kararlı yerel Python çalışma motoruna ek olarak Algoritmalar ve Karmaşıklık, Paralellik ve Sistem Programlama, AST/Derleyiciler, Dağıtık Sistemler, Güvenlik/Gözlemlenebilirlik ve Güvenilir Kod Analiz Platformu bitirme projesinden oluşan 6 modüllük Uzman Seviye yolunu yayımlar. Uzman yolu İleri Seviye mezuniyetinden sonra açılır ve kendi 95→100 mezuniyet hesabı ile rozetini içerir.",
  )
  .replace(
    "- Başlangıç, Orta Seviye ve İleri Seviye bitirme projeleri",
    "- Başlangıç, Orta Seviye, İleri Seviye ve Uzman Seviye bitirme projeleri\n- 6 modüllük Uzman Seviye yolu ve Python Farming Uzman Seviye Mezunu rozeti",
  )
  .replace(
    "`v1.0.0` etiketi oluşturulmadan önce `docs/RELEASE_CHECKLIST.md` ve `docs/FINAL_QA_1.0.md` uygulanmalıdır.",
    "`v1.1.0` etiketi oluşturulmadan önce `docs/RELEASE_CHECKLIST.md` ve `docs/FINAL_QA_1.1.md` uygulanmalıdır.",
  )
  .replace(
    "1.0 sürüm özeti için `docs/RELEASE_NOTES_1.0.0.md` dosyasına bakın.",
    "1.1 sürüm özeti için `docs/RELEASE_NOTES_1.1.0.md` dosyasına bakın; 1.0 geçmişi `docs/RELEASE_NOTES_1.0.0.md` içinde korunur.",
  );
write("README.md", readme);

let checklist = read("docs/RELEASE_CHECKLIST.md");
checklist = checklist
  .replace(
    "`1.0.0`, ilk kararlı kaynak sürümüdür; platform installer'ları imzalama ve temiz makine kontrolleri tamamlanana kadar taslak tutulur.",
    "`1.1.0`, tamamlanmış Uzman Seviye yolunu içeren güncel kaynak sürümüdür; platform installer'ları imzalama ve temiz makine kontrolleri tamamlanana kadar taslak tutulur.",
  )
  .replace("Örnek: `1.0.0`.", "Örnek: `1.1.0`.")
  .replace(
    "- Async veya SQLite doğrulayıcısı",
    "- Async veya SQLite doğrulayıcısı\n- Uzman Seviye gerçek Python final projesi ve uzman mezuniyet kaydı",
  )
  .replace(
    "Bütün manifestler `1.0.0` olduğunda `v1.0.0` etiketi oluşturulur.",
    "Bütün manifestler `1.1.0` olduğunda `v1.1.0` etiketi oluşturulur.",
  );
write("docs/RELEASE_CHECKLIST.md", checklist);

write(
  "docs/RELEASE_NOTES_1.1.0.md",
  `# Python Farming 1.1.0\n\n## Özet\n\nPython Farming 1.1.0, 1.0.0 çalışma motoru ve veri güvenliği temelinin üzerine 6 modüllük Uzman Seviye öğrenme yolunu ekler. Bu sürüm yeni bir görsel vitrin değil; gerçek Python davranışı, gizli testler ve çok dosyalı final projeleriyle doğrulanan eğitim kapsamı genişlemesidir.\n\n## Yeni Uzman Seviye yolu\n\n1. Algoritmalar ve Karmaşıklık\n2. Paralellik ve Sistem Programlama\n3. AST, Derleyiciler ve Metaprogramlama\n4. Dağıtık Sistemler ve Dayanıklılık\n5. Güvenlik ve Gözlemlenebilirlik\n6. Uzmanlık Projesi — Güvenilir Kod Analiz Platformu\n\nUzman yolu İleri Seviye mezuniyetinden sonra açılır. İlk beş modül uzman mezuniyet puanının %95'ini, final proje son %5'i verir. Final proje tamamlandığında Python Farming Uzman Seviye Mezunu rozeti kazanılır ve ana sayfada Tüm müfredat — Tamamlandı durumu gösterilir.\n\n## Doğrulama kapsamı\n\n- TypeScript typecheck ve bütün Vitest testleri\n- gerçek Python davranış entegrasyon testleri\n- sabit çıktı ve bypass çözümlerini reddeden gizli senaryolar\n- production frontend build\n- Rust format ve kilitli hedef testleri\n- gömülü Python içeren gerçek Linux installer smoke testi\n\n## Uyumluluk\n\n1.0.0 ile oluşturulan SQLite ilerleme verisi, yedekler ve dışa aktarma dosyaları korunur. Uzman dersleri mevcut ilerleme tablosuna yeni ders kimlikleri olarak eklenir; eski XP veya tamamlanan dersler sıfırlanmaz.\n\n## Bilinen dağıtım sınırlamaları\n\nWindows Authenticode imzası ve macOS Developer ID/notarizasyon sırları repository'de yapılandırılmamıştır. Kaynak kodu, test hattı ve unsigned/ad-hoc installer üretimi doğrulanmıştır; herkese açık dağıtım öncesinde platform imzalama adımları ayrıca tamamlanmalıdır.\n`,
);

write(
  "docs/FINAL_QA_1.1.md",
  `# Python Farming 1.1 Final QA\n\nBu belge v1.1.0 etiketi oluşturulmadan önce uygulanacak son kullanıcı ve ürün doğrulamalarını tanımlar. Otomatik CI geçişi tek başına imzalı genel dağıtım onayı değildir.\n\n## Otomatik kapılar\n\n- [ ] npm ci\n- [ ] npm run verify\n- [ ] dört platformlu release dry-run\n- [ ] SHA-256 manifest doğrulaması\n- [ ] Linux installer içinde gömülü Python smoke testi\n\n## Müfredat doğrulaması\n\n- [ ] Başlangıç, Orta, İleri ve Uzman seviyeleri açılma sırasını koruyor\n- [ ] Uzman Seviye 6 modül ve 6/6 tamamlanma hesabı gösteriyor\n- [ ] Uzman final projesi sabit çıktı kullanan zayıf çözümü reddediyor\n- [ ] Uzman mezuniyet puanı final öncesi en fazla 95, final sonrası 100 oluyor\n- [ ] Python Farming Uzman Seviye Mezunu rozeti yalnız final sonrası veriliyor\n- [ ] Ana sayfa Tüm müfredat — Tamamlandı durumunu doğru gösteriyor\n\n## Veri uyumluluğu\n\n- [ ] 1.0.0 SQLite ilerleme verisi 1.1.0 ile açılıyor\n- [ ] Mevcut XP ve tamamlanan dersler korunuyor\n- [ ] yedek oluşturma, geri yükleme ve JSON dışa/içe aktarma çalışıyor\n\n## Dağıtım sınırları\n\nİşaretlenmemiş maddeler tamamlanmış sayılmaz. Windows Authenticode ve macOS notarizasyonu doğrulanmadan imzalı installer desteği varmış gibi beyan edilmemelidir.\n`,
);

write(
  "src/test/content/finalReleaseContract.test.ts",
  `import { readFileSync } from "node:fs";\nimport { resolve } from "node:path";\nimport { describe, expect, it } from "vitest";\n\nconst read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");\n\ndescribe("Python Farming 1.1 expert release contract", () => {\n  it("keeps every application version source aligned at 1.1.0", () => {\n    const packageJson = JSON.parse(read("package.json")) as { version: string };\n    const packageLock = JSON.parse(read("package-lock.json")) as { version: string; packages: Record<string, { version?: string }> };\n    const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json")) as { version: string };\n    const cargoToml = read("src-tauri/Cargo.toml");\n    const cargoLock = read("src-tauri/Cargo.lock");\n    const appConfig = read("src/app/appConfig.ts");\n\n    expect(packageJson.version).toBe("1.1.0");\n    expect(packageLock.version).toBe("1.1.0");\n    expect(packageLock.packages[""]?.version).toBe("1.1.0");\n    expect(tauriConfig.version).toBe("1.1.0");\n    expect(cargoToml).toMatch(/\\[package\\][\\s\\S]*?version = "1\\.1\\.0"/);\n    expect(cargoLock).toMatch(/\\[\\[package\\]\\]\\nname = "python-farming"\\nversion = "1\\.1\\.0"/);\n    expect(appConfig).toContain('version: "1.1.0"');\n  });\n\n  it("publishes the complete six-module expert route honestly", () => {\n    const curriculum = JSON.parse(read("public/content/curriculum.json")) as { levels: Array<{ id: string; modules: unknown[] }> };\n    const packages = JSON.parse(read("public/content/module-packages.json")) as { files: string[] };\n    const expert = curriculum.levels.find((level) => level.id === "expert");\n    const readme = read("README.md");\n    const notes = read("docs/RELEASE_NOTES_1.1.0.md");\n    const qa = read("docs/FINAL_QA_1.1.md");\n\n    expect(expert?.modules).toHaveLength(6);\n    expect(packages.files).toHaveLength(32);\n    expect(packages.files.slice(-6)).toEqual([\n      "/content/modules/algorithms-complexity.json",\n      "/content/modules/parallelism-systems.json",\n      "/content/modules/compilers-metaprogramming.json",\n      "/content/modules/distributed-resilience.json",\n      "/content/modules/security-observability.json",\n      "/content/modules/expert-project.json",\n    ]);\n    expect(readme).toContain("6 modüllük Uzman Seviye ürün yolu tamamlandı");\n    expect(readme).not.toContain("uzman içerikleri ayrı ürün yolunda geliştirilecektir");\n    expect(notes).toContain("Güvenilir Kod Analiz Platformu");\n    expect(notes).toContain("Bilinen dağıtım sınırlamaları");\n    expect(qa).toContain("işaretlenmemiş maddeler");\n    expect(qa).toContain("imzalı installer desteği varmış gibi beyan edilmemelidir");\n  });\n\n  it("keeps release publication tag-gated and dry runs non-publishing", () => {\n    const workflow = read(".github/workflows/release.yml");\n    expect(workflow).toContain("Build dry-run Tauri bundles");\n    expect(workflow).toContain("tagName: $" + "{{ github.ref_name }}");\n    expect(workflow).toContain("releaseDraft: true");\n    expect(workflow).toContain("prerelease: false");\n    expect(workflow).not.toContain("v__VERSION__");\n    expect(workflow).toContain("release-manifests/");\n  });\n});\n`,
);

console.log(`Python Farming ${VERSION} expert release files materialized.`);
