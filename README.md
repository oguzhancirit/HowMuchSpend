# HowMuchSpend

Gelirin, giderin ve ödeme günlerin. Hepsi tek bir takvimde.

iPhone için tasarlanmış, Türkçe, ücretsiz ve bağımlılıksız bir gelir/gider takip web uygulaması. Canlı uygulama: https://howmuchspend.ozicirit9.chatgpt.site

## 1.2.3 işlev odaklı ana ekran

- Sloganlar, büyük giriş başlığı, tanıtım kutuları ve dekoratif alt metinler kaldırıldı.
- Ana ekran doğrudan ay seçimi, filtreler ve geniş takvimle başlar. Mobil takvimin yan boşlukları azaltıldı; gün hücreleri genişledi ve büyüdü.
- Aylık gelir/gider/net özeti takvimin altında tek kompakt satırda tutulur. Seçili gün ve bekleyen kayıtlar aşağıda görünür.
- Merkezi + ekleme akışı, küçük kategori emojileri, banka görselleri ve günlük tutarlar korunur.
- Ayarlar'da bildirimlerin etkin olmadığı açıkça belirtilir. Bu sürüm ödeme bildirimi göndermez; çalışmayan bir izin düğmesi eklenmemiştir.

## 1.2.2 logo ve takvim boyutları

- Koyu zeminde geometrik H monogramı; uygulama başlığı, favicon ve PWA ikonları aynı tasarımı kullanır.
- Aynı günün gelir ve giderleri ayrı yeşil + ve kırmızı − satırlarında görünür; para birimi ortak alt satırdadır. Gün hücresine dokunulduğunda tam ayrıntı açılır.
- Hücre içi yazı boyutu mevcut genişliğe göre ayarlanır; uzun tutarlar hücre dışına taşmaz. Banka görselleri/emojiler küçültülüp hücre içine hizalandı.
- Aylık özet kartlarında tutar, para birimi ve durum metinleri ayrı düzenlenir; dar ekranda taşma önlenir.

## 1.2.1 ana ekran güncellemesi

- Uygulama açılışında, yeniden öne geldiğinde ve bağlantı geri geldiğinde sürüm kontrolü yapılır; aynı anda tek kontrol çalışır.
- Servis çalışanı uygulama kodundan bağımsız yüklenir ve HTTP önbelleği kullanılmadan güncellenir.
- Yeni sürümde otomatik yeniden yüklenir. Açık kayıt/onay penceresi varsa güncelleme kaydedilmemiş işlemi kesmez; üstte güncelleme düğmesi gösterilir.
- Ayarlar içinden sürüm/adres görülebilir ve güncelleme elle kontrol edilebilir.
- HTML çevrimiçiyken yeniden alınır; JS/CSS/model dosyaları aynı sürüm numarasıyla önbelleğe alınır. Yalnızca uygulama kabuğu önbelleği değişir; localStorage kayıtlarına dokunulmaz.
- Eski 1.0 sürümünün bellekte açık kaldığı iPhone'da ilk geçiş için uygulama kartını uygulama değiştiriciden kapatıp aynı ikondan yeniden aç. İkonu veya Safari/site verilerini silmek gerekmez.

## 1.2 düzeltmesi

- İlk sürümün yeşil/koyu renkleri, fontu, takvim ölçüleri, aylık özet kartları ve merkezi + ekleme akışı geri getirildi.
- Banka görselleri korundu; takvimde küçük kategori emojileri, banka görselleri ve günlük tutarlar görünür.
- TL, EUR ve USD kayıtları; `1.000 TL`, `459.000 TL`, `1.250,50 EUR` biçiminde tutarlar.
- Üst menüdeki para birimi seçimi takvim, işlemler, analiz ve CSV için geçerlidir. Farklı para birimleri toplanmaz ve kur dönüşümü yapılmaz.
- Eski kayıtlar TL kabul edilir; mevcut adres, PWA kimliği ve veri saklama anahtarları aynıdır. Tekrarlar, ödeme durumları ve özel düzenlemeler korunur.

## Özellikler

- Aylık takvim, günlük ayrıntı ve liste görünümü; gelir/gider filtreleri.
- Kullanıcı tarafından sağlanan Ziraat, Yapı Kredi ve Akbank görselleri. Bankalara bağlantı kurulmaz.
- Tek seferlik, aylık, haftalık ve yıllık kayıtlar; tarih veya tekrar sayısıyla bitiş.
- Her tekrarın ayrı ödendi/alındı durumu.
- Bir tekrarı veya o tarihten sonraki tekrarları düzenleme; geçmiş kayıtları koruma.
- Planlanan net ve gerçekleşen netin ayrı hesaplanması.
- Kategori dağılımı, ödeme tamamlama oranı ve son 6 ayın planı.
- JSON yedekleme/geri yükleme, seçili ayı Excel uyumlu CSV olarak indirme.
- Koyu/açık tema ve tutar gizleme.
- Ana ekrana eklenebilir PWA; uygulama dosyaları ilk başarılı çevrimiçi açılıştan sonra çevrimdışı kullanım için önbelleğe alınır.
- Açıkça etiketlenmiş, kalıcı kayıtlardan ayrı örnek görünüm.

## Kullanım

1. Takvimde bir günü seç; ortadaki + veya Yeni kayıt düğmesiyle gelir/gider ekle ve para birimini seç.
2. Düzenli ödeme için `Her ay` seç. Taksit için bitişi `Belirli sayıda` yap.
3. Gerçekleştiğinde sağdaki durum düğmesini kullan.
4. Ayarlar bölümünden düzenli JSON yedeği indir.

iPhone: Safari'de aç → Paylaş → Ana Ekrana Ekle. Safari ve ana ekran uygulaması farklı veri alanları kullanırsa JSON yedeği ile taşı.

## Veri saklama ve gizlilik

Uygulama sunucuya finansal veri göndermez. Kayıtlar `localStorage` içinde `howmuchspend.data.v1` anahtarında bu cihaz ve origin için saklanır. Hesap, banka bağlantısı veya cihazlar arası eşitleme yoktur. Site barındırıcısı siteye erişim için ayrıca oturum açılmasını isteyebilir.

Tarayıcı/site verilerini silmek kayıtları kaybettirebilir. Telefon veya adres değiştirirken JSON yedeğini indir ve yeni konumda geri yükle. Geri yükleme mevcut kayıtları değiştirir; öncesinde onay gösterilir ve yedek alma seçeneği sunulur. Kaydetme hatası sessizce başarı olarak gösterilmez.

Bu kaynak kod ve örnek veriler kullanıcıya ait ekran görüntülerini, banka bakiyelerini veya gerçek finansal kayıtları içermez. Banka görselleri kullanıcı tarafından sağlanmıştır; bir banka ortaklığı veya bağlantısı ifade etmez.

## Hesap mantığı

- Tutarlar tam sayı kuruş olarak saklanır.
- Planlanan net = seçili ayın tüm gelirleri − tüm giderleri.
- Gerçekleşen net = alınan gelir − ödenen gider. Banka hesabı bakiyesi değildir; önceki aydan bakiye devretmez.
- Aylık ayın 31'i kaydı şubatta son güne, martta yeniden 31'ine düşer.
- Şubat 29'undaki yıllık kayıt, artık olmayan yıllarda şubat 28'ine düşer.
- Tekrarlar kopyalar oluşturmak yerine kurallardan hesaplanır. Gelecek aylara geçiş kayıtları çoğaltmaz.
- Kredi kartı borcu gider olarak eklenirse aynı alışverişleri ayrıca eklemek toplamda çift sayım oluşturur.
- Varsayılan kayıtlar boştur. Örnek görünüm kurgusaldır ve gerçek verileri değiştirmez.

## Sonraki adım: iPhone bildirimleri

Bu sürüm push bildirimi göndermez. iOS 16.4 ve sonrasında ana ekrana eklenen web uygulaması, kullanıcı uygulama içindeki bildirim düğmesine dokunduğunda izin isteyebilir. Uygulama kapalıyken ödeme öncesi hatırlatma için sunucu zamanlayıcısı, Web Push aboneliği ve servis çalışanında bildirim işleyicisi gerekir; tarayıcıdaki zamanlayıcı yeterli değildir.

Mevcut ana ekran uygulaması aynı adres ve manifest kimliğiyle güncellenmelidir. İlk sunucu eşitlemesinden önce cihazdaki JSON yedeği korunmalı; mevcut kayıt kimlikleriyle ekleme/güncelleme yapılmalı, kayıtlar yeniden yaratılmamalıdır. Sunucu tarafı kişisel kayıtları ayrı kullanıcı kimliğiyle sınırlandırmalıdır. Bildirim zamanı ve kilit ekranında tutar gösterme tercihi uygulama içinden ayarlanmalıdır.

Kaynaklar: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ ve https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers

## Yerelde çalıştırma

Herhangi bir statik HTTP sunucusuyla `dist/` klasörünü servis et:

```sh
python3 -m http.server 8000 --directory dist
```

`http://localhost:8000` adresini aç. ES modülleri için dosyaya doğrudan `file://` ile çift tıklamak yerine HTTP sunucusu kullan. PWA servis çalışanı HTTPS veya localhost gerektirir.

Derleme veya paket kurulumu gerekmez. Tüm istemci dosyaları `dist/` içinde; uygulama harici font servisi, CDN, takip kodu veya üçüncü taraf JavaScript yüklemez.

## Testler

Node.js 22 veya üstü:

```sh
npm test
npm run check
```

Testler tutar ayrıştırma, kısa aylar, artık yıl, ödeme durumlarının bağımsızlığı, tekrar sınırları, geçmişi koruyan düzenleme, gelecek peşin ödemeleri koruma, silme kapsamları ve yedek doğrulamayı kapsar.

Bu sürümün otomatik doğrulaması model ve JavaScript sözdizimini kapsar. Gerçek iPhone/Safari ve tarayıcı görsel testleri ayrıca yapılmalıdır.

## Yapı

- `dist/index.html` — erişilebilir uygulama iskeleti ve kayıt paneli
- `dist/style.css` — mobil ve masaüstü tasarımı
- `dist/app.js` — etkileşimler, görünüm, kayıt ve yedekleme
- `dist/model.js` — tarih, tutar ve tekrar hesapları
- `dist/sw.js` — yalnızca uygulama dosyaları için çevrimdışı önbellek
- `tests/model.test.mjs` — iş mantığı testleri

Herhangi bir statik hostta `dist/` yayınlanabilir. Sites kimliği `.openai/hosting.json` içinde barındırma için tutulur. Yeni sürüm yayınlarken değişen uygulama dosyalarının yenilenmesi için `sw.js` içindeki önbellek sürümünü artır.
