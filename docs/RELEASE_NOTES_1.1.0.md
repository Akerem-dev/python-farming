# Python Farming 1.1.0

## Özet

Python Farming 1.1.0, 1.0.0 çalışma motoru ve veri güvenliği temelinin üzerine 6 modüllük Uzman Seviye öğrenme yolunu ekler. Bu sürüm yeni bir görsel vitrin değil; gerçek Python davranışı, gizli testler ve çok dosyalı final projeleriyle doğrulanan eğitim kapsamı genişlemesidir.

Tam müfredat; Başlangıç, Orta Seviye, İleri Seviye ve Uzman Seviye yollarına dağıtılmış 32 yayınlanmış modül paketinden oluşur.

## Yeni Uzman Seviye yolu

1. Algoritmalar ve Karmaşıklık
2. Paralellik ve Sistem Programlama
3. AST, Derleyiciler ve Metaprogramlama
4. Dağıtık Sistemler ve Dayanıklılık
5. Güvenlik ve Gözlemlenebilirlik
6. Uzmanlık Projesi — Güvenilir Kod Analiz Platformu

Uzman yolu İleri Seviye mezuniyetinden sonra açılır. İlk beş modül uzman mezuniyet puanının %95'ini, final proje son %5'i verir. Final proje tamamlandığında Python Farming Uzman Seviye Mezunu rozeti kazanılır ve ana sayfada Tüm müfredat — Tamamlandı durumu gösterilir.

## Doğrulama kapsamı

- TypeScript typecheck ve bütün Vitest testleri
- gerçek Python davranış entegrasyon testleri
- sabit çıktı ve bypass çözümlerini reddeden gizli senaryolar
- production frontend build
- Rust format ve kilitli hedef testleri
- gömülü Python içeren gerçek Linux installer smoke testi

## Uyumluluk

1.0.0 ile oluşturulan SQLite ilerleme verisi, yedekler ve dışa aktarma dosyaları korunur. Uzman dersleri mevcut ilerleme tablosuna yeni ders kimlikleri olarak eklenir; eski XP veya tamamlanan dersler sıfırlanmaz.

## Bilinen dağıtım sınırlamaları

Windows Authenticode imzası ve macOS Developer ID/notarizasyon sırları repository'de yapılandırılmamıştır. Kaynak kodu, test hattı ve unsigned/ad-hoc installer üretimi doğrulanmıştır; herkese açık dağıtım öncesinde platform imzalama adımları ayrıca tamamlanmalıdır.
