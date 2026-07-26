# Python Çalışma Motoru Güvenliği

Bu belge Python Farming içinde öğrenci kodunun nasıl sınırlandırıldığını, hangi tehditlerin ele alındığını ve hangi risklerin bilinçli olarak kapsam dışında kaldığını açıklar.

## Güvenlik hedefi

Çalışma motoru; eğitim görevleri sırasında yanlışlıkla veya basit kötüye kullanımla oluşabilecek şu davranışları engellemeyi hedefler:

- çalışma alanı dışındaki kullanıcı ve uygulama dosyalarını okuma, değiştirme veya silme,
- ağ bağlantısı açma, dinleme veya veri gönderme,
- `subprocess`, `os.system`, spawn, fork veya pty ile yeni süreç başlatma,
- `ctypes` üzerinden yerel kütüphane yükleme,
- sembolik bağlantıyla çalışma alanı dışına kaçma,
- sonsuz çalışma, aşırı çıktı, aşırı dosya üretimi veya büyük disk kullanımı,
- timeout sonrasında arka planda çocuk süreç bırakma,
- ana uygulamanın çevre değişkenlerini öğrenci koduna aktarma.

## Uygulanan katmanlar

### İstek başına çalışma alanı

Her çalıştırma benzersiz bir geçici klasörde başlatılır. Unix sistemlerinde klasör izinleri `0700`, oluşturulan dosyalar `0600` olarak ayarlanır. İstek tamamlandığında klasör silinir.

### Ortak Python audit politikası

Tek dosyalı görevler ve çok dosyalı projeler aynı `sys.addaudithook` politikasıyla çalışır. Politika:

- çalışma alanı dışındaki dosya okuma ve yazmayı,
- dış klasör listeleme ve taramayı,
- rename/link/symlink ve dosya sistemi mutasyonlarını,
- socket olaylarını,
- dış süreç ve fork olaylarını,
- `ctypes` dinamik kütüphane yüklemelerini

reddeder. Python standart kütüphanesinin ve gömülü runtime'ın kendi dosyaları yalnız okunabilir kökler olarak tanınır.

### Çevre izolasyonu

Çocuk süreç `env_clear` ile başlatılır. Yalnız platformun Python'ı başlatmak için ihtiyaç duyduğu sınırlı sistem/locale değerleri korunur. `HOME`, `USERPROFILE`, `TEMP`, `TMP` ve `TMPDIR` çalışma alanına yönlendirilir; `PATH` boşaltılır; kullanıcı site paketleri kapatılır.

### Süreç ağacı yönetimi

Unix'te öğrenci kodu ayrı process group içinde çalışır. Windows'ta yeni process group oluşturulur. Timeout, izleme hatası veya çalışma alanı kotası aşımında Unix process group bütünü `SIGKILL` ile; Windows süreç ağacı `taskkill /T /F` ile durdurulur.

### Kaynak sınırları

- çalışma süresi: en fazla 10 saniye,
- stdout: 256 KB,
- stderr: 256 KB,
- çalışma alanı: en fazla 16 MB,
- çalışma alanı dosyası: en fazla 512,
- tek dosya kaynak kodu: 128 KB,
- çok dosyalı proje içeriği: 256 KB.

Limit ihlalleri `EXECUTION_TIMEOUT`, `OUTPUT_TRUNCATED`, `WORKSPACE_LIMIT_EXCEEDED` veya `SANDBOX_POLICY_VIOLATION` tanılama kodlarıyla kullanıcıya bildirilir.

## Release öncesi zorunlu denemeler

Temiz masaüstü build'inde en az şu senaryolar doğrulanmalıdır:

1. Çalışma alanındaki normal dosya okuma/yazma başarılı olur.
2. Çalışma alanı dışındaki bilinen bir dosyayı okumak `PermissionError` üretir.
3. `socket.socket()` ve bağlantı denemeleri reddedilir.
4. `subprocess.Popen`, `os.system` ve platform spawn/fork çağrıları reddedilir.
5. `ctypes.CDLL` reddedilir.
6. Sembolik bağlantı oluşturma reddedilir.
7. Sonsuz döngü timeout olur ve arka planda süreç kalmaz.
8. 16 MB veya 512 dosya kotası aşımı bütün süreç ağacını durdurur.
9. Tek ve çok dosyalı görevler aynı tanılama kodlarını üretir.

## Bilinçli sınırlar

Python audit hook'u işletim sistemi çekirdeği seviyesinde sandbox değildir. Python veya yerel runtime içinde gelecekte keşfedilecek bir güvenlik açığı audit politikasını aşabilir. Bu nedenle:

- uygulama güvenilmeyen internet kullanıcılarına genel amaçlı kod çalıştırma servisi olarak sunulmamalıdır,
- çalışma motoruna yüksek değerli sırlar veya erişim anahtarları bulunan bir çevre verilmemelidir,
- geniş ölçekli düşmanca kod çalıştırma için ayrı düşük ayrıcalıklı kullanıcı, işletim sistemi sandbox'ı, container veya sanal makine kullanılmalıdır.

Aşama 39, masaüstü eğitim ürünü için savunma derinliğini ciddi biçimde artırır; mutlak izolasyon iddiasında bulunmaz.
