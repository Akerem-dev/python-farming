# Python Farming

Python Farming, başlangıç seviyesinden uzman Python geliştiriciliğine uzanan assetsiz ve masaüstü odaklı bir öğrenme oyunudur.

## Mevcut aşama

**Aşama 3 — Yerel Python çalışma motoru**

Bu sürümde şunlar çalışır:

- Vite + React + TypeScript ön yüzü
- Tauri 2 masaüstü uygulama yapılandırması
- Ana müfredat ve çalışma ekranları
- CodeMirror 6 tabanlı gerçek Python editörü
- Python sözdizimi renklendirmesi
- Satır, sütun ve kaydetme durumu takibi
- Kademeli ders ipuçları
- Yerel Python 3 yorumlayıcısını otomatik bulma
- Tauri IPC üzerinden gerçek Python kodu çalıştırma
- Gerçek `stdout`, `stderr`, traceback, çıkış kodu ve çalışma süresi
- Sonsuz döngülere karşı dört saniyelik ders çalışma sınırı
- Kaynak kod, stdin ve terminal çıktısı için güvenli boyut sınırları
- Her çalıştırmada geçici ve ayrı çalışma klasörü
- TypeScript ve Rust birim testleri
- GitHub Actions üzerinde frontend ve Rust CI

Henüz bağlanmayan sistemler:

- Uygulamayla paketlenen gömülü CPython dağıtımı
- İşletim sistemi seviyesinde üretim sandbox'ı
- İnteraktif stdin formu
- Gizli test ve görev doğrulama motoru
- SQLite ilerleme kaydı
- JSON tabanlı ders içerik motoru

## Gereksinimler

- Node.js 20.19 veya üzeri
- npm 10 veya üzeri
- Rust stable ve Tauri işletim sistemi ön koşulları
- Aşama 3 geliştirme runtime'ı için PATH üzerinde Python 3

Windows'ta Python Launcher (`py -3`) veya `python`; macOS/Linux'ta `python3` veya `python` otomatik olarak aranır. Özel bir yorumlayıcı kullanmak için `PYTHON_FARMING_PYTHON` ortam değişkeni ayarlanabilir.

## İlk kurulum

```bash
npm install
```

Oluşan `package-lock.json` dosyası repository'ye eklenmelidir.

## Çalıştırma

Tarayıcı arayüz ön izlemesi:

```bash
npm run dev
```

Tarayıcı ön izlemesinde güvenlik gereği Python çalıştırılmaz. Gerçek masaüstü runtime için:

```bash
npm run tauri:dev
```

## Kontroller

```bash
npm run typecheck
npm test
npm run build
cd src-tauri
cargo fmt --all -- --check
cargo test --all-targets
```

## Runtime güvenlik sınırı

Aşama 3, eğitim akışını doğrulamak için sistemde kurulu Python'u `-I -B` bayraklarıyla ayrı geçici klasörde çalıştırır; süreyi ve çıktı boyutunu sınırlar. Bu yapı henüz kötü niyetli kodu işletim sistemi seviyesinde izole eden tam bir güvenlik sandbox'ı değildir. Son kullanıcı sürümünde imzalı gömülü CPython, daha sıkı dosya izinleri ve platforma özel süreç kısıtlamaları kullanılacaktır.

## Sonraki aşama

Aşama 4'te stdin kullanıcı arayüzü, görev testleri, AST tabanlı gereksinim doğrulaması ve başarı/başarısızlık geri bildirimi eklenecektir.
