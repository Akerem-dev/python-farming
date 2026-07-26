# Python Farming Release Kontrol Listesi

Bu belge, `v<version>` production etiketi oluşturulmadan önce uygulanır. Manuel `workflow_dispatch` yalnız taslak preview paketleri üretir; production yayını değildir.

## 1. Sürüm ve kaynak kontrolü

- [ ] `package.json`, `src-tauri/tauri.conf.json` ve `src-tauri/Cargo.toml` sürümleri aynıdır.
- [ ] Etiket tam olarak `v<uygulama-sürümü>` biçimindedir.
- [ ] `main` temizdir ve son CI tamamen yeşildir.
- [ ] `npm ci`, `npm run verify` ve temiz Tauri build'i geçer.
- [ ] Şema değişikliği varsa geriye dönük okuma, otomatik yedek ve geri dönüş senaryosu test edilmiştir.

## 2. Updater imza anahtarı

Aşağıdaki repository secrets zorunludur:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Public key `src-tauri/updater.pub` ve `tauri.conf.json > plugins > updater > pubkey` içinde bulunur. Private key hiçbir zaman repoya, loga veya release asset'ine yazılmaz.

> Private updater key kaybedilirse mevcut kurulumlara aynı güven zinciri üzerinden yeni sürüm gönderilemez. Şifreli, çevrimdışı ve en az iki kontrollü yedek tutulmalıdır.

## 3. Windows production imzası

- [ ] Gerçek code-signing `.pfx` sertifikası Base64 olarak `WINDOWS_CERTIFICATE` secret'ına eklenmiştir.
- [ ] PFX parolası `WINDOWS_CERTIFICATE_PASSWORD` secret'ındadır.
- [ ] Sertifika süresi ve yayıncı adı kontrol edilmiştir.
- [ ] Workflow sertifikayı geçici kullanıcı sertifika deposuna aktarır.
- [ ] MSI/NSIS çıktıları `Get-AuthenticodeSignature` ile `Valid` sonucunu verir.
- [ ] Sertifika ve geçici dosyalar workflow sonunda runner ile birlikte yok edilir.

## 4. macOS production imzası ve notarizasyon

Aşağıdaki secrets zorunludur:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

- [ ] Apple Silicon ve Intel `.app` paketleri gerçek Developer ID ile imzalanır.
- [ ] Apple notarizasyonu tamamlanır.
- [ ] `codesign --verify --deep --strict` geçer.
- [ ] `xcrun stapler validate` geçer.

Preview macOS paketleri yalnız ad-hoc imzalanabilir ve production olarak paylaşılmaz.

## 5. Linux ve updater artifact'ları

- [ ] Linux paketi gömülü Python runtime içerir.
- [ ] Her platform en az bir updater artifact'ı ve karşılık gelen `.sig` dosyası üretir.
- [ ] Signature dosyası boş değildir ve karşılık gelen artifact vardır.
- [ ] `latest.json` yalnız yayınlanmış kararlı release ile erişilebilir olur.
- [ ] Güncelleme endpoint'i HTTPS'tir.

Linux dağıtım paketinin GPG/repository imzası, Tauri updater imzasından ayrı bir dağıtım kanalı sorumluluğudur.

## 6. Yerel masaüstü smoke testi

```bash
npm run tauri:dev
```

En az şu akışlar elle denenmelidir:

- Uygulamanın Python kurulmamış temiz profilde ilk açılışı
- Ayarlar ekranında Python kaynağının `Uygulamaya gömülü` görünmesi
- Tek ve çok dosyalı görevlerin güvenli sandbox içinde çalışması
- Mevcut SQLite ilerlemesinin yüklenmesi
- Uygulamayı kapatıp yeniden açınca ilerlemenin korunması

## 7. Uygulama içi güncelleme testi

- [ ] Ayarlar ekranı kendiliğinden ağ isteği başlatmaz.
- [ ] Kullanıcı `Güncellemeleri denetle` eylemini açıkça seçer.
- [ ] Yeni sürüm, tarih ve release notları gösterilir.
- [ ] Kurulum için ikinci açık onay gerekir.
- [ ] İndirmeden önce yerel SQLite ilerleme yedeği oluşturulur.
- [ ] Hatalı imzalı veya değiştirilmiş artifact kurulamaz.
- [ ] Başarılı kurulumdan sonra uygulama kontrollü biçimde yeniden başlar.
- [ ] Tarayıcı ön izlemesinde updater çağrısı yapılmaz.

## 8. Veri ve migration güvenliği

- [ ] Yeni sürüm eski SQLite ilerleme verisini açabilir.
- [ ] Veri tabanı tablosu veya anlamı değiştiyse migration testi eklenmiştir.
- [ ] Güncelleme öncesi otomatik yedek görünür durumdadır.
- [ ] Güncelleme XP ve tamamlanan dersleri sıfırlamaz.
- [ ] Kritik hata halinde kullanıcı yedekten geri yükleme yapabilir.

## 9. Yayın sonrası

- [ ] GitHub Release taslakları ve eski preview asset'leri incelenir.
- [ ] Production release taslak değildir ve prerelease değildir.
- [ ] Windows, Linux, macOS Apple Silicon ve macOS Intel indirmeleri açılır.
- [ ] Temiz cihazlarda kurulum, ilk açılış ve mevcut veriyle güncelleme test edilir.
- [ ] Ayarlar ekranındaki güncelleme denetimi yeni sürümü doğru görür.
- [ ] Kritik sorun halinde release geri çekme ve önceki installer'a dönüş planı uygulanır.
