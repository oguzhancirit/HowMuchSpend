# HowMuchSpend

iPhone için Türkçe gelir, gider ve tekrar eden ödeme takvimi.

Canlı uygulama: https://howmuchspend.ozicirit9.chatgpt.site

## Kullanım

- `+` ile gelir/gider ekle; TL, EUR ve USD ayrı toplamlarla izlenir.
- Yeşil takvim hücresi: tüm kayıtlar tamamlandı. Amber: bekleyen kayıt var.
- Karışık günün küçük yeşil işareti, bazı kayıtların tamamlandığını gösterir.
- Mevcut aylık özetler, banka görselleri ve takvim ölçüleri korunur.
- Aylık, haftalık ve yıllık tekrarlar otomatik hesaplanır. Kısa aylar ayın son gününe sabitlenir.

## Kurtuluş

Analiz sekmesi yerine kişisel kredi kartı borcu kapatma planı. TL bazında, cihaz içinde çalışır; plan/ekstreler sunucuya gönderilmez.

- 3 adımlı kart formu: ekstre tutarının asgari mi dönem borcu mu olduğu, gerçek kalan borç, ekstre ayı, bu ay yansıyan faiz + vergi, vergiler dahil aylık maliyet oranı, asgari oranı ve mevcut ödeme.
- Oran bilinmiyorsa, masrafın uygulandığı devreden borç matrahı kullanıcı tarafından girilerek gözlenen aylık maliyet tahmin edilir. Güncel borç matrah yerine otomatik kullanılmaz.
- Takvim bağlantısı: yalnızca bağlı, bekleyen TL kart ödemeleri diğer giderlerden çıkarılır. Yapılmış kart ödemeleri ve plan dışındaki kartlar giderde kalır; EUR/USD dönüştürülmez. Gelir/gider ve tampon kullanıcı tarafından onaylanır.
- Önce tüm kartların asgarileri; sonra en yüksek maliyet veya en küçük borç önceliği. Asgari karşılanmıyorsa bütçe açığı gösterilir, eksik ödeme önerilmez.
- İlk dönem zaten ekstreleşmiştir: mevcut masraf tekrar eklenmez. Sonraki dönemlerde faiz/vergi yalnız devreden anaparaya uygulanır; masrafa tekrar faiz işletilmez. Gelecek taksitler vadesinde eklenir. Yeni harcama sonraki dönemden başlar.
- Sabit bütçe/maliyet/asgari oranı ile, zamanında ödeme varsayımı altında 120 aya kadar kuruş hassasiyetli aylık simülasyon. Kapanış yoksa tarih uydurulmaz. Günlük faiz, ödeme günü, işlem türü ve banka oranı değişimleri gerçek tutarı değiştirebilir.
- Yalnızca asgari / mevcut sabit ödeme / seçilen plan karşılaştırması, 3 ay hedefi için gereken ödeme, bu ay kart dağılımı, gelecek maliyet ve ay ay tablo/CSV.
- Her ekstre güncellemesi kart ve ay bazında maliyet geçmişini değiştirir; aynı ay iki kez toplanmaz. Yeni ayda bakiyeler güncellenmeli; takvimde ödendi işareti banka borcunu otomatik hesaplamaz.
- `howmuchspend.recovery.v1` ayrı, doğrulanmış yerel veri alanıdır. Eski finansal kayıtlar korunur. Plan için ayrı JSON yedek/geri yükleme bulunur. Kurgusal 23.000 → 27.000 TL örneği gerçek veri olarak kaydedilmez.

Finansal model kaynakları (10.10.2026 kontrolü): [TCMB azami faiz oranları](https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB%2BTR/Main%2BMenu/Istatistikler/Bankacilik%2BVerileri/Kredi_Karti_Islemlerinde_Uygulanacak_Azami_Faiz_Oranlari), [Akbank faiz/ücretler](https://www.akbank.com/urun-ve-hizmet-ucretleri). Resmi üst sınır banka/vergiler dahil kişisel oran olarak otomatik seçilmez; ekstre esas alınır.

## iPhone bildirimleri

1. iOS 16.4 veya üstünde, uygulamayı Safari'den Ana Ekrana Ekle.
2. **Mevcut ana ekran simgesinden** gir. Ayarlar → Bildirimler → Bildirimleri aç.
3. iOS izin penceresinde İzin Ver'i seç, ardından Test bildirimi'ne dokun.

Ödeme günü Türkiye saatiyle **08:30, 12:00 ve 17:00** olmak üzere üç hatırlatma. Aynı saatlerde beklenen gelirler de hatırlatılır. Ödendi/alındı olarak işaretlenen ve eşitlenen kayıtlar sonraki gönderimlerden çıkarılır. Bulut görevi gecikebilir; kesin dakika teslimatı garantisi yoktur.

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

Sites'e bağlı günde üç kez çalışan görev, mevcut owner-private platform erişimini kullanır; GitHub'a servis anahtarı eklenmez. `/api/push/private-dispatch` yalnızca `SITES_PRIVATE_SCHEDULER=1` ile etkinleşir. Sites özel erişim kapısı yetkilendirmeyi Worker'dan önce uygular. Görev her çalışmada mevcut erişim politikasını doğrular; owner-private değilse işlem yapmaz. **Site paylaşımını değiştirmeden önce bu entegrasyonu ve görevi kapat.** `/api/push/private-test`, aynı özel erişim sınırında etkin cihazlara gerçek Web Push testi gönderir.

`push_state.last_dispatch` son kontrol zamanıdır. Görev 08:30/12:00/17:00 çalışır; her ödeme ve saat için ayrı gönderim kilidi vardır. Kaçırılan slotlar toplu gönderilmez, önceki günler tekrar hatırlatılmaz. Eski istemcilerin gün-öncesi ayarı sunucuda ödeme gününe sabitlenir. On sekiz saati geçen gecikme uygulamada gösterilir. `last_test_result` sadece hata aşaması/sağlayıcı kodu içerir; abonelik adresleri, anahtarlar veya finansal veri içermez. Başarısız test 15 saniye sonra, başarılı test 60 saniye sonra tekrar denenebilir.

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

## UX/UI — 1.5.0 (10 October 2026)

The refresh covers the calendar, transaction form, records, recovery planner and settings. The established palette, original calendar cell dimensions, income/expense summaries, bank artwork and central add button are retained. In 1.5.1, the previous application font stack is restored. Calendar day numbers use the iPhone system font with larger numerals, quieter weekends and a compact today circle, based on the supplied iPhone Calendar reference.

| Reference reviewed | Observed pattern | Application here |
| --- | --- | --- |
| [Copilot design refresh](https://www.copilot.money/dispatch/liquid-glass), released 15 September 2025 | iOS 26 styling with light/dark modes | A restrained translucent mobile navigation surface and moving selection indicator, using the existing colors |
| [Copilot dashboard guide](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview), updated 14 April 2026 | Upcoming recurring items and direct transaction editing | Pending-only queue with clear due-date priority and a shortcut to all pending records |
| [Monarch recurring calendar](https://www.monarch.com/track-recurring-bills-and-subscriptions) | Calendar/list views, payment confirmation and recognizable logos | Preserve the working calendar while making selected-day details and status controls easier to use |
| [Monarch Pay Down Goals](https://help.monarch.com/hc/en-us/articles/44373293932052-Using-Pay-Down-Goals), updated 24 June 2026 | Separate payoff planning, comparison and budget linkage | Result-first recovery layout, expandable card management, and an affordable payment slider preview |
| [YNAB payoff simulator](https://www.ynab.com/blog/ynab-loan-planner), updated 19 May 2025 | Experiment with payment amounts and compare time/cost | Preview a new monthly payment, then explicitly press Calculate; do not change the payment ledger |
| [Apple motion guidelines](https://developer.apple.com/design/human-interface-guidelines/motion), [Material motion](https://m3.material.io/styles/motion), [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Using_for_accessibility) | Motion follows an interaction; reduced-motion support | Brief directional month changes, form entrances, payment feedback and interruptible transitions |

Records now group by date and expose paid/pending filters directly. The entry form combines amount and currency, offers date shortcuts and shows a formatted confirmation preview. Notification controls stay visible in Settings; setup explanations are expandable. A separate motion preference can reduce effects, and the OS reduced-motion preference always wins. No infinite decorative animations, extra runtime dependency or analytics service is added.

Validation: 57 automated checks cover ledger retention, exact EUR/TRY amounts, composed filters, anchored repeat dates, reminder scheduling, recovery calculations, explicit slider confirmation, interrupted motion and reduced-motion fallbacks. The build artifact checks embedded application, motion and font assets. Physical iPhone and browser visual QA have not been performed in this environment because the supported browser controller is unavailable.
