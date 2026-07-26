# Build-time portable Python placeholder

Bu dosya, normal `cargo test` ve geliştirme kontrollerinde Tauri resource glob'unun boş kalmamasını sağlar.

Production paketleme başlamadan önce `npm run prepare:runtime` bu klasörü temizler ve SHA-256 doğrulaması yapılmış gerçek Python runtime ağacını yerleştirir.
