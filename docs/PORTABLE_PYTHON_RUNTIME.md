# Portable Python Runtime

Python Farming production paketleri, kullanıcının ayrıca Python kurmasını gerektirmemek için `astral-sh/python-build-standalone` tarafından yayımlanan CPython dağıtımlarını içerir.

## Sabitlenen kaynak

- Sağlayıcı: `astral-sh/python-build-standalone`
- Release: `20260510`
- Python serisi: `3.13`
- Dağıtım türü: `install_only_stripped`
- Hedefler:
  - `x86_64-pc-windows-msvc`
  - `x86_64-unknown-linux-gnu`
  - `aarch64-apple-darwin`
  - `x86_64-apple-darwin`

Build aracı release asset listesini GitHub API üzerinden okur, hedefe tam olarak uyan tek arşivi seçer ve GitHub tarafından yayımlanan `sha256:` digest değeriyle indirilen dosyayı doğrular. Digest yoksa, birden fazla asset eşleşirse veya doğrulama başarısız olursa build durur.

Runtime arşivi Git deposuna eklenmez. `src-tauri/python-runtime` dizini yalnız build sırasında hazırlanır ve Tauri resource olarak installer'a dahil edilir. Arşiv içindeki CPython lisansları ve üçüncü taraf bildirimleri değiştirilmeden korunur.

## Çalışma zamanı seçim sırası

1. `PYTHON_FARMING_PYTHON` geliştirici override'ı
2. Installer'a gömülü portable runtime
3. Geliştirme fallback'i olarak sistem Python 3

Ayarlar ekranındaki Sistem Tanılama kartı kullanılan kaynağı `Uygulamaya gömülü`, `Geliştirici override` veya `Sistem Python'ı` olarak gösterir.

## Güncelleme prosedürü

Runtime release'i veya Python serisi değiştirilirken:

1. `scripts/prepare-portable-python.mjs` sabitleri güncellenir.
2. Dört hedef için release asset'lerinin mevcut ve digest taşıdığı doğrulanır.
3. Linux installer smoke testi gömülü yorumlayıcıyla `asyncio`, `json` ve `sqlite3` import eder.
4. Windows ve iki macOS release paketi temiz, Python kurulmamış profillerde denenir.
5. Runtime değişikliği release notlarına ve bilinen sorunlara eklenir.
