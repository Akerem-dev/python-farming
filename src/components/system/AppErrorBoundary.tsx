import {
  Component,
  type ErrorInfo,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import styles from "./AppErrorBoundary.module.css";

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  PropsWithChildren,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Python Farming beklenmeyen bir arayüz hatası yakaladı.", {
      error,
      componentStack: info.componentStack,
    });
  }

  private reloadApplication = () => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <main className={styles.root} role="alert" aria-live="assertive">
        <section className={styles.card} aria-labelledby="application-error-title">
          <span className={styles.code}>UI-500</span>
          <h1 id="application-error-title">Uygulama görünümü kurtarılamadı</h1>
          <p>
            İlerleme verilerin yerel SQLite veritabanında duruyor. Uygulamayı yeniden
            yükleyerek güvenli biçimde devam edebilirsin.
          </p>
          <button type="button" onClick={this.reloadApplication} autoFocus>
            Uygulamayı yeniden yükle
          </button>
          <details>
            <summary>Teknik ayrıntıyı göster</summary>
            <code>{error.message || "Bilinmeyen arayüz hatası"}</code>
          </details>
        </section>
      </main>
    );
  }
}
