# Aşama 01 — Temel Uygulama Kabuğu

## Tamamlananlar

- Vite + React + TypeScript yapılandırması
- Tauri 2 masaüstü yapılandırması
- Python Farming ürün adı ve paket kimliği
- Ana uygulama kabuğu
- Başlık çubuğu
- Ana navigasyon rayı
- Müfredat yan paneli
- Durum çubuğu
- Ana müfredat ekranı
- Başlangıç çalışma ekranı
- Koyu ve açık tema tokenları
- Responsive yerleşim
- Erişilebilir odak stilleri
- Reduced-motion desteği

## Doğrulama

- `npm install`: başarılı
- `npm run typecheck`: başarılı
- `npm run build`: başarılı
- npm güvenlik denetimi: 0 açık
- Tauri CLI yapılandırmayı tanıdı

## Ortam sınırlaması

Bu üretim ortamında Rust, Cargo ve Linux Tauri sistem paketleri bulunmadığı için masaüstü binary derlemesi burada çalıştırılamadı. Windows bilgisayarda Tauri ön koşulları kurulduktan sonra `npm run tauri:dev` ile doğrulanacaktır.

## Sonraki aşama

- CodeMirror tabanlı gerçek editör
- Editör state yönetimi
- Çalışma oturumu modeli
- Rust–Python runtime protokol sözleşmesi
