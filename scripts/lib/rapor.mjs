const TUR_ADI = { ceviri: 'Türkçe çeviri', kod: 'Kod', dokuman: 'Dokümantasyon' };
const TUR_SIRASI = ['ceviri', 'kod', 'dokuman'];
const DATA_RE = /<!-- katki-data: ([\s\S]*?) -->/;

export const reportTitle = (date) => `Fırsatlar – ${date}`;

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function toData(opp) {
  return {
    key: opp.key,
    tur: opp.tur,
    repo: opp.repo.fullName,
    baslik: opp.baslik,
    url: opp.url,
    puan: opp.puan,
    notlar: opp.notlar,
    detay: opp.tur === 'ceviri' ? opp.detay : { numara: opp.detay.numara },
  };
}

export function renderReport({ date, selected, stats, failures = [] }) {
  const lines = [`# ${reportTitle(date)}`, ''];
  const ordered = [];
  if (selected.length === 0) {
    lines.push('Bu hafta uygun fırsat bulunamadı.', '');
  } else {
    lines.push('`/katki` komutuyla bu listeden seçerek başlayabilirsin.', '');
    for (const tur of TUR_SIRASI) {
      const group = selected.filter((o) => o.tur === tur);
      if (group.length === 0) continue;
      lines.push(`## ${TUR_ADI[tur]}`, '', '| # | Puan | Repo | İş | Neden | Not |', '|---|---|---|---|---|---|');
      for (const o of group) {
        ordered.push(o);
        lines.push(
          `| ${ordered.length} | ${o.puan} | [${o.repo.fullName}](${o.repo.htmlUrl}) ⭐${o.repo.stars} `
          + `| [${cell(o.baslik)}](${o.url}) | ${cell(o.neden)} | ${cell(o.notlar.join(' '))} |`,
        );
      }
      lines.push('');
    }
  }
  lines.push('<details><summary>Tarama istatistikleri</summary>', '');
  for (const [k, v] of Object.entries(stats)) lines.push(`- ${k}: ${v}`);
  lines.push('', '</details>', '');
  if (failures.length) {
    lines.push('⚠ **Başarısız sorgular:**', '');
    for (const f of failures) lines.push(`- ${cell(f)}`);
    lines.push('');
  }
  const json = JSON.stringify(ordered.map(toData)).replace(/>/g, '\\u003e');
  lines.push(`<!-- katki-data: ${json} -->`);
  return lines.join('\n');
}

export function parseReportData(body) {
  const m = body.match(DATA_RE);
  return m ? JSON.parse(m[1]) : [];
}
