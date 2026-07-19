# Python Farming

Python Farming, başlangıç seviyesinden uzman Python geliştiriciliğine uzanan assetsiz ve masaüstü odaklı bir öğrenme oyunudur.

## Mevcut aşama

**Aşama 1 — Uygulama kabuğu ve tasarım sistemi**

Bu sürümde şunlar çalışır:

- Vite + React + TypeScript ön yüzü
- Tauri 2 masaüstü uygulama yapılandırması
- Ana müfredat ekranı
- Başlangıç öğrenme çalışma ekranı
- Hash tabanlı iki rota
- Koyu ve açık tema tokenları
- Responsive panel düzeni
- Klavye odak stilleri ve reduced-motion desteği

Henüz bağlanmayan sistemler:

- Gerçek kod editörü
- CPython runtime
- Terminal iletişimi
- SQLite ilerleme kaydı
- Ders içerik motoru

## Gereksinimler

- Node.js 20.19 veya üzeri
- npm 10 veya üzeri
- Masaüstü geliştirme için Rust ve Tauri işletim sistemi ön koşulları

## Çalıştırma

```bash
npm install
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
npm run build
```

## Sonraki aşama

Aşama 2’de CodeMirror tabanlı gerçek editör, çalışma oturumu state’i ve Python runtime protokolü eklenecek.
