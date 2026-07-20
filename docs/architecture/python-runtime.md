# Python Runtime Architecture

## Amaç

Python Farming çalışma alanında yazılan kodu cihaz dışına göndermeden çalıştırmak ve sonucu sürümlenmiş bir Tauri IPC sözleşmesiyle React arayüzüne iletmek.

## Aşama 3 veri akışı

```text
CodeMirror editor
  -> Zustand runtime store
  -> runtimeClient
  -> Tauri invoke
  -> Rust runtime command
  -> local Python 3 process
  -> stdout / stderr / exit status
  -> terminal formatter
  -> workspace terminal panel
```

## Yorumlayıcı seçimi

Runtime aşağıdaki sırayı kullanır:

1. `PYTHON_FARMING_PYTHON` ortam değişkeni
2. Windows: `py -3`, `python`, `python3`
3. macOS/Linux: `python3`, `python`

Yalnız `Python 3` ile başlayan başarılı sürüm çıktıları kabul edilir.

## Her çalıştırmada uygulanan sınırlar

- Kaynak kod: en fazla 128 KB
- stdin: en fazla 64 KB
- stdout + stderr kanallarının her biri: en fazla 256 KB gösterim
- İstek timeout'u: 250–10.000 ms arasında sıkıştırılır
- Ders ekranının varsayılan timeout'u: 4.000 ms
- Ayrı geçici çalışma klasörü
- Dosya adında parent path ve güvenli olmayan karakter temizliği
- `PYTHONPATH` ve `PYTHONHOME` kaldırılır
- Python `-I -B` ile başlatılır
- UTF-8 çıktı zorlanır
- Timeout sonrasında child process öldürülür ve beklenir

## Protokol

Frontend ve Rust cevapları `protocolVersion: 1` taşır. Temel durumlar:

- `ok`
- `error`
- `timeout`
- `cancelled` — protokolde ayrılmıştır, henüz uygulanmamıştır

Çalıştırma sonucu:

- stdout
- stderr
- exit code
- duration
- output truncation bilgisi
- diagnostics

## Güvenlik değerlendirmesi

Bu sürüm eğitim akışını ve gerçek CPython davranışını doğrulayan geliştirme runtime'ıdır. `-I` modu, geçici klasör, ortam temizliği, süre ve çıktı sınırları savunma katmanlarıdır; ancak sistem Python süreci hâlâ kullanıcının işletim sistemi yetkileriyle çalışır. Bu nedenle kötü niyetli üçüncü taraf kod için güvenlik sınırı olarak kabul edilmez.

Üretim hedefi:

- uygulamayla paketlenen ve hash doğrulanan CPython
- yalnız uygulama çalışma alanına dosya erişimi
- platforma özel process sandbox
- ağ erişiminin kapatılması
- import allow/deny politikası
- ayrı worker lifecycle ve elle iptal
- paket yükleme politikasının merkezi yönetimi

## Browser davranışı

`npm run dev` yalnız arayüz ön izlemesidir. Tauri IPC mevcut değilse çalışma düğmesi devre dışı kalır ve kullanıcıya `npm run tauri:dev` kullanması gerektiği gösterilir.
