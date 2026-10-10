# HowMuchSpend

iPhone için Türkçe gelir, gider ve tekrar eden ödeme takvimi.

Canlı uygulama: https://howmuchspend.ozicirit9.chatgpt.site

## Kullanım

- `+` ile gelir/gider ekle; TL, EUR ve USD ayrı toplamlarla izlenir.
- Yeşil takvim hücresi: tüm kayıtlar tamamlandı. Amber: bekleyen kayıt var.
- Karışık günün küçük yeşil işareti, bazı kayıtların tamamlandığını gösterir.
- Mevcut aylık özetler, banka görselleri ve takvim ölçüleri korunur.
- Aylık, haftalık ve yıllık tekrarlar otomatik hesaplanır. Kısa aylar ayın son gününe sabitlenir.

## iPhone bildirimleri

1. iOS 16.4 veya üstünde, uygulamayı Safari'den Ana Ekrana Ekle.
2. **Mevcut ana ekran simgesinden** gir. Ayarlar → Bildirimler → Bildirimleri aç.
3. iOS izin penceresinde İzin Ver'i seç, ardından Test bildirimi'ne dokun.

Varsayılan: ödeme tarihinden 1 gün önce, Türkiye saatiyle 09:00 sonrası. 0/1/3/7 gün seçilebilir. Aynı sistem beklenen gelirleri de hatırlatır. Sites'e bağlı saatlik görev zamanı gelen hatırlatmaları kontrol eder. Gönderim 09:00 sonrası gerçekleşir; kesin dakika garantisi yoktur.

Ödenen, alınan, silinen ve atlanan kayıtlar eşitleme tamamlandıktan sonra bildirimden çıkarılır. Çevrimdışı değişiklikler bağlantı gelince tekrar gönderilir; eşitlenene kadar sunucu önceki durumla çalışır ve uygulama uyarı gösterir. Bildirim geldiğinde kayda dokunarak ilgili gün ve işlemi açabilirsin.

Ana ekran uygulamasını silme veya tarayıcı verilerini temizleme: bu işlemler cihazdaki kayıtları silebilir. Eski `howmuchspend.data.v1` ve tercih anahtarları değiştirilmedi. Bildirim açılmadan önce ek bir yerel yedek alınır; ayrıca JSON dışa aktarma mevcuttur. Safari ve ana ekran uygulamasının kayıt alanları farklı olabilir.

## Sunucu ve gizlilik

- Cloudflare Worker ESM, mevcut uygulama ve görselleri aynı adreste sunar.
- Sites D1 `DB`: cihaz abonelikleri, sınırlı hatırlatma kuralları, gönderim kilitleri.
- Her cihaz rastgele 256 bit yetki anahtarı kullanır. Sunucuda yalnızca SHA-256 özeti saklanır; başka cihazın verisi okunamaz.
- Web Push RFC 8291 AES-128-GCM ile şifrelenir, VAPID RFC 8292 ES256 ile imzalanır.
- Notlar yüklenmez. Kayıt adı ve tutarı varsayılan olarak gizlenir; kullanıcı açarsa hatırlatma kurallarına eklenir.
- Finansal defter cihazda kalır. Sunucu eşitlemesi yalnızca bildirim içindir; cihazlar arasında finansal kayıt birleştirmesi sağlamaz.
- Kapat, bu cihazın sunucu aboneliğini ve gönderim kayıtlarını siler.
- 404/410 süresi dolmuş aboneliği durdurur; geçici hatalar sınırlı tekrar denemeyle işlenir.
- Atomik D1 kilidi ve sabit bildirim etiketi tekrar gönderimini sınırlar. Sağlayıcı kabulü ile kayıt yazımı arasındaki bağlantı kopmasında tam exactly-once garanti edilemez.

## Otomatik gönderim

Sites'e bağlı saatlik görev, mevcut owner-private platform erişimini kullanır; GitHub'a servis anahtarı eklenmez. `/api/push/private-dispatch` yalnızca `SITES_PRIVATE_SCHEDULER=1` ile etkinleşir. Sites özel erişim kapısı yetkilendirmeyi Worker'dan önce uygular. Görev her çalışmada mevcut erişim politikasını doğrular; owner-private değilse işlem yapmaz. **Site paylaşımını değiştirmeden önce bu entegrasyonu ve görevi kapat.** `/api/push/private-test`, aynı özel erişim sınırında etkin cihazlara gerçek Web Push testi gönderir.

`push_state.last_dispatch` son kontrol zamanıdır. Üç saati geçen gecikme uygulamada gösterilir. `last_test_result` sadece hata aşaması/sağlayıcı kodu içerir; abonelik adresleri, anahtarlar veya finansal veri içermez. Başarısız test 15 saniye sonra, başarılı test 60 saniye sonra tekrar denenebilir.

Eski GitHub OIDC endpoint'i ayrı yetki kontrolünü korur; GitHub workflow saatlik cron'u kapalıdır. Sites görevine ek bir GitHub zamanlayıcısı kurulmaz.

Sites runtime değişkenleri: `VAPID_PRIVATE_JWK` (secret), `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `SCHEDULER_REPOSITORY`, `SCHEDULER_REPOSITORY_ID`, `SITES_PRIVATE_SCHEDULER`. Özel VAPID anahtarı depoda veya istemcide bulunmaz. Anahtar değişirse cihazların yeniden abone olması gerekir.

## Geliştirme

Node.js 22+ (SQLite testleri için 22.13+), harici npm bağımlılığı yok.

```sh
npm run check
npm test
npm run build
npm run validate
```

İstemci: `public/`. Sunucu: `worker/`. Build: `dist/server/index.js` (gömülü statik dosyalar). D1 şeması: `drizzle/`; uygulanmış migration'lar değiştirilmez.

Tests: eski verinin korunması, para birimleri, aylık tekrarlar, durum renkleri, RFC şifreleme vektörü, VAPID imzası, SSRF koruması, cihaz yetkileri, OIDC doğrulaması ve bildirim deduplikasyonu/yeniden deneme.

Gerçek iPhone'a teslimat, cihaz sahibinin bildirim izni vermesi ve Test bildirimi ile doğrulanır.
