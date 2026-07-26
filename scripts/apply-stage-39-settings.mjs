import { readFile, writeFile } from "node:fs/promises";

const path = "src/pages/SettingsPage/SettingsPage.tsx";
let value = await readFile(path, "utf8");

function replaceExact(before, after, label) {
  if (!value.includes(before)) {
    throw new Error(`Patch hedefi bulunamadı: ${label}`);
  }
  value = value.replace(before, after);
}

replaceExact(
  `  const runtimeOffline =\n    diagnosticsStatus === "offline" && snapshot?.environment === "desktop";\n  const statusLabel =`,
  `  const runtimeOffline =\n    diagnosticsStatus === "offline" && snapshot?.environment === "desktop";\n  const security = snapshot?.runtime?.security;\n  const statusLabel =`,
  "security profile binding",
);

replaceExact(
  `              Bu ekran kullanıcı kodunu çalıştırmadan gömülü veya sistem Python yorumlayıcısını,\n              uygulama sürümünü, güvenlik limitlerini ve ilerleme kaydını inceler.`,
  `              Bu ekran kullanıcı kodunu çalıştırmadan gömülü veya sistem Python yorumlayıcısını,\n              uygulama sürümünü, etkin izolasyon politikasını ve ilerleme kaydını inceler.`,
  "settings hero",
);

replaceExact(
  `                <span>Güvenlik sözleşmesi</span>\n                <h2>Çalıştırma limitleri</h2>`,
  `                <span>Güvenlik sözleşmesi</span>\n                <h2>İzolasyon ve çalıştırma limitleri</h2>`,
  "security title",
);

replaceExact(
  `            <dl className={styles.details}>\n              <div>\n                <dt>Tek dosya kaynak kodu</dt>`,
  `            <dl className={styles.details}>\n              <div>\n                <dt>Politika sürümü</dt>\n                <dd>v{security?.policyVersion ?? "—"}</dd>\n              </div>\n              <div>\n                <dt>Dosya sistemi</dt>\n                <dd>{security?.filesystemScope === "workspace-only" ? "Yalnız çalışma alanı" : "—"}</dd>\n              </div>\n              <div>\n                <dt>Ağ erişimi</dt>\n                <dd>{security?.networkAccess === "blocked" ? "Kapalı" : "—"}</dd>\n              </div>\n              <div>\n                <dt>Alt süreç erişimi</dt>\n                <dd>{security?.subprocessAccess === "blocked" ? "Kapalı" : "—"}</dd>\n              </div>\n              <div>\n                <dt>Çevre izolasyonu</dt>\n                <dd>{security?.environmentIsolated ? "Etkin" : "—"}</dd>\n              </div>\n              <div>\n                <dt>Süreç ağacı sonlandırma</dt>\n                <dd>{security?.processTreeTermination ? "Etkin" : "—"}</dd>\n              </div>\n              <div>\n                <dt>Çalışma alanı kotası</dt>\n                <dd>{security ? formatBytes(security.maxWorkspaceBytes) : "—"}</dd>\n              </div>\n              <div>\n                <dt>Azami çalışma alanı dosyası</dt>\n                <dd>{security?.maxWorkspaceFiles ?? "—"}</dd>\n              </div>\n              <div>\n                <dt>Tek dosya kaynak kodu</dt>`,
  "security details",
);

replaceExact(
  `              Girdi sınırı satır içeriklerinin toplamını ölçer; satır ayraçları çalışma sırasında\n              ayrıca eklenir. Stdout ve stderr ayrı ayrı sınırlandırılır. Limit aşılırsa süreç\n              durdurulur veya çıktı güvenli biçimde kısaltılır.`,
  `              Tek ve çok dosyalı görevler aynı audit politikasını kullanır. Çalışma alanı dışı\n              dosya erişimi, ağ, alt süreç, fork, sembolik bağlantı ve yerel kütüphane yükleme\n              reddedilir. Timeout veya kota aşımında bütün süreç ağacı durdurulur; stdout ve stderr\n              ayrı ayrı sınırlandırılır.`,
  "security note",
);

await writeFile(path, value, "utf8");
