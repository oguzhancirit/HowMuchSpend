# HowMuchSpend

Gelirin, giderin ve ödeme günlerin. Hepsi tek bir takvimde.

iPhone için tasarlanmış, Türkçe, ücretsiz ve bağımlılıksız bir gelir/gider takip web uygulaması. Canlı uygulama: https://howmuchspend.ozicirit9.chatgpt.site

## Özellikler

- Aylık takvim, günlük ayrıntı ve liste görünümü; gelir/gider filtreleri.
- Ziraat 🌾, Yapı Kredi 🔵, Akbank 🔴 rozetleri. Bankalara bağlantı kurulmaz.
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

1. İlk giderini veya gelirini `+` düğmesiyle ekle.
2. Düzenli ödeme için `Her ay` seç. Taksit için bitişi `Belirli sayıda` yap.
3. Gerçekleştiğinde sağdaki durum düğmesini kullan.
4. Ayarlar bölümünden düzenli JSON yedeği indir.

iPhone: Safari'de aç → Paylaş → Ana Ekrana Ekle. Safari ve ana ekran uygulaması farklı veri alanları kullanırsa JSON yedeği ile taşı.

## Veri saklama ve gizlilik

Uygulama sunucuya finansal veri göndermez. Kayıtlar `localStorage` içinde `howmuchspend.data.v1` anahtarında bu cihaz ve origin için saklanır. Hesap, banka bağlantısı veya cihazlar arası eşitleme yoktur. Site barındırıcısı siteye erişim için ayrıca oturum açılmasını isteyebilir.

Tarayıcı/site verilerini silmek kayıtları kaybettirebilir. Telefon veya adres değiştirirken JSON yedeğini indir ve yeni konumda geri yükle. Geri yükleme mevcut kayıtları değiştirir; öncesinde onay gösterilir ve yedek alma seçeneği sunulur. Kaydetme hatası sessizce başarı olarak gösterilmez.

Bu kaynak kod ve örnek veriler kullanıcıya ait ekran görüntülerini, banka bakiyelerini veya gerçek finansal kayıtları içermez. Banka rozetleri tanımlayıcı emojilerdir, resmi logolar değildir.

## Hesap mantığı

- Tutarlar tam sayı kuruş olarak saklanır.
- Planlanan net = seçili ayın tüm gelirleri − tüm giderleri.
- Gerçekleşen net = alınan gelir − ödenen gider. Banka hesabı bakiyesi değildir; önceki aydan bakiye devretmez.
- Aylık ayın 31'i kaydı şubatta son güne, martta yeniden 31'ine düşer.
- Şubat 29'undaki yıllık kayıt, artık olmayan yıllarda şubat 28'ine düşer.
- Tekrarlar kopyalar oluşturmak yerine kurallardan hesaplanır. Gelecek aylara geçiş kayıtları çoğaltmaz.
- Kredi kartı borcu gider olarak eklenirse aynı alışverişleri ayrıca eklemek toplamda çift sayım oluşturur.
- Varsayılan kayıtlar boştur. Örnek görünüm kurgusaldır ve gerçek verileri değiştirmez.

## Yerelde çalıştırma

Herhangi bir statik HTTP sunucusuyla `dist/` klasörünü servis et:

```sh
python3 -m http.server 8000 --directory dist
```

`http://localhost:8000` adresini aç. ES modülleri için dosyaya doğrudan `file://` ile çift tıklamak yerine HTTP sunucusu kullan. PWA servis çalışanı HTTPS veya localhost gerektirir.

Derleme veya paket kurulumu gerekmez. Tüm istemci dosyaları `dist/` içinde; uygulama harici font, CDN, takip kodu veya üçüncü taraf JavaScript yüklemez.

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
