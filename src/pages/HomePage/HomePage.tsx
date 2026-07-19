import { routes } from "../../app/routes";
import { navigate } from "../../app/AppRouter";
import { Button } from "../../components/common/Button";
import { ProgressBar } from "../../components/common/ProgressBar";
import { AppShell } from "../../layouts/AppShell";
import styles from "./HomePage.module.css";

const levels = [
  { name: "Başlangıç", progress: 18, modules: "2 / 8" },
  { name: "Orta Seviye", progress: 0, modules: "0 / 10" },
  { name: "İleri Seviye", progress: 0, modules: "0 / 8" },
  { name: "Uzman Seviye", progress: 0, modules: "0 / 6" },
];

const reviewItems = ["Değişken adlandırma", "Veri tipi dönüşümleri", "print() biçimlendirme"];

export function HomePage() {
  return (
    <AppShell activeRoute={routes.home} context="Ana Sayfa / Müfredat">
      <div className={styles.page}>
        <section className={styles.mainColumn}>
          <article className={`${styles.panel} ${styles.continuePanel}`}>
            <div>
              <span className={styles.eyebrow}>Devam et</span>
              <h1>2.1 Değişkenler</h1>
              <p>Verileri isimlendir, sakla ve ilk çalışan Python programını oluştur.</p>
              <div className={styles.continueProgress}>
                <ProgressBar value={34} label="%34" />
              </div>
            </div>
            <Button variant="primary" onClick={() => navigate(routes.workspace)}>
              Derse devam et →
            </Button>
          </article>

          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Öğrenim yolu</span>
                <h2>Başlangıçtan uzmanlığa tek rota</h2>
              </div>
              <span className={styles.meta}>32 ana modül</span>
            </header>

            <div className={styles.levelGrid}>
              {levels.map((level, index) => (
                <div className={styles.levelCard} key={level.name}>
                  <div className={styles.levelIndex}>{String(index + 1).padStart(2, "0")}</div>
                  <strong>{level.name}</strong>
                  <span>{level.modules} modül</span>
                  <ProgressBar value={level.progress} />
                </div>
              ))}
            </div>
          </article>

          <div className={styles.twoColumns}>
            <article className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <span className={styles.eyebrow}>Güncel modül</span>
                  <h2>Değişkenler ve Veri Tipleri</h2>
                </div>
                <span className={styles.levelBadge}>Başlangıç</span>
              </header>
              <div className={styles.lessonList}>
                <span className={styles.completed}>✓ Değişkenler nedir?</span>
                <span className={styles.current}>● Değer atama</span>
                <span>○ Veri tiplerini tanıma</span>
                <span>○ Tip dönüşümleri</span>
                <span>○ Mini proje: Bilgi kartı</span>
              </div>
            </article>

            <article className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <span className={styles.eyebrow}>Yaklaşan sistemler</span>
                  <h2>Python Farming laboratuvarı</h2>
                </div>
              </header>
              <div className={styles.featureList}>
                <span>Çıktıyı tahmin et</span>
                <span>Kod tamamlama</span>
                <span>Hata ayıklama</span>
                <span>Mini projeler</span>
                <span>Expert Project Lab</span>
              </div>
            </article>
          </div>
        </section>

        <aside className={styles.sideColumn}>
          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Ustalık</span>
                <h2>Genel durum</h2>
              </div>
            </header>
            <div className={styles.masteryRing}>
              <div><strong>18%</strong><span>Genel ustalık</span></div>
            </div>
            <div className={styles.statRows}>
              <span><b>7</b> tamamlanan ders</span>
              <span><b>2</b> başarılı pratik</span>
              <span><b>0</b> tamamlanan proje</span>
            </div>
          </article>

          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Önerilen tekrar</span>
                <h2>Bugün güçlendir</h2>
              </div>
            </header>
            <div className={styles.reviewList}>
              {reviewItems.map((item, index) => (
                <button type="button" key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {item}
                  <b>→</b>
                </button>
              ))}
            </div>
          </article>

          <article className={`${styles.panel} ${styles.stagePanel}`}>
            <span className={styles.eyebrow}>Aşama 1</span>
            <h2>Temel arayüz hazır</h2>
            <p>Bu sürümde pencere, tema, navigasyon ve iki ana çalışma alanı bulunuyor.</p>
          </article>
        </aside>
      </div>
    </AppShell>
  );
}
