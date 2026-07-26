# Python Farming Release Kontrol Listesi

Bu liste her masaüstü sürümünden önce uygulanmalıdır. `1.0.0`, ilk kararlı kaynak sürümüdür; platform installer'ları imzalama ve temiz makine kontrolleri tamamlanana kadar taslak tutulur.

## 1. Sürüm numarası

Aşağıdaki üç dosyada aynı SemVer değeri bulunmalıdır:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

Örnek: `1.0.0`.

## 2. Temiz çalışma alanı

```bash
git switch main
git pull origin main
npm ci
```

`git status` yalnız bilinçli release değişikliklerini göstermelidir.

## 3. Otomatik kalite kapısı

```bash
npm run verify
```

Beklenen sonuçlar:

- TypeScript typecheck başarılı
- Bütün Vitest unit/content/integration testleri başarılı
- Production frontend build başarılı
- Rust format kontrolü başarılı
- Bütün Rust hedef testleri `--locked` ile başarılı

## 4. Yerel masaüstü smoke testi

```bash
npm run tauri:dev
```

En az şu akışlar elle denenmelidir:

- Uygulamanın Python kurulmamış temiz profilde ilk açılışı
- Ayarlar ekranında Python kaynağının `Uygulamaya gömülü` görünmesi
- Ayarlar ekranında dosya sistemi, ağ, alt süreç ve süreç ağacı güvenlik profilinin görünmesi
- Mevcut SQLite ilerlemesinin yüklenmesi
- Tek dosyalı Python görevi
- Çok dosyalı Python projesi
- `stdin` kullanan görev
- Hata Avcısı görevi
- Async veya SQLite doğrulayıcısı
- Uygulamayı kapatıp yeniden açınca ilerlemenin korunması

### Güvenli çalışma motoru denemeleri

Tek ve çok dosyalı görevlerde ayrı ayrı şu kaçış denemeleri yapılmalıdır:

- çalışma alanındaki normal dosya okuma/yazma başarılı olur,
- çalışma alanı dışındaki dosya okuma ve yazma `PermissionError` üretir,
- dış klasör listeleme reddedilir,
- `socket.socket()` ve bağlantı denemesi reddedilir,
- `subprocess.Popen`, `os.system` ve spawn/fork reddedilir,
- `ctypes.CDLL` ve sembolik bağlantı oluşturma reddedilir,
- sonsuz döngü timeout olur ve çocuk süreç bırakmaz,
- 16 MB veya 512 dosya kotası aşımı `WORKSPACE_LIMIT_EXCEEDED` üretir.

Ayrıntılı tehdit modeli için `docs/RUNTIME_SECURITY.md` kullanılmalıdır.

## 5. Yerel production paketi

```bash
npm run tauri:build
```

`src-tauri/target/release/bundle` altındaki installer açılmalı ve Python kurulu olmayan en az bir temiz kullanıcı profili üzerinde denenmelidir. Tek dosya, çok dosya, `sqlite3`, `asyncio` ve JSON import smoke testleri gömülü runtime ile çalışmalıdır.

## 6. Veri uyumluluğu

- Yeni sürüm eski SQLite ilerleme verisini açabilmeli.
- Veri tabanı tablosu veya anlamı değiştiyse migration testi eklenmeli.
- Güncelleme, XP ve tamamlanan dersleri sıfırlamamalı.

## 7. GitHub release workflow

### Dry-run

GitHub üzerinde **Actions → Release → Run workflow** seçilir. Manuel çalışma:

- kalite kontrollerini tekrar çalıştırır,
- Windows x64, Linux x64, macOS Apple Silicon ve macOS Intel paketlerini üretir,
- her paket için SHA-256 manifesti oluşturur,
- çıktıları workflow artifact olarak saklar,
- GitHub Release veya sürüm etiketi oluşturmaz.

### Etiketli taslak release

Bütün manifestler `1.0.0` olduğunda `v1.0.0` etiketi oluşturulur. Etiket uyuşmazsa preflight işi yayını durdurur. Uyumlu etiket çalışması paketleri taslak, kararlı ve ön sürüm olmayan GitHub Release'e yükler.

## 8. İmzalama durumu

Mevcut ön izleme hattında:

- macOS paketleri ad-hoc `-` kimliğiyle imzalanır,
- macOS notarizasyonu yapılmaz,
- Windows Authenticode imzası yoktur.

Bu nedenle taslak release herkese açık yayımlanmadan önce platform uyarıları ve kurulum davranışı elle kontrol edilmelidir.

Genel kullanıma açık kararlı sürüm öncesinde Apple Developer ID/notarizasyon ve Windows kod imzalama sırları GitHub Actions'a eklenmelidir.

## 9. Taslak release ve artifact incelemesi

- Sürüm adı ve etiketi doğru mu?
- Dört platform çıktısı yüklendi mi?
- Dosya adlarında sürüm ve mimari anlaşılır mı?
- Release notları gerçek değişiklikleri anlatıyor mu?
- Bilinen sorunlar açıkça yazıldı mı?
- Installer boyutları makul mü?
- Her paketin SHA-256 manifesti mevcut ve yeniden hesaplanan değerle aynı mı?

## 10. Yayın ve geri dönüş

Taslak onaylandıktan sonra release yayımlanır.

Kritik hata görülürse:

1. Release tekrar taslağa alınır veya kaldırılır.
2. Etkilenen sürümün bilinen sorun notu eklenir.
3. Düzeltme patch sürümü hazırlanır.
4. Kullanıcı SQLite verisini silen bir geri dönüş uygulanmaz.
