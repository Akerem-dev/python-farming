# Python Farming 1.0.0

Python Farming 1.0.0, başlangıçtan ileri seviyeye kadar Python öğretmek için geliştirilen ilk kararlı kaynak sürümüdür.

## Öne çıkanlar

- React, TypeScript, Vite ve Tauri 2 tabanlı masaüstü deneyimi
- CodeMirror 6 üzerinde tek ve çok dosyalı Python çalışma alanları
- Installer'a gömülü, SHA-256 doğrulamalı taşınabilir Python runtime'ı
- Çalışma alanı dışı dosya erişimi, ağ, subprocess, fork/spawn, symlink ve ctypes yüklemelerini sınırlayan ortak audit sandbox
- Timeout sırasında Unix process group veya Windows process tree sonlandırması
- Davranışsal, AST tabanlı ve gerçek Python entegrasyon testleriyle görev doğrulama
- Başlangıç, Orta Seviye ve İleri Seviye eğitim yolları ile mezuniyet projeleri
- SQLite ilerleme kaydı, yedekleme, geri yükleme, dışa/içe aktarma ve güvenli sıfırlama
- Sürümlü SQLite migration'ı ve eski ilerlemeyi koruyan uyumluluk testleri
- Windows, Linux ve iki macOS mimarisi için dry-run/tag ayrımlı release matrisi
- Installer başına SHA-256 release manifesti

## Doğrulama

- TypeScript typecheck
- Bütün Vitest unit, content ve integration testleri
- Production frontend build
- Rust format kontrolü
- Kilitli bağımlılıklarla bütün Rust hedef testleri
- Gerçek Linux .deb paketi ve gömülü Python smoke testi

## Bilinen dağıtım sınırlamaları

- Windows Authenticode imzası yapılandırılmamıştır.
- macOS Developer ID imzası ve notarizasyonu yapılandırılmamıştır; dry-run paketleri ad-hoc imzalı olabilir.
- Python audit hook'u işletim sistemi veya sanal makine seviyesinde güven sınırı değildir; uygulama düşmanca genel amaçlı kod barındırma servisi olarak kullanılmamalıdır.
- Uzman Seviye içerikleri ayrı ürün yolunda geliştirilecektir.

## Yükseltme

0.1.x geliştirme ön izlemesinden yükseltmede mevcut SQLite ilerleme verisi korunur ve şema sürümü otomatik olarak 1'e taşınır. Güncelleme öncesinde Ayarlar ekranından ilerleme yedeği veya JSON dışa aktarması alınması önerilir.
