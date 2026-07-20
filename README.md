# Python Farming

Python Farming, başlangıç seviyesinden uzman Python geliştiriciliğine uzanan assetsiz ve masaüstü odaklı bir öğrenme oyunudur.

## Mevcut aşama

**Aşama 2 — Gerçek kod editörü ve çalışma oturumu**

Bu sürümde şunlar çalışır:

- Vite + React + TypeScript ön yüzü
- Tauri 2 masaüstü uygulama yapılandırması
- Ana müfredat ve çalışma ekranları
- CodeMirror 6 tabanlı gerçek Python editörü
- Python sözdizimi renklendirmesi
- Satır ve sütun takibi
- Kaydedilmemiş değişiklik ve otomatik kayıt göstergesi
- Başlangıç koduna geri dönme
- Kademeli ders ipucu state'i
- Zustand tabanlı editör ve öğrenme oturumu
- CPython sidecar için sürümlenmiş runtime protokol sözleşmesi
- Workspace ekranı için lazy loading / code splitting
- Editör store birim testleri

Henüz bağlanmayan sistemler:

- Gerçek CPython runtime
- Terminal stdin/stdout iletişimi
- Gizli test doğrulaması
- SQLite ilerleme kaydı
- JSON tabanlı ders içerik motoru

## Gereksinimler

- Node.js 20.19 veya üzeri
- npm 10 veya üzeri
- Masaüstü geliştirme için Rust ve Tauri işletim sistemi ön koşulları

## İlk kurulum

Bu branch'te eski `package-lock.json`, üretim ortamına özel registry adresleri içerdiği için kaldırılmıştır. Kendi bilgisayarında bir kez aşağıdaki komutu çalıştır; npm, `.npmrc` üzerinden resmî registry'yi kullanarak yeni lock dosyasını oluşturacaktır.

```bash
npm install
```

Oluşan `package-lock.json` dosyasını repository'ye eklemek gerekir.

## Çalıştırma

```bash
npm run dev
```

Tarayıcı ön izlemesi `http://localhost:1420` adresinde açılır.

Tauri masaüstü penceresi:

```bash
npm run tauri:dev
```

## Kontroller

```bash
npm run typecheck
npm test
npm run build
```

## Aşama 2 doğrulaması

- TypeScript type-check: başarılı
- Vitest: 3/3 test başarılı
- Production build: başarılı
- Ana uygulama paketi: yaklaşık 206 KB
- Çalışma alanı / editör paketi: yaklaşık 471 KB ve yalnız gerektiğinde yüklenir

## Sonraki aşama

Aşama 3'te izole CPython çalışma süreci, Tauri IPC sınırı, gerçek terminal çıktısı, zaman aşımı ve kod çalıştırma düğmesi bağlanacaktır.
