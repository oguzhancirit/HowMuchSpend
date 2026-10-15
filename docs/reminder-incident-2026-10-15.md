# DebTracker — 15 Ekim 2026 bildirim incelemesi

Tüm olay saatleri Europe/Istanbul (UTC+03:00). İncelenen canlı sürüm v1.9.3/build31; Sites kaynak commit a903a4635f23b22f89fb576c0b78df3ea2d4aa5b. Testler ayrı bir Git worktree içinde, sentetik kayıtlar ve geçici SQLite veritabanlarıyla çalıştırıldı. Üretim kodu, finansal kayıtlar, izinler ve abonelikler değiştirilmedi. Bir adet açıkça test içerikli canlı bildirim gönderildi; sunucu test sonucunu kaydetti.

## Sonuç

Sabah kaybının kesin nedeni, zamanlayıcı/gönderici uyumsuzluğu: kontrol 08:30'dan önce yapıldı, sunucu doğru olarak henüz zamanı gelmeyen bildirim göndermedi, fakat kontrol `HTTP 200 / ok:true / sent:0` ile tamamlanmış sayıldı. Bu çağrı daha sonra çalışacak bir iş oluşturmaz.

Öğle için kanıtlanan nokta, göndericiye isteğin ulaşmamış olmasıdır. Bulut görevinin neden başlamadığı veya gönderici çağrısından önce neden durduğu erişilebilir araçlarla belirlenemedi. Bunu kesinleşmiş bir saat kuralı, Apple veya telefon hatası gibi sunmak doğru olmaz.

İzleme açığı: `schedulerReady`, son 18 saatte herhangi bir `last_dispatch` kaydı olup olmadığına bakıyor. Erken ve sıfır gönderimli kontrol de bu kaydı güncellediği için atlanan öğle çalışmasını gösteremiyor. Buradaki değer, üç ayrı saatin başarıyla işlendiğinin kanıtı değildir.

## Doğrudan canlı kanıt

15 Ekim için yaklaşık 04:40–19:40 aralığında, en fazla 100 olay isteyen sorgu 33 Worker olayı döndürdü; başarısız Worker olayı bulunmadı. Bu sınırlı erişilebilir kayıt aralığında:

| Saat | Olay | Bulgusu |
|---|---|---|
| 08:28:36 | POST /api/push/private-dispatch, HTTP 200 | Sabah 08:30'dan önce. Çalışma yanıtı 0 gönderim / 0 hata; kalıcı last_dispatch 08:28:35.782. Request ID: b5322f5b099cf2357f32932015387d50. |
| 12:00 çevresi | Gönderici POST kaydı bulunamadı | Öğle için teslimat satırı da yok. Görev motorunun iç yürütme geçmişi erişilebilir değil. |
| 17:00:12 | POST /api/push/private-dispatch, HTTP 200 | Çalışma sonucu 2 gönderim / 0 hata. last_dispatch ve iki kalıcı sent satırı 17:00:10.679. Request ID: 17e9172c97e1c6bc157456ea8386c4b3. |
| 19:40:51.989 | Yetkili private-test | API HTTP 200; kalıcı last_test_result: stage=provider, ok=true, providerStatus=201. Apple servisi mevcut abonelik için test bildirimini kabul etti. |

Log sorgusunun kapsadığı zaman aralığında öğle isteğinin görünmemesi, istek gönderilmeden önceki aşamaya işaret eder. Platform loglarının tamlığı ve görev motorunun iç durumu bağımsız olarak doğrulanamadı. Son eşitlenen hatırlatma kuralları geçmiş sabah/öğle durumunun değişmez bir kopyası değildir; bunlardan geçmiş finansal durum çıkarsanmadı.

## İzole test matrisi

| Test | Beklenen / gözlenen |
|---|---|
| Üç saatin tam sınırları | Saatten 1 ms önce gönderim yok; saatinde var; iki saatlik pencere sonunda yok. |
| Gerçek sabah zamanını yeniden üretme | 08:28:35.782: HTTP 200, ok=true, sent=0, failed=0; heartbeat ilerler; bekleyen gönderim işi oluşmaz. |
| Erken öğle / erken akşam | 11:58 ve 16:58: sıfır gönderim, geleceğe bırakılan iş yok. Bunlar sentetik senaryolardır; gerçek öğle çalışma saati olarak iddia edilmez. |
| Saatten sonra tekrar deneme | 08:30'da bir kez gönderir; 08:31'de aynı kayıt tekrar gönderilmez. |
| Gelir ve gider, üç bağımsız saat | İki sentetik kayıt x üç saat = altı kabul; ertesi gün tek seferlik kayıt tekrarlanmaz. |
| Öğle çağrısı yapılmazsa | Akşam yalnız 17:00 kaydı oluşur; kaçırılmış öğle topluca gönderilmez. |
| Sabah sonrası ödeme | Öğle ve akşam gönderilmez; sabah geçmişi korunur. |
| Gönderim hakkı alındıktan sonra ödeme | Gerçek gönderim öncesi yeniden kontrol iptal eder. |
| Aynı anda iki kontrol | Atomik hak kaydı sayesinde yalnız bir gönderim. |
| Kapalı abonelik / atlanmış / ödenmiş kayıt | Bildirim servisine istek yok. |
| Geçici Apple 503 yanıtı | Hata olarak işaretlenir; bekleme süresi içinde tekrar yok; sonra başarılı tekrar yalnız bir kez. |
| Süresi bitmiş Apple 410 aboneliği | Devre dışı kalır, sonraki saatte tekrar denenmez. |
| Yanıltıcı hazır göstergesi | Sabah erken heartbeat varken 12:05'te hiç teslimat olmadan schedulerReady=true döndüğü doğrulandı. |

Yeni test dosyasında 13/13 test geçti. Mevcut testlerle birlikte 129/129 test geçti. Çalıştırma: `node --test tests/reminder-incident.test.mjs` ve `npm test`. Tam paket 517 ms; bu yerel test süresidir, iPhone performans ölçümü değildir.

## Zamanlama kuralı ve düzeltmenin sınırı

Mevcut RRULE, bağımsız dateutil açılımında 16 Ekim için tam olarak 08:30, 12:00, 17:00 üretir. Dolayısıyla eldeki kanıt, BYSETPOS kuralının mantıksal olarak yanlış olduğunu göstermiyor. Sabah saatinden erken başlayan gerçek çalışma kanıtlanmıştır.

Önceki düzeltmede mevcut tek etkin görev korundu; prompt artık hedef saatten en fazla 10 dakika erken başlayan çalışmanın aynı çalışma içinde en fazla 30 saniyelik adımlarla saati beklemesini ve erken sıfır gönderimi tamamlanma saymamasını istiyor. Bekleme sonrası Site erişimi yeniden doğrulanıyor. Ödenmiş kaydı atlama ve gönderim tekrarını engelleme sunucuda korunuyor. Bu talimatın yarınki gerçek zamanlı yürütmesi henüz gözlenmedi; platformun hiç başlatmadığı bir görevi bu talimat düzeltemez.

Üç ayrı günlük görev denemesi hesapta 5 zamanlanmış görev sınırı nedeniyle reddedildi. Eski görev yeniden üç saate ayarlandı; oluşturma denemesinden kalan öğle kaydı kapalı. Bir etkin DebTracker görevi var; başka kullanıcı görevleri durdurulmadı.

## Gereken kalıcı mimari iyileştirmeler

1. Her slot için finansal içerik içermeyen çağrı/karar kaydı: çağrı saati, hedef slot, erken/uygun/geç kararı, aday ve gönderim sayısı, hata aşaması. Tek heartbeat yerine son beklenen slotun gerçekten işlendiğini kontrol et.
2. Erken çağrının sonucunu yalnız `ok:true` olarak yorumlama: açık `not_due` ve `next_due_at` bilgisiyle çalışmayı saati gelene kadar sürdür. Erken bildirim göndermek çözüm değildir.
3. Görevin hiç tetiklenmemesi için uygulama sunucusunun desteklediği bağımsız bir zamanlayıcı gerekir. Bunun dağıtım desteği ve erişimi doğrulanmadan mevcut görevlerin yerine kurulmuş gibi raporlanamaz. Telefonun uygulamayı açmasına veya sekmedeki setTimeout'a güvenilmez.

Bu inceleme üretimde yeni bir zamanlayıcı veya izleme özelliği kurmadı. Güvenilir bir neden bulunamayan öğle platform olayı açık kalmaktadır. Apple 201 yanıtı servis kabulüdür; kilit ekranında gösterim/teslim alındısı değildir. Bu test, kullanıcının Odak/telefon bildirim tercihlerini veya o anda fiziksel ekranda gösterimi ölçmez.
