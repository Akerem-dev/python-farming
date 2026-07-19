import { routes } from "../../app/routes";
import { Button } from "../../components/common/Button";
import { AppShell } from "../../layouts/AppShell";
import styles from "./WorkspacePage.module.css";

const codeLines = [
  "# Kodunuzu buraya yazın",
  "",
  'ad = ""',
  "yas = 0",
  "",
  'print(f"Merhaba, ben {ad} ve {yas} yaşındayım.")',
];

export function WorkspacePage() {
  return (
    <AppShell activeRoute={routes.workspace} compactCurriculum context="Başlangıç / 2.1 Değişkenler">
      <div className={styles.workspace}>
        <section className={styles.briefPanel}>
          <div className={styles.stepRow}>
            <span>Beginner Learning</span>
            <strong>Adım 1 / 6</strong>
          </div>
          <h1>Değişkenler nedir?</h1>
          <p className={styles.intro}>
            Değişkenler, verileri isim vererek saklamanı ve daha sonra yeniden kullanmanı sağlar.
          </p>

          <div className={styles.taskBlock}>
            <span className={styles.eyebrow}>Görevin</span>
            <h2>Kendini tanıtan iki değişken oluştur</h2>
            <ol>
              <li><code>ad</code> değişkenine kendi adını ata.</li>
              <li><code>yas</code> değişkenine yaşını ata.</li>
              <li>İki değeri tek bir cümlede ekrana yazdır.</li>
            </ol>
          </div>

          <div className={styles.requirements}>
            <div>
              <span className={styles.eyebrow}>Gereksinimler</span>
              <ul>
                <li>İki değişken tanımlanmalı.</li>
                <li><code>print()</code> kullanılmalı.</li>
                <li>Beklenen biçim korunmalı.</li>
              </ul>
            </div>
            <div>
              <span className={styles.eyebrow}>Örnek çıktı</span>
              <pre>Merhaba, ben Ali ve 20 yaşındayım.</pre>
            </div>
          </div>

          <div className={styles.briefActions}>
            <Button>İpucu al</Button>
            <span>İpucu kullanımı: 0 / 3</span>
          </div>
        </section>

        <section className={styles.editorPanel}>
          <header className={styles.editorHeader}>
            <div><span className={styles.activeTab}>main.py</span><button type="button">＋</button></div>
            <span>Python 3.12</span>
          </header>
          <div className={styles.editor} aria-label="Python kod editörü ön izlemesi">
            {codeLines.map((line, index) => (
              <div className={styles.codeLine} key={`${index}-${line}`}>
                <span>{index + 1}</span>
                <code className={index === 0 ? styles.comment : ""}>{line || " "}</code>
              </div>
            ))}
            <div className={styles.cursor} />
          </div>
          <footer className={styles.editorStatus}>Satır 1, Sütun 1 · UTF-8 · Kaydedilmedi</footer>
        </section>

        <section className={styles.terminalPanel}>
          <header>
            <div><strong>Çıktı / Terminal</strong><span>Problemler</span></div>
            <button type="button">Temizle</button>
          </header>
          <pre>Python runtime sonraki aşamada bağlanacak.
&gt;&gt;&gt; _</pre>
          <div className={styles.runActions}>
            <Button>Sıfırla</Button>
            <Button variant="primary" disabled>Çalıştır — Aşama 2</Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
