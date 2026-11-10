# Üçüncü taraf kütüphaneler

Dosyalar `public/vendor/` içinde sürümü sabit olarak durur; çalışma zamanında dışarıdan hiçbir şey çekilmez.

| Kütüphane | Sürüm | Lisans | Kaynak | Dosya | SHA-384 |
|---|---|---|---|---|---|
| countUp.js | 2.10.1 | MIT | https://github.com/inorganik/countUp.js | `public/vendor/countUp.min.js` (npm `countup.js@2.10.1`, `dist/countUp.min.js`) | `32ae7fb93b82c290328b0316b62f3d12bfc543ae8aa436f4c93764b8702039effac9fd00b3b52108d4410c1371c6ce36` |

Kullanım: özet rakamlarının yeni değere sayarak geçmesi (`public/animations.js`). Hareket azaltma açıkken (sistem ayarı veya uygulamadaki "Animasyonlar" tercihi) kullanılmaz.

Not: anime.js ve auto-animate planlanmıştı ancak eklenmedi. Uygulamanın mevcut `motion.js` dosyası sıralı belirme ve geçişleri zaten yerel Web Animations API ile yapıyor (anime.js gereksiz 118 KB olurdu). Sayfa her çizimde HTML'i baştan kurduğu için auto-animate ekleme/silme geçişini yakalayamazdı.

## countUp.js lisansı (MIT)

The MIT License (MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
