# Python Farming

Python Farming, Python'ı başlangıçtan ileri seviyeye kadar uygulamalı görevler, hata ayıklama laboratuvarları ve çok dosyalı projelerle öğreten Tauri tabanlı masaüstü uygulamasıdır.

## Proje durumu

**40 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı.**

Mevcut `0.1.0` sürümü bir geliştirme ön izlemesidir. Başlangıç, Orta Seviye ve İleri Seviye eğitim yolları; mezuniyet projeleri, yerel ilerleme kaydı ve davranışsal görev doğrulama sistemiyle birlikte çalışır. Uzman Seviye yolu İleri Seviye mezuniyetinden sonra açılır; uzman içerikleri ayrı ürün yolunda geliştirilecektir.

## Çalışan sistemler

- React 19 + TypeScript + Vite arayüzü
- Tauri 2 masaüstü kabuğu ve Rust çalışma motoru
- CodeMirror 6 tabanlı Python editörü
- Tek ve çok dosyalı Python çalışma alanları
- Installer'a gömülü, SHA-256 doğrulamalı taşınabilir Python 3 runtime'ı
- Geliştirme için özel yorumlayıcı ve sistem Python fallback'i
- Tek ve çok dosyalı görevlerde ortak Python audit güvenlik politikası
- Çalışma alanı dışı dosya erişimi, ağ, alt süreç, fork ve yerel kütüphane yükleme engelleri
- Temizlenmiş çevre değişkenleri, süreç ağacı sonlandırma ve çalışma alanı kotaları
- Gerçek `stdout`, `stderr`, traceback, çıkış kodu ve çalışma süresi
- `stdin`, seçim, sıralama, kod tamamlama ve hata ayıklama görevleri
- AST, type hint, sınıf, protokol, async, SQLite ve davranış tabanlı doğrulayıcılar
- Gizli senaryolar ve zayıf/bypass çözümlerini reddeden kalite kapıları
- JSON tabanlı müfredat paketleri
- Yerel SQLite ilerleme, XP, rozet ve mezuniyet kaydı
- Bütünlük kontrollü yerel ilerleme yedekleri, geri yükleme ve kontrollü silme
- Sürümlü JSON ile ilerleme dışa aktarma, içe alma ve güvenli sıfırlama
- Başlangıç, Orta Seviye ve İleri Seviye bitirme projeleri
- GitHub Actions üzerinde frontend ve Rust CI
- Windows, Linux ve macOS için imzalı uygulama içi güncelleme ve production release kapıları

## Teknoloji yığını

| Katman | Teknoloji |
| --- | --- |
| Masaüstü | Tauri 2 |
| Arayüz | React 19, TypeScript, Vite |
| Editör | CodeMirror 6 |
| Durum yönetimi | Zustand |
| Yerel çalışma motoru | Rust + gömülü/sistem Python 3 |
| Kalıcılık | SQLite / rusqlite |
| Test | Vitest + Rust testleri + gerçek Python entegrasyon testleri |

## Gereksinimler

- Node.js `20.19` veya üzeri
- npm `10` veya üzeri
- Rust stable
- Tauri'nin işletim sistemine özel geliştirme ön koşulları
- Geliştirme modunda PATH üzerinde Python 3 veya `PYTHON_FARMING_PYTHON`; production installer'lar Python runtime'ını içerir

Python yorumlayıcısı şu sırayla aranır:

- `PYTHON_FARMING_PYTHON` geliştirici override'ı
- Installer'a gömülü ve build sırasında SHA-256 doğrulanan runtime
- Geliştirme fallback'i olarak sistem Python'ı

Sistem fallback adayları:

- Windows: `py -3`, ardından `python`
- macOS/Linux: `python3`, ardından `python`

Özel yorumlayıcı kullanmak için `PYTHON_FARMING_PYTHON` ortam değişkeni ayarlanabilir.

## Temiz kurulum

Repository'yi klonladıktan sonra:

```bash
npm ci
```

Masaüstü uygulamasını geliştirme modunda çalıştırmak için:

```bash
npm run tauri:dev
```

Yalnız web arayüzünü ön izlemek için:

```bash
npm run dev
```

Tarayıcı ön izlemesinde Tauri komutları ve gerçek Python çalışma motoru kullanılamaz; tam deneyim için `tauri:dev` gerekir.

## Kalite kontrolleri

Bütün frontend ve Rust kontrollerini tek komutla çalıştırmak için:

```bash
npm run verify
```

Ayrı çalıştırmak gerekirse:

```bash
npm run verify:frontend
npm run verify:rust
```

`verify:frontend` typecheck, bütün Vitest testleri ve production frontend build'ini çalıştırır. `verify:rust`, rustfmt ve kilitli bağımlılıklarla bütün Rust hedef testlerini çalıştırır.

## Yerel production build

```bash
npm run tauri:build
```

Paketler `src-tauri/target/release/bundle` altında oluşturulur. Çıktı biçimi işletim sistemine göre değişir.

## Release akışı

`.github/workflows/release.yml` workflow'u manuel çalıştırıldığında şu paketleri üretir:

- Windows x64
- Linux x64
- macOS Apple Silicon
- macOS Intel

Manuel workflow çalıştırmaları yalnız **taslak preview** release üretir. Production yayınları tam sürüm etiketiyle çalışır; updater private key, Windows code-signing sertifikası ve Apple Developer ID/notarizasyon sırlarından biri eksikse workflow daha build başlamadan durur. Uygulama içindeki güncelleme denetimi yalnız kullanıcı isteğiyle başlar; kurulumdan önce yerel ilerleme yedeği alınır ve Tauri artifact imzası doğrulanır.

Ayrıntılı adımlar için [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md) dosyasını kullanın.

## Yerel veri

İlerleme, tamamlanan dersler, XP, rozetler ve son açık ders masaüstü uygulamasının yerel SQLite veritabanında tutulur. Ayarlar ekranından oluşturulan yedekler uygulama veri klasöründeki `backups` dizinine yazılır. Her yedek oluşturulmadan önce ana veritabanı, oluşturulduktan sonra da yedek dosyası SQLite `quick_check` ile doğrulanır. En yeni 5 yedek ve toplam en fazla 25 MB saklanır; daha eski yedekler otomatik temizlenir.

Normal `git pull`, `npm ci` veya uygulama güncellemesi ilerleme verisini ve yedekleri silmez. Geliştirme sırasında uygulama veri klasörünü elle temizlemek tüm yerel veriyi sıfırlar. Ayarlar ekranı yedek oluşturma, bütünlük denetimi, geri yükleme, kontrollü silme, sürümlü JSON dışa/içe aktarma ve güvenli sıfırlama akışlarını içerir. İçe aktarma ve sıfırlamadan önce mevcut SQLite kaydı otomatik güvenlik yedeğine alınır.

## Çalışma motoru güvenliği

Öğrenci kodu her çalıştırmada yalnız o isteğe ait izinleri daraltılmış geçici klasörde başlatılır. Tek dosyalı ve çok dosyalı görevler aynı Python audit politikasını kullanır. Çalışma alanı dışındaki dosya okuma/yazma ve dizin keşfi; ağ soketleri; `subprocess`, `os.system`, spawn/fork; sembolik bağlantı ve `ctypes` ile yerel kütüphane yükleme reddedilir. Çocuk süreç çevresi temizlenir; ev ve geçici klasörler çalışma alanına yönlendirilir; PATH boşaltılır.

Timeout veya çalışma alanı kotası aşıldığında yalnız ana Python süreci değil, Unix process group ya da Windows process tree bütünü sonlandırılır. Çalışma alanı toplam 16 MB ve 512 dosyayla sınırlıdır; stdout ve stderr de ayrı ayrı sınırlandırılır. Ayrıntılı tehdit modeli ve doğrulama adımları için [`docs/RUNTIME_SECURITY.md`](docs/RUNTIME_SECURITY.md) dosyasına bakın.

Bu katman eğitim uygulamasındaki kazara veya basit kötüye kullanımlara karşı savunma derinliği sağlar. Python audit hook'u tek başına işletim sistemi veya sanal makine seviyesinde güven sınırı değildir; uygulama genel amaçlı, düşmanca kod barındırma servisi olarak kullanılmamalıdır. Platform release hattı updater artifact imzasını zorunlu tutar; production etiketi Windows Authenticode ve macOS notarizasyon sırları olmadan yayımlanamaz.

## Sürümleme

Uygulama sürümü aşağıdaki üç dosyada aynı tutulmalıdır:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

Release workflow'u GitHub etiketini Tauri uygulama sürümünden üretir.
