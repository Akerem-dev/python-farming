# Aşama 36 — Yedek geri yükleme ve silme

Bu aşama yerel SQLite ilerleme yedekleri için kullanıcı kontrollü geri yükleme ve silme akışını ekler.

## Güvenlik sözleşmesi

- Yalnız uygulamanın ürettiği `progress-<timestamp>-<pid>.db` kimlikleri kabul edilir.
- Path traversal ve uygulama dışı dosya adları reddedilir.
- Geri yüklenecek yedek önce salt okunur SQLite bağlantısıyla `PRAGMA quick_check` ve şema kontrolünden geçer.
- Mevcut ilerleme veritabanı geri yüklemeden önce otomatik güvenlik yedeğine alınır.
- Yedek aynı veri klasöründe geçici dosyaya hazırlanır; önceki veritabanı rollback dosyası olarak korunur.
- Yeni veritabanı doğrulanamazsa önceki kayıt geri alınır.
- Bozuk yedekler geri yüklenemez, ancak kullanıcı onayıyla silinebilir.
- Geri yükleme sonrasında frontend ilerleme store'u SQLite'dan yeniden yüklenir.
