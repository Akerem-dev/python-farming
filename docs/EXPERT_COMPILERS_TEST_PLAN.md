# Test planı

PR tamamlanmadan önce şu kapılar yeşil olmalıdır:

- TypeScript typecheck
- tüm Vitest içerik ve entegrasyon testleri
- production frontend build
- rustfmt
- kilitli Rust runtime testleri
- gerçek Linux installer smoke testi
- Statik Kod Denetim Laboratuvarı referans çözümünün geçmesi
- sabit rapor ve AST kullanmayan zayıf çözümlerin reddedilmesi
