# Tarayıcı çevirisinde önce OPUS ve MT2’yi değerlendirin

## 18 Kasım 2026 uygulama doğrulaması

Araştırma sonrasında yapılan gerçek çıkarım denemeleri öneriyi değiştirdi: `Xenova/opus-mt-tc-big-tr-en` ve `onnx-community/opus-mt-tc-big-en-tr` q8 paketleri mevcut Transformers.js 4.3.0 ortamında tekrarlı/anlamsız çıktı üretti. Bu iki paket uygulamaya alınmadı; bu sonuç upstream modellerin genel kalitesine ilişkin bir benchmark değildir.

Yayımlanan otomatik yönlendirme **TR→EN için `Xenova/opus-mt-tr-en` (~110 MB, Apache-2.0)**, diğer yönler için mevcut **M2M-100** kullanır. Chrome'da üretim derlemesinin worker'ı üzerinden `Bu toplantıya yarın katılamayacağım.` → `I can't attend this meeting tomorrow.` ve M2M ile `I cannot attend this meeting tomorrow.` → `Yarın bu toplantıya katılamıyorum.` sonuçları doğrulandı. Bunlar işlevsel smoke testlerdir, kapsamlı kalite ölçümü değildir.

Hy-MT2, sabitlenmiş ONNX revizyonuyla ayrı ve **deneysel** WebGPU seçeneğidir; GPU üzerinde gerçek çıkarımı doğrulanmadı. Aşağıdaki bölüm, bu uygulama doğrulamasından **önceki kaynak araştırmasını** korur; artık bir yayın önerisi olarak okunmamalıdır.

## İlk kaynak araştırması

**17 Kasım 2026 itibarıyla öneri: Türkçe↔İngilizce için yönlü OPUS-MT modellerini, daha yeni çokdilli seçenek olarak Hy-MT2-1.8B’yi değerlendirin; mevcut M2M100’ü hemen değiştirmeyin.** OPUS’un gerçek ONNX paketleri daha küçük indirmeler sunuyor; MT2’nin Türkçe desteği, Apache-2.0 lisansı ve Transformers.js örnekli topluluk dönüşümü doğrulandı. Ancak MT2’nin bu dönüşümü araştırma günü yayımlandığından çalışma ve kalite doğrulaması özellikle önemli. TranslateGemma 4B gerçek bir tarayıcı adayı, fakat büyük ve Türkçe kalitesi belirsiz. HY-MT1.5’in kısıtlayıcı lisansı, MT2’nin lisansıyla karıştırılmamalı. Bu çalışma yalnızca kaynak, dosya metaverisi ve uyumluluk incelemesidir: **model indirilmedi, çıkarım yapılmadı; hız, bellek veya Türkçe kalite üstünlüğü ölçülmedi.**

## Yönlü OPUS modelleri en ekonomik ilk denemeyi sunuyor

Aşağıdaki boyutlar seçilen ONNX grafiklerinin ve harici ağırlık verilerinin toplamıdır; ondalık MB/GB kullanılır. Tokenizer ve çalışma zamanı hariçtir; depo toplamı veya gereken RAM değildir. Seq2seq modellerde encoder ve birleşik decoder toplanmıştır. Aynı modelin farklı dönüştürülmüş depoları farklı boyutlarda olabilir.

| Gerçek model deposu | Seçilen indirme | Kapsam ve lisans |
|---|---:|---|
| `Xenova/m2m100_418M` | q8 **632 MB** | Mevcut temel; 100 dil, MIT |
| `Xenova/opus-mt-tr-en` | q8 **110 MB** | Yalnız TR→EN; Apache-2.0 |
| `Xenova/opus-mt-tc-big-tr-en` | q8 **298 MB** | Yalnız TR→EN; CC-BY-4.0 |
| `onnx-community/opus-mt-tc-big-en-tr` | q8 **531 MB** | Yalnız EN→TR; CC-BY-4.0 |
| `konstbet/Hy-MT2-1.8B-ONNX` | q4f16 **1,075 GB** | Türkçe dahil 33 dil ve varyantlar; upstream Apache-2.0 |

Boyutlar kamuya açık dosya metaverilerinden doğrulandı ([M2M](https://huggingface.co/api/models/Xenova/m2m100_418M?blobs=true), [küçük OPUS](https://huggingface.co/api/models/Xenova/opus-mt-tr-en?blobs=true), [TR→EN big](https://huggingface.co/api/models/Xenova/opus-mt-tc-big-tr-en?blobs=true), [EN→TR big](https://huggingface.co/api/models/onnx-community/opus-mt-tc-big-en-tr?blobs=true), [MT2](https://huggingface.co/api/models/konstbet/Hy-MT2-1.8B-ONNX?blobs=true)). OPUS lisansları yön/checkpoint bazında farklıdır; big modellerin atıf koşulları korunmalıdır ([küçük model](https://huggingface.co/Helsinki-NLP/opus-mt-tr-en), [TR→EN big](https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-tr-en), [EN→TR big](https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-en-tr)).

OPUS big kartlarında FLORES101-devtest BLEU, TR→EN için **37,6**, EN→TR için **31,4** olarak raporlanıyor. TR→EN newstest2016/2017/2018 sonuçları big modelde 29,3/29,7/30,7; küçük modelde 25,2/24,7/27,0. Bunlar big modeli değerlendirmek için gerekçe, fakat farklı kartların skorları kontrollü tarayıcı karşılaştırması değildir; ONNX q8’in M2M’den üstünlüğünü kanıtlamaz ([model kartları](https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-tr-en)).

## Hy-MT2 öncelikli; MT1.5 ve TranslateGemma koşullu adaylar

**21 Mayıs 2026 çıkışlı Hy-MT2-1.8B**, Türkçeyi açıkça listeliyor ve gerçek lisans dosyası Apache-2.0. `konstbet` dönüşümü 17 Kasım’da yayımlandı; WebGPU/q4f16 Transformers.js örneği ve KV-cache düzeltmesi içeriyor. Bu, paketleme kanıtıdır, uçtan uca çalışma sertifikası değildir; sürüm sabitlenerek denenmelidir. Tencent’in **440 MB** duyurusu ayrı 1,25-bit **GGUF** paketine aittir, bu ONNX indirmesine değil ([upstream ve varyantlar](https://huggingface.co/tencent/Hy-MT2-1.8B), [lisans](https://huggingface.co/tencent/Hy-MT2-1.8B/blob/main/LICENSE.txt), [JS dönüşümü](https://huggingface.co/konstbet/Hy-MT2-1.8B-ONNX)).

Önceki `onnx-community/HY-MT1.5-1.8B-ONNX` için JS örneği mevcut; q4f16 yaklaşık **1,227 GB**, q4 **1,406 GB**. Ancak **Tencent HY Community License, AB/Birleşik Krallık/Güney Kore’yi kapsam dışında bırakıyor** ve ek koşullar içeriyor. Açık erişimli küresel araç için bunu Apache lisanslı MT2’ye eşdeğer saymayın ([paket](https://huggingface.co/onnx-community/HY-MT1.5-1.8B-ONNX), [lisans](https://raw.githubusercontent.com/Tencent-Hunyuan/Hy-MT/main/License.txt)).

`onnx-community/translategemma-text-4b-it-ONNX` q4f16 **2,715 GB**, q4 **3,092 GB**; gerçek WebGPU uygulaması var. Lisansı Apache değil, **Gemma koşullarıdır**. Resmî şablon metaverisinde Türkçe yer alıyor; bu, Türkçenin 55 dilli değerlendirmede ölçüldüğünü veya kaliteli olduğunu tek başına doğrulamıyor. Google’ın “4B, 12B’ye rakip” ifadesi genel **Gemma 3 12B** temel modeline ilişkin; tüm çeviri modellerine değil ([dosyalar](https://huggingface.co/api/models/onnx-community/translategemma-text-4b-it-ONNX?blobs=true), [tarayıcı uygulaması](https://huggingface.co/spaces/webml-community/TranslateGemma-WebGPU/blob/main/src/ai/Translator.ts), [resmî metaveri](https://huggingface.co/api/models/google/translategemma-4b-it), [Google](https://blog.google/innovation-and-ai/technology/developers-tools/translategemma/)).

NLLB-600M’nin gerçek q8 ONNX paketi **895 MB**, Türkçe kodu `tur_Latn`; fakat **CC-BY-NC-4.0** lisansı ve araştırma amaçlı kullanım uyarısı nedeniyle genel üretim alternatifi olarak önermiyorum ([paket](https://huggingface.co/Xenova/nllb-200-distilled-600M), [upstream](https://huggingface.co/facebook/nllb-200-distilled-600M)).

## Transformers.js desteği model kimliğini değiştirmekten fazlasını gerektiriyor

**4.3.0**, Marian/OPUS, M2M/NLLB, Hunyuan dense ve Gemma3 text mimarilerini tanıyor. OPUS yön bazlı model seçimiyle `translation` yolunda kalabilir; NLLB dil kodu eşlemesi ister. Hy-MT2 ve TranslateGemma ise **`text-generation`**, modele özgü istem/şablon ve assistant çıktısı ayrıştırma gerektirir; mevcut `translation_text` sözleşmesi kullanılamaz. Her ONNX paketi Transformers.js paketi değildir: örneğin `justinchuby/Hy-MT2-1.8B-ONNX`, ORT GenAI düzenindedir ([4.3.0 kayıtları](https://github.com/huggingface/transformers.js/blob/4.3.0/packages/transformers/src/models/registry.js), [MT2 örneği](https://huggingface.co/konstbet/Hy-MT2-1.8B-ONNX), [ORT GenAI dönüşümü](https://huggingface.co/justinchuby/Hy-MT2-1.8B-ONNX)).

Açık `device`/`dtype` seçilmeli; q4f16 için WebGPU FP16 yeteneği denetlenmeli. İndirme onayı, önbellek/kota yönetimi, worker, model değiştirilirken `dispose`, çıktı sınırı ve uzun metin parçalama planlanmalı. **İndirme boyutu bellek gereksinimi değildir**; KV-cache, ara tensörler ve CPU/GPU kopyaları eklenir. Sabit asgari RAM vermek için ölçüm yok ([dtype davranışı](https://github.com/huggingface/transformers.js/blob/4.3.0/packages/transformers/src/utils/dtypes.js), [ORT bellek sınırları](https://onnxruntime.ai/docs/tutorials/web/large-models.html)).

## Sunucu seçenekleri indirmeyi kaldırıyor, gizlilik sınırını değiştiriyor

Özbarındırmada **Hy-MT2-7B** Apache-2.0 ile ilk karşılaştırma adayı; TranslateGemma-12B/27B ise lisans ve Türkçe doğrulamasıyla koşullu seçenek. Yönetilen hizmette **`qwen-mt-flash` / `qwen-mt-plus`** ve Google **`general/translation-llm`** değerlendirilmeli. Qwen güncel belgeleri Flash/Plus için 92 dil bildiriyor; önceki Qwen-MT duyurusu Türkçeyi açıkça listeliyor, ancak Lite’ın 31 dilli kapsamı ayrıca doğrulanmalı. Google TLLM, Türkçe ve İngilizceyi resmen destekliyor; indirilebilir TranslateGemma ile aynı ürün değil ([Tencent](https://huggingface.co/collections/tencent/hy-mt2), [Qwen güncel belge](https://www.alibabacloud.com/help/en/model-studio/machine-translation), [Qwen dil listesi](https://qwenlm.github.io/blog/qwen-mt/), [Google TLLM](https://docs.cloud.google.com/translate/docs/translation-llm), [diller](https://docs.cloud.google.com/translate/docs/languages)).

Ücretli ortak API anahtarı statik JavaScript’e gömülmemeli; kontrollü backend/proxy gerekir. Metin cihazdan çıkar; bölge, saklama, ücret ve kota ayrıca incelenmelidir. Bu hizmetlerin açık ağırlıkları veya parametre sayıları varsayılmamalıdır.

## Sonuç: varsayılanı ortak Türkçe testi belirlesin

Sonraki adım iki yönü ayrı değerlendiren kör bir testtir: OPUS big, MT2 q4f16 ve mevcut M2M; ardından bulut referansları. FLORES yanında gündelik Türkçe, olumsuzluk/ekler, deyimler, teknik metin ve yer tutucular kullanılmalı; insan değerlendirmesi, chrF/COMET, ilk indirme, sıcak hız ve tepe bellek birlikte ölçülmeli. **Üretici çokdilli ortalamaları, bağımsız Türkçe üstünlüğü değildir**; MT2 raporunda dahi her ölçüt iyileşmiyor. Böylece “daha yeni model” yerine kullanım ve cihaz başına kanıtlanmış seçenek seçilir ([MT2 değerlendirmesi](https://arxiv.org/html/2605.22064v1)).
