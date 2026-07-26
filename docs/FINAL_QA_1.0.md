# Python Farming 1.0 Final QA

Bu belge 1.0.0 kaynak sürümünün kapanış kapılarını ve genel dağıtımdan önce kalan operasyonel kontrolleri ayırır.

## Otomatik olarak doğrulanan kapılar

- [x] package.json, package-lock.json, Tauri, Cargo, Cargo.lock ve arayüz sürümü 1.0.0
- [x] TypeScript typecheck
- [x] Bütün Vitest testleri
- [x] Production frontend build
- [x] Rust format kontrolü
- [x] cargo test --all-targets --locked
- [x] Eski SQLite ilerlemesini koruyan migration testi
- [x] Daha yeni ve desteklenmeyen şemayı reddetme testi
- [x] Gerçek Linux .deb paketi üretimi
- [x] .deb içindeki taşınabilir Python ile asyncio, json ve sqlite3 smoke testi
- [x] Release workflow dry-run ve etiketli release ayrımı
- [x] Dört platform hedefi ve SHA-256 manifest sözleşmesi

## Finalizasyon kanıtı

- Tek kullanımlık finalizasyon job'u sürüm kaynaklarını ve iki lockfile'ı repository içinde güncelledi.
- `npm ci` kilitli bağımlılıklarla başarılı oldu.
- `npm run verify` tam kalite kapısı başarılı oldu.
- 64 Vitest dosyasında toplam 271 test geçti.
- Rust format kontrolü ve `cargo test --all-targets --locked` aynı final çalışma alanında geçti.
- Geçici finalizasyon workflow'ları ürün commit'inden çıkarıldı.
- Merge kararı ayrıca son head commit üzerindeki bağımsız PR CI sonucuna bağlıdır.

## Taslak release oluşturulmadan önce

- [ ] Actions → Release dry-run çalıştırması dört platformda yeşil
- [ ] Artifact dosya adları, mimarileri, boyutları ve SHA-256 değerleri kontrol edildi
- [ ] Windows installer temiz kullanıcı profilinde açıldı
- [ ] Linux installer temiz kullanıcı profilinde açıldı
- [ ] macOS Apple Silicon paketi temiz kullanıcı profilinde açıldı
- [ ] macOS Intel paketi temiz kullanıcı profilinde açıldı
- [ ] Uygulama Python kurulu olmayan profilde gömülü runtime ile çalıştı
- [ ] Tek dosya, çok dosya, stdin, asyncio, json ve sqlite3 smoke akışları geçti
- [ ] 0.1.x verisiyle yükseltme ve yeniden açılış ilerlemeyi korudu

## Herkese açık installer dağıtımından önce

- [ ] Windows Authenticode sertifikası ve imzalama sırrı yapılandırıldı
- [ ] Apple Developer ID sertifikası yapılandırıldı
- [ ] macOS notarizasyonu ve stapling tamamlandı
- [ ] İmzalı paketler temiz makinelerde tekrar doğrulandı

Kaynak sürümü, testler ve unsigned/ad-hoc installer üretim hattı tamamlanmıştır. Yukarıdaki işaretlenmemiş maddeler erişim gerektiren gerçek cihaz, sertifika ve yayın operasyonlarıdır; tamamlanmadan imzalı installer desteği varmış gibi beyan edilmemelidir.
