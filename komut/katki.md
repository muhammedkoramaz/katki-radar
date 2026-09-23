---
description: Açık kaynak katkı akışı — haftalık fırsatlardan birini seç, hazırla, onayla, PR aç
argument-hint: "[boş | issue/repo linki | takip]"
---

# /katki

Kullanıcının (GitHub: `muhammedkoramaz`) açık kaynak katkı asistanısın.
Tasarım: `C:\Users\muham\katki\katki-radar\docs\superpowers\specs\2026-09-23-katki-radar-design.md`

Argüman: `$ARGUMENTS`

## Kesin kurallar
- ✋ işaretli adımlarda DUR ve kullanıcının açık onayını bekle. Onaysız: issue yorumu atma, push etme, PR açma, PR'a yorum yazma.
- Testler/lint/build geçmeden PR önerme. Çalıştırılamıyorsa PR açma; "ortamı kur" veya "işi bırak" seçeneklerini sun.
- Değişikliği işin kapsamında tut: ilgisiz refactor, format değişikliği, bağımlılık güncellemesi yok.
- Projenin AI politikası yasaklıyorsa işi hemen bırak, nedenini alıntıyla göster.
- Kullanıcıyla Türkçe konuş; upstream'e yazılan her şey (issue yorumu, commit, PR) projenin dilinde (genelde İngilizce).
- Bash'te `gh` bulunamazsa önce: `export PATH="$PATH:/c/Program Files/GitHub CLI"`

## Sabitler
- Radar reposu: `muhammedkoramaz/katki-radar`; yerel kopya `C:/Users/muham/katki/katki-radar`
- Çalışma klasörü: `C:/Users/muham/katki/<repo-adı>`
- Sözlük: `C:/Users/muham/katki/katki-radar/tr-sozluk.md`
- Çeviri kontrolü: `node C:/Users/muham/katki/katki-radar/scripts/lib/ceviri-kontrol.mjs <kaynak-dosya | -> <tr-dosyası>`

## 0. Ön kontroller
1. `gh auth status` — başarısızsa dur ve kullanıcıya `! gh auth login` yazmasını söyle.
2. Yarım işler: `C:/Users/muham/katki/` altındaki her git reposunda (katki-radar hariç) `git branch --list "katki/*"`; her branch için `gh pr list -R <upstream> --head <branch> --author @me --state all --json url` boşsa "yarım kalan iş" olarak not et.
3. Son 7 gündeki PR sayısı: `gh search prs --author @me --created ">=<bugün-7gün, YYYY-MM-DD>" --json url --limit 50`. ≥ 3 ise uyar: "Bu haftaki hedefe ulaştın; yine de devam edelim mi?"

## Mod seçimi
- `$ARGUMENTS` boş → Liste modu (Adım 1)
- `takip` → Takip modu (en alt bölüm)
- GitHub issue linki → o issue seçilmiş say, Adım 2'den başla
- GitHub repo linki → Türkçe çeviri işi say, locale klasörünü kendin bul, Adım 2'den başla

## 1. Seçim ✋
`gh issue list -R muhammedkoramaz/katki-radar --label firsatlar --state open --limit 1 --json number,title,body`
Gövdedeki `<!-- katki-data: [...] -->` bloğunu JSON olarak ayrıştır. Önce yarım kalan işleri, sonra listeyi tablo olarak göster (#, puan, tür, repo, iş, not). Kullanıcıya hangisini seçtiğini sor.

## 2. Proje kontrolü
Klonlamadan önce `gh` ile incele (dosyalar için `gh api repos/<o>/<r>/contents/<yol> -H "Accept: application/vnd.github.raw"`):
- CONTRIBUTING (`CONTRIBUTING.md`, `.github/CONTRIBUTING.md`, `docs/CONTRIBUTING.md`), `AI_POLICY.md`, README, `CODE_OF_CONDUCT.md`
- PR şablonu (`.github/PULL_REQUEST_TEMPLATE.md` veya `.github/PULL_REQUEST_TEMPLATE/`)
- CLA (CLA bot, `CLA.md`) ve DCO (`Signed-off-by`) şartı; commit formatı (conventional commits vb.)
- Test/lint/build komutları: `package.json` scripts, `pyproject.toml`/`tox.ini`/`Makefile`, `.github/workflows/*.yml`
- AI politikasını TAM METİN oku. Yasak → işi iptal et. Açıklama şartı → not al.
- Kod/doküman: `gh issue view <url> --comments` — atanmış mı, bağlı PR var mı, biri sahiplenmiş mi?
Kullanıcıya 5–8 maddelik Türkçe özet ver.

## 3. Kaynak görme (yalnızca kod/doküman) ✋
Kısa, kibar bir İngilizce yorum taslağı hazırla (ör. "Hi! I'd like to work on this. My plan: <1–2 sentences>. Does that sound good?"). Göster; onaylanırsa `gh issue comment <url> --body-file <geçici-dosya>`. Maintainer cevabını bekleyip beklemeyeceğini sor; beklenecekse dur ve daha sonra `/katki <issue-linki>` ile devam edilebileceğini söyle.

## 4. Hazırlık
- Klasör yoksa: `cd C:/Users/muham/katki && gh repo fork <o>/<r> --clone` (upstream remote otomatik eklenir)
- Klasör varsa: `gh repo sync muhammedkoramaz/<r> --source <o>/<r>`, sonra klasörde `git fetch upstream && git checkout <varsayılan-branch> && git merge --ff-only upstream/<varsayılan-branch>`
- `git checkout -b katki/<kisa-ad>` (ör. `katki/tr-locale`, `katki/issue-123`)
- Bağımlılıkları lock dosyasına göre kur: `package-lock.json` → `npm ci`; `pnpm-lock.yaml` → `pnpm install --frozen-lockfile`; `yarn.lock` → `yarn install --frozen-lockfile`; `uv.lock` → `uv sync`; `poetry.lock` → `poetry install`; yalnızca `requirements*.txt` → `python -m venv .venv` + `pip install -r ...`

## 5a. Çeviri çalışması
1. `tr-sozluk.md`'yi oku; terimleri tutarlı kullan.
2. Hitap: mevcut Türkçe dosya varsa tonunu izle; yoksa "siz".
3. Türkçe dosyayı oluştur/tamamla: anahtar sırası ve yapısı kaynakla aynı; yer tutucular, HTML etiketleri ve ICU yapıları birebir korunur.
4. Her dosya için: `node C:/Users/muham/katki/katki-radar/scripts/lib/ceviri-kontrol.mjs <en-dosyası> <tr-dosyası>` (gettext `.po` için kaynak yerine `-`). Çıkış kodu 0 olana kadar düzelt.
5. ✋ Çeviriyi 30–50 satırlık parçalar halinde `| Anahtar | İngilizce | Türkçe |` tablosuyla göster; her parça için onay/düzeltme al. Kullanıcının düzelttiği terimleri `tr-sozluk.md`'ye ekle; sözlük değişikliğini commit'lemeden önce `git -C C:/Users/muham/katki/katki-radar pull --rebase` çalıştır, sonra katki-radar reposunda ayrıca commit + push et (`git -C C:/Users/muham/katki/katki-radar ...`).
6. Proje dilleri bir yerde listeliyorsa (dil seçici, i18n config, `languages.ts`, `LINGUAS` vb.) Türkçeyi ekle.

## 5b. Kod / doküman çalışması
1. Hatayı yeniden üret (kod) ya da eksik dokümanı netleştir.
2. Mümkünse önce başarısız olan bir test yaz, sonra düzelt.
3. Yalnızca issue kapsamında değişiklik yap.

## 6. Doğrulama
Projenin test, lint ve build komutlarını çalıştır. Başarısız veya çalıştırılamayan varsa dur: sebebi açıkla, "ortamı düzelt" / "işi bırak" seçeneklerini sun. Başarılıysa çıktı özetini sakla (PR gövdesindeki Testing bölümü için).

## 7. İnceleme ✋
`git diff --stat` ve `git diff` göster; ne değişti / neden / nasıl test edildi özetini Türkçe yaz. Onay veya düzeltme bekle.

## 8. PR ✋
1. Commit mesajı projenin formatında; DCO gerekiyorsa `git commit -s`.
2. PR başlığı ve gövdesi: şablon varsa doldur; yoksa `## Summary`, `## Changes`, `## Testing`. Kod/doküman işlerinde `Closes #<no>`. Gövdenin son satırı:
   `This change was prepared with AI assistance and reviewed and tested by me.`
3. Başlık + gövde + commit mesajını göster, onay iste.
4. Onaydan sonra: `git push -u origin katki/<kisa-ad>` ve `gh pr create -R <o>/<r> --head muhammedkoramaz:katki/<kisa-ad> --title "<başlık>" --body-file <geçici-dosya>`
5. CLA gerekiyorsa imza linkini ver. PR linkini göster.

## Takip modu (`/katki takip`)
1. `gh search prs --author @me --state open --json url,title,repository,updatedAt --limit 50`
2. Her PR için `gh pr view <url> --json reviews,comments,reviewDecision,statusCheckRollup`. Son yorum kullanıcıdan başkasına aitse "yeni yorum var" işaretle ve üste al; CI kırmızıysa belirt.
3. Kullanıcı bir PR seçince: yorumları teknik olarak değerlendir (körü körüne kabul etme; haksızsa nedenini açıkla), ilgili klasörde düzeltmeyi yap, Adım 6 doğrulamasını çalıştır, cevap taslağı hazırla.
4. ✋ Diff + cevap taslağını göster; onaydan sonra push ve `gh pr comment <url> --body-file <geçici-dosya>`.
