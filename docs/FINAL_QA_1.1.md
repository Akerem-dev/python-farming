# Python Farming 1.1 Final QA

Bu belge v1.1.0 etiketi oluşturulmadan önce uygulanacak son kullanıcı ve ürün doğrulamalarını tanımlar. Otomatik CI geçişi tek başına imzalı genel dağıtım onayı değildir.

## Otomatik kapılar

- [ ] npm ci
- [ ] npm run verify
- [ ] dört platformlu release dry-run
- [ ] SHA-256 manifest doğrulaması
- [ ] Linux installer içinde gömülü Python smoke testi

## Müfredat doğrulaması

- [ ] Başlangıç, Orta, İleri ve Uzman seviyeleri açılma sırasını koruyor
- [ ] Uzman Seviye 6 modül ve 6/6 tamamlanma hesabı gösteriyor
- [ ] Uzman final projesi sabit çıktı kullanan zayıf çözümü reddediyor
- [ ] Uzman mezuniyet puanı final öncesi en fazla 95, final sonrası 100 oluyor
- [ ] Python Farming Uzman Seviye Mezunu rozeti yalnız final sonrası veriliyor
- [ ] Ana sayfa Tüm müfredat — Tamamlandı durumunu doğru gösteriyor

## Veri uyumluluğu

- [ ] 1.0.0 SQLite ilerleme verisi 1.1.0 ile açılıyor
- [ ] Mevcut XP ve tamamlanan dersler korunuyor
- [ ] yedek oluşturma, geri yükleme ve JSON dışa/içe aktarma çalışıyor

## Dağıtım sınırları

İşaretlenmemiş maddeler tamamlanmış sayılmaz. Windows Authenticode ve macOS notarizasyonu doğrulanmadan imzalı installer desteği varmış gibi beyan edilmemelidir.
