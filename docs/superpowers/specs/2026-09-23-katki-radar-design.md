# katki-radar — Tasarım Dokümanı

- **Tarih:** 2026-09-23
- **Sahip:** Muhammed Koramaz
- **Durum:** Onay bekliyor

## 1. Amaç

Açık kaynak projelere düzenli ve kaliteli katkı yapmayı kolaylaştırmak. Sistem fırsatları
otomatik bulur; işi yapma ve PR açma adımları Claude Code ile, her kritik adımda kullanıcı
onayıyla ilerler.

**Hedef:** Haftada 2–3 PR.

**Kapsam dışı (bilinçli olarak):**
- Onaysız, tam otomatik PR açmak. AI spam'i 2026'da ciddi bir sorun; projeler AI PR'larını
  yasaklıyor, GitHub PR kısıtlama ayarları getirdi.
- Weblate/Crowdin gibi platformlarda çeviri yapmak.
- Birden fazla kullanıcı desteği.

### 1.1 Kullanıcı profili
- **Diller:** JavaScript/TypeScript (frontend + Node.js backend), Python.
- **Konular:** Erişilebilirlik, eğitim, sağlık/insani yardım, gizlilik/özgür yazılım.
- **Fırsat türleri:** Eksik Türkçe çeviri, kod issue'ları, dokümantasyon.

## 2. Mimari

İki parçadan oluşur:

| Parça | Nerede çalışır | Görevi | Yazma yetkisi |
|---|---|---|---|
| Haftalık tarama | GitHub Actions (`katki-radar` reposu) | Fırsatları bulur, puanlar, issue olarak listeler | Sadece kendi reposunda: issue açar, `data/gorulen.json` dosyasını commit eder |
| `/katki` komutu | Kullanıcının bilgisayarı (Claude Code) | Seçilen işi hazırlar ve kullanıcı onayıyla PR açar | Fork, branch, commit, PR, issue yorumu — **her biri kullanıcı onayıyla** |

### 2.1 Repo yapısı

```
katki-radar/
├─ .github/workflows/tara.yml     # zamanlanmış + elle tetiklenebilir workflow
├─ scripts/
│  ├─ tara.mjs                    # giriş noktası (CLI: --dry-run)
│  └─ lib/
│     ├─ github.mjs               # fetch sarmalayıcı, yeniden deneme, sayfalama
│     ├─ kesif.mjs                # aday repoları bulma
│     ├─ ceviri.mjs               # locale tespiti + tamamlanma oranı
│     ├─ issuelar.mjs             # kod/doküman issue'ları + "dolu mu" kontrolü
│     ├─ politika.mjs             # AI politikası tespiti
│     ├─ puan.mjs                 # puanlama
│     ├─ rapor.mjs                # issue gövdesi (markdown) oluşturma
│     └─ ceviri-kontrol.mjs       # /katki tarafından da kullanılan çeviri doğrulayıcı (CLI)
├─ test/                          # node --test, fixture'lı birim testleri
│  └─ fixtures/
├─ data/gorulen.json              # daha önce listelenmiş fırsatlar
├─ config.json
├─ tr-sozluk.md                   # Türkçe terim sözlüğü
├─ komut/katki.md                 # /katki komut dosyasının kaynağı
└─ docs/superpowers/specs/
```

- **Bağımlılık:** Yok. Node 22'nin yerleşik `fetch` ve `node:test` modülleri yeterli.
- **Komut dosyası:** `komut/katki.md`, kurulumda `~/.claude/commands/katki.md` olarak
  kopyalanır. Kaynağı repoda durur, böylece versiyonlanır.

## 3. Haftalık tarama

### 3.1 Workflow
- **Zamanlama:** `cron: "0 6 * * 1"` (Pazartesi 06:00 UTC = 09:00 TSİ). Ayrıca
  `workflow_dispatch` ile elle tetiklenebilir.
- **İzinler:** `issues: write`, `contents: write`.
- **Token:** Action'ın kendi `GITHUB_TOKEN`'ı.
- **Adımlar:** checkout → `node --test` → `node scripts/tara.mjs` → `data/gorulen.json`
  değiştiyse commit + push. Testler başarısız olursa tarama çalışmaz.

### 3.2 config.json

```json
{
  "kullanici": "<github-kullanici-adi>",
  "konular": ["accessibility", "a11y", "education", "edtech", "health", "humanitarian",
              "disaster-response", "privacy", "self-hosted", "digital-public-goods"],
  "diller": ["JavaScript", "TypeScript", "Python"],
  "yildiz": { "min": 100, "max": 30000, "idealMin": 500, "idealMax": 10000 },
  "sonPushGun": 90,
  "maksRepo": 80,
  "kodEtiketleri": ["good first issue", "help wanted"],
  "dokumanEtiketleri": ["documentation", "docs"],
  "haftalikKota": { "ceviri": 4, "kod": 4, "dokuman": 2 },
  "ceviriEksikEsik": 0.7,
  "minDigerDil": 3
}
```

`kullanici` alanı kurulumda doldurulur.

### 3.3 Keşif (`kesif.mjs`)
- Her (konu × dil) kombinasyonu için arama API'sine şu sorgu atılır:
  `topic:<konu> language:<dil> stars:<min>..<max> pushed:>=<bugün-90g> archived:false`,
  sıralama `updated`, konu başına ilk 10 sonuç.
- Sonuçlar tekilleştirilir ve en fazla `maksRepo` repo alınır.
- **Arama API limiti** 30 istek/dakika. İstekler arasına 2,1 saniye bekleme konur.

### 3.4 Türkçe çeviri fırsatı (`ceviri.mjs`)
1. Varsayılan branch'in dosya ağacı `git/trees/<branch>?recursive=1` ile tek istekte çekilir.
2. **Locale klasörü:** Yol parçalarından biri şu listede olan klasörler aranır:
   `locales`, `locale`, `i18n`, `lang`, `langs`, `translations`, `messages`, `l10n`.
3. **Kaynak ve Türkçe dosya tespiti.** Desteklenen desenler:
   - Dosya bazlı: `<klasor>/en.json`, `en-US.json`, `en.yml`, `en.yaml`, `en.po`
     → Türkçe karşılığı `tr.*` veya `tr-TR.*`
   - Klasör bazlı: `<klasor>/en/*.json` → Türkçe karşılığı `<klasor>/tr/`
   - gettext: `<klasor>/tr/LC_MESSAGES/*.po` veya `<klasor>/tr.po`
4. **Diğer dil sayısı:** Aynı desenle eşleşen, `en` ve `tr` dışındaki dil kodlarının sayısı.
5. **Karar:**
   - Türkçe dosya yok ve diğer dil sayısı ≥ `minDigerDil` → **"Türkçe yok"**
   - Türkçe dosya var → sadece JSON ve YAML için kaynak ile Türkçe dosya indirilir ve
     yaprak anahtarlar sayılır. `tr/en < ceviriEksikEsik` ise → **"Türkçe eksik (%x)"**.
     `.po` dosyalarında boş `msgstr` sayılır.
6. **Hariç tutma:** Kökte `crowdin.yml`, `crowdin.yaml`, `.weblate` veya `.tx/config`
   varsa ya da README'de `weblate.org`, `crowdin.com` veya `transifex.com` linki geçiyorsa
   repo çeviri fırsatı olarak alınmaz. Kod ve doküman fırsatları bundan etkilenmez.
7. Ayrıştırılamayan dosyalar atlanır, repo adıyla loglanır.

### 3.5 Kod ve doküman issue'ları (`issuelar.mjs`)
- Aday repolar 5'erli gruplar halinde arama API'sine gönderilir:
  `repo:a/b repo:c/d … is:issue is:open no:assignee -linked:pr label:"<etiket>"`
- Türüne göre `kodEtiketleri` veya `dokumanEtiketleri` kullanılır. Bir issue her iki
  etiket türüne de sahipse **doküman** sayılır.
- **"Dolu mu" kontrolü:** Aday issue'nun son 30 gündeki yorumları çekilir. Yorumlardan
  biri şu kalıplardan birini içeriyorsa (büyük/küçük harf duyarsız) issue elenir:
  `work on this`, `take this`, `pick this up`, `assign me`, `assign this to me`,
  `i'll take`, `i'd like to`, `can i work`, `i am working`, `i'm working`.

### 3.6 AI politikası (`politika.mjs`)
- **Okunan dosyalar:** Kökteki veya `.github/` altındaki `CONTRIBUTING.md`, kökteki
  `AI_POLICY.md` ve `README.md`. Dosya bulunamazsa sessizce geçilir.
- **Yasak tespiti:** Aynı cümlede (nokta ile ayrılmış parçada) hem bir AI terimi hem bir
  yasak terimi geçiyorsa sonuç **YASAK** olur ve repo tamamen elenir.
  - AI terimleri: `ai-generated`, `ai generated`, `llm`, `chatgpt`, `copilot`,
    `generative ai`, `ai tools`, `ai-assisted`, `language model`
  - Yasak terimleri: `not accept`, `not be accepted`, `prohibit`, `ban`, `forbidden`,
    `will be closed`, `do not submit`, `not allowed`, `reject`
- **Açıklama şartı tespiti:** Yasak yok ama bir AI terimi ile `disclose`, `disclosure`,
  `must mention`, `indicate` aynı cümlede geçiyorsa sonuç **AÇIKLAMA** olur. Fırsat listede
  kalır, yanına "⚠ AI kullanımını belirt" notu eklenir.
- **Belirsiz kalan durumlar:** Burada yakalanmayanlar `/katki` 2. adımında Claude
  tarafından yeniden okunur ve karar orada kesinleşir.

### 3.7 Elemeler (özet)
Aşağıdakilerden biri geçerliyse fırsat listelenmez:
- Arşivlenmiş repo ya da son push 90 günden eski
- AI politikası = YASAK
- Issue'nun atanmış kişisi veya bağlı PR'ı var ya da "dolu" (3.5)
- Fırsat `data/gorulen.json` içinde yer alıyor
- Kullanıcının o repoda açık bir PR'ı var. Kontrol: `is:pr is:open author:<kullanici>`
  araması tek istekte yapılır, repo listesi çıkarılır.

### 3.8 Puanlama (`puan.mjs`) — 0–100

| Kriter | Maks | Formül |
|---|---|---|
| Maintainer ilgisi | 30 | Son kapanmış 30 PR içinde `merged_at` dolu ve `author_association` ∉ {OWNER, MEMBER, COLLABORATOR} olanların sayısı `d` → `min(d, 10) × 3` |
| Netlik | 20 | Kod/doküman: gövde ≥ 200 karakter ise +8; kod bloğu veya numaralı liste varsa +6; maintainer (OWNER/MEMBER/COLLABORATOR) yorumu varsa +6. Çeviri: sabit 20 |
| Konu/dil uyumu | 20 | Repo konularından biri `konular` listesinde ise +10; ana dili `diller` listesinde ise +10 |
| Tazelik | 15 | Issue yaşı ≤ 60 gün ise 15; 61–365 gün arası doğrusal azalır; > 365 gün ise 0. Çeviri: repo son push ≤ 30 gün ise 15, değilse 8 |
| Proje boyutu | 15 | Yıldız sayısı `idealMin`–`idealMax` aralığında ise 15; `min`–`max` aralığında ama idealin dışında ise 8 |

- **Seçim:** Her türde puana göre ilk `haftalikKota[tür]` fırsat alınır. Bir türde yeterli
  fırsat yoksa boşluk diğer türlerden en yüksek puanlılarla doldurulur. Toplam en fazla 10.
- **Aynı repo sınırı:** Listede aynı repodan en fazla 2 fırsat yer alır.

### 3.9 Rapor (`rapor.mjs`)
- **Issue başlığı:** `Fırsatlar – YYYY-MM-DD`
- **Etiket:** `firsatlar`. Etiket repoda yoksa oluşturulur.
- **Gövde:** Türe göre gruplanmış tablo. Sütunlar: `#`, `Puan`, `Tür`, `Repo` (link),
  `İş` (issue linki veya locale klasörü), `Neden` (tek cümle), `Not` (⚠ AI açıklaması vb.).
- **Makine tarafından okunan blok:** Gövdenin sonunda bir HTML yorumu içinde aynı veri JSON
  olarak durur: `<!-- katki-data: [...] -->`. `/katki` bu bloğu okur.
- **Sonraki hafta:** Önceki "Fırsatlar" issue'su kapatılır.
- **Sıfır sonuç:** Yine de issue açılır. İçinde filtre istatistikleri olur: kaç repo
  tarandı, kaçı hangi sebeple elendi.

### 3.10 data/gorulen.json
- Format: `{ "<anahtar>": "<ilk görülme tarihi>" }`
- Anahtar: kod/doküman için `owner/repo#123`, çeviri için `owner/repo:tr`.
- 180 günden eski kayıtlar silinir.
- Dosya yalnızca tarama başarıyla biterse yazılır.

## 4. `/katki` komutu

**Kullanım:** `/katki`, `/katki <issue-veya-repo-linki>`, `/katki takip`.
**Çalışma klasörü:** `C:\Users\muham\katki\<repo>`.
✋ işaretli adımlarda Claude durur ve kullanıcının açık onayını bekler.

### 4.1 Ön kontroller
- `gh auth status` başarısızsa komut durur ve `! gh auth login` önerir.
- `C:\Users\muham\katki\` altında `katki/` ile başlayan ve PR'ı açılmamış branch'ler varsa
  "yarım kalan işler" olarak listenin başında gösterilir.
- Kullanıcının son 7 günde açtığı PR sayısı ≥ 3 ise uyarı verilir.

### 4.2 Akış
1. **Seçim:** `katki-radar` reposundaki `firsatlar` etiketli son açık issue'nun
   `katki-data` bloğu okunur, tablo gösterilir, kullanıcı birini seçer.
2. **Proje kontrolü:** Claude şunları okur ve özetler: CONTRIBUTING, AI politikası (tam
   metin), CLA/DCO şartı, commit formatı, PR şablonu, test/lint/build komutları.
   - AI yasağı bulunursa iş iptal edilir.
   - Kod/doküman işlerinde issue'nun son durumu yeniden kontrol edilir.
3. **Kaynak görme:** Kod/doküman işlerinde issue'ya kısa bir yorum taslağı hazırlanır.
   ✋ Gönderip göndermemek ve cevap beklenip beklenmeyeceği kullanıcıya sorulur. Çeviri
   işlerinde bu adım atlanır.
4. **Hazırlık:** `gh repo fork --clone` çalıştırılır; fork zaten varsa `gh repo sync`
   yapılır. `katki/<kisa-ad>` branch'i açılır ve bağımlılıklar projenin kendi aracıyla
   (npm/pnpm/yarn/pip/uv) kurulur.
5. **Çalışma** (bkz. 4.3, 4.4).
6. **Doğrulama:** Projenin test, lint ve build komutları çalıştırılır. Başarısız olan ya
   da çalıştırılamayan varsa PR aşamasına geçilmez. Kullanıcıya iki seçenek sunulur:
   ortamı düzeltmek ya da işi bırakmak.
7. **İnceleme:** ✋ `git diff` çıktısı ve bir özet gösterilir (ne değişti, neden, nasıl
   test edildi).
8. **PR:** ✋
   - Commit projenin formatına uyar; DCO gerekiyorsa `-s` ile imzalanır.
   - PR gövdesi projenin şablonuna göre yazılır; sonuna AI açıklaması eklenir:
     *"Bu değişiklik AI yardımıyla hazırlandı; tarafımdan gözden geçirilip test edildi."*
   - Push edilir ve `gh pr create` ile PR açılır.
   - CLA gerekiyorsa imza linki kullanıcıya verilir.

### 4.3 Çeviri çalışması
- **Tutarlılık:** `tr-sozluk.md` okunur ve terimler tutarlı kullanılır. Kullanıcının
  düzelttiği yeni terimler sözlüğe eklenir; sözlük değişikliği `katki-radar` reposuna
  ayrıca commit edilir.
- **Hitap:** Projede mevcut Türkçe dosya varsa onun tonu (siz/sen) izlenir. Yoksa "siz"
  kullanılır.
- **Otomatik kontrol:** `node <katki-radar>/scripts/lib/ceviri-kontrol.mjs <kaynak> <tr>`
  ile kontrol edilir:
  - Yer tutucular birebir korunmuş olmalı: `{x}`, `{{x}}`, `%s`, `%d`, `%(x)s`, `$t(x)`,
    ICU `{n, plural, …}` yapıları, HTML etiketleri.
  - Anahtar kümesi eşit olmalı ("Türkçe eksik" durumunda: kaynakta olup Türkçede olmayan
    anahtar kalmamalı).
  - Dosya geçerli JSON/YAML/PO formatında olmalı.
- **Kullanıcı incelemesi:** ✋ Çeviri 30–50 satırlık parçalar halinde
  `Anahtar | İngilizce | Türkçe` tablosu olarak gösterilir; kullanıcı her parçayı onaylar
  veya düzeltir.
- **Kayıt:** Proje yeni dili bir listeye kaydediyorsa (dil seçici, config vb.) oraya da
  eklenir.

### 4.4 Kod ve doküman çalışması
- Hata önce yeniden üretilir; mümkünse önce başarısız olan bir test yazılır.
- Değişiklik issue'nun kapsamıyla sınırlıdır: ilgisiz refactor, format değişikliği veya
  bağımlılık güncellemesi yapılmaz.

### 4.5 Takip modu
- `gh search prs --author @me --state open` ile açık PR'lar listelenir. Yeni review
  yorumu olanlar önce gelir.
- Seçilen PR'da yorumlar değerlendirilir, düzeltme yapılır ve cevap taslağı hazırlanır.
  ✋ Push ve yorum göndermek onayla olur.

## 5. Hata durumları

| Durum | Davranış |
|---|---|
| API hatası / limit (tarama) | 3 deneme, üstel bekleme (2s, 4s, 8s); `403` + `retry-after` varsa o süre kadar beklenir. Yine başarısız olan sorgu atlanır ve issue'ya "⚠ başarısız sorgular" notu eklenir |
| Ayrıştırılamayan locale dosyası | Repo çeviri açısından atlanır ve loglanır |
| Script çöker | Workflow kırmızıya düşer (GitHub e-postası gelir), `gorulen.json` yazılmaz |
| `gh` girişi yok | `/katki` en başta durur |
| Test ortamı kurulamıyor | Sebep açıklanır: ortamı kur ya da işi bırak. Test edilmemiş PR açılmaz |
| Fork zaten var | Senkronize edilir |
| İş yarıda kaldı | Branch korunur, bir sonraki `/katki`'de gösterilir |

## 6. Test stratejisi

- **Birim testleri (`node --test`):** `politika`, `ceviri` (locale tespiti ve tamamlanma
  oranı), `puan`, `rapor` (`katki-data` bloğu dahil), `ceviri-kontrol` (yer tutucu, anahtar,
  format) ve `issuelar` içindeki "dolu mu" kalıbı. Veri `test/fixtures/` içindeki
  kaydedilmiş API cevaplarından gelir; testlerde ağ erişimi yoktur.
- **`github.mjs`:** `fetch` enjekte edilebilir yazılır; yeniden deneme ve sayfalama sahte
  bir fetch ile test edilir.
- **`--dry-run`:** Gerçek API ile tarama yapar; issue açmak ve `gorulen.json` yazmak yerine
  raporu stdout'a basar. Yerelde `GITHUB_TOKEN` gerekirse `gh auth token` ile alınır.
- **Kabul testi:**
  - Action elle tetiklendiğinde ≥ 1 fırsat içeren bir issue açılır.
  - İlk gerçek PR, `/katki` ile uçtan uca birlikte yapılır.

## 7. Kurulum adımları

1. Kullanıcı: `winget install --id GitHub.cli`, ardından `gh auth login`.
2. Uygulama planı yazılır ve onaylanır, ardından kod yazılır (TDD).
3. `config.json` içindeki `kullanici` alanı doldurulur.
4. `komut/katki.md` dosyası `~/.claude/commands/katki.md` olarak kopyalanır.
5. ✋ GitHub'da `katki-radar` reposu oluşturulur (public/private kullanıcıya sorulur) ve
   push edilir.
6. Workflow elle tetiklenir, ilk issue kontrol edilir.
