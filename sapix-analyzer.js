(() => {
  'use strict';

  const PDFJS_VERSION = '6.3.289';
  const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/pdf.min.mjs';
  const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/pdf.worker.min.mjs';

  function normalizeText(s) {
    return String(s || '')
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[－―−]/g, '-')
      .replace(/（/g, '(').replace(/）/g, ')')
      .replace(/％/g, '%')
      .replace(/，/g, ',')
      .replace(/[\u00A0\u2000-\u200B\u3000]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isoDate(y, m, d) {
    return String(y).padStart(4,'0') + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
  }

  function parseDate(text) {
    const m = text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
    return m ? isoDate(m[1], m[2], m[3]) : '';
  }

  function parseTitle(text) {
    const m = text.match(/([^\s]{2,50}テスト＜?4年生＞?)/);
    if (m) return m[1].replace(/<4年生>/, '＜4年生＞');
    const m2 = text.match(/([^\s]{2,50}(?:マンスリー|復習|組分け)[^\s]{0,30})/);
    return m2 ? m2[1] : 'SAPIXテスト';
  }

  function row(text, labelRe) {
    const re = new RegExp(labelRe + '\\s+(\\d{1,3})\\s*\\/\\s*(\\d{1,3})\\s+(\\d{2}(?:\\.\\d+)?)');
    const m = text.match(re);
    if (!m) return null;
    return { score:Number(m[1]), max:Number(m[2]), dev:Number(m[3]) };
  }

  function parseSummary(pageTexts) {
    const text = normalizeText((pageTexts || []).slice(0,4).join(' '));
    return {
      total4: row(text, '4科目計'),
      total3: row(text, '3科目計'),
      total2: row(text, '2科目計'),
      math: row(text, '算\\s*数'),
      jp: row(text, '国\\s*語'),
      science: row(text, '理\\s*科'),
      social: row(text, '社\\s*会')
    };
  }

  function parseMathSections(pageTexts, mathMax) {
    const target = Number(mathMax || 150);
    let best = [];
    for (const raw of (pageTexts || []).slice(0,4)) {
      const text = normalizeText(raw);
      const anchor = text.search(/分野\s+得点\s*\/\s*配点|設問内容別成績/);
      const source = anchor >= 0 ? text.slice(anchor) : text;
      const re = /(?:^|\s)([1-9])\s+(.{1,36}?)\s+(\d{1,3})\s*\/\s*(\d{1,3})\s+(\d{1,3}(?:\.\d+)?)(?=\s|$)/g;
      const rows = [];
      let sum = 0, m;
      while ((m = re.exec(source))) {
        const max = Number(m[4]);
        const score = Number(m[3]);
        const avg = Number(m[5]);
        if (!(max > 0 && max <= target && score >= 0 && score <= max && avg >= 0 && avg <= max)) continue;
        if (sum + max > target) {
          if (sum > 0) break;
          continue;
        }
        rows.push({
          no: Number(m[1]),
          name: m[2].trim(),
          score,
          max,
          avg,
          scoreRate: Math.round(score / max * 1000) / 10,
          avgRate: Math.round(avg / max * 1000) / 10
        });
        sum += max;
        if (sum === target) break;
      }
      if (sum === target && rows.length >= 2) return rows;
      if (rows.length > best.length) best = rows;
    }
    return best;
  }

  function questionMatches(text) {
    const out = [];
    const source = normalizeText(text)
      .replace(/(\d{1,3})\.\s+(\d)(?=\s)/g, '$1.$2');
    const re = /(?:^|\s)([1-9]\s*-\s*(?:\([^)]+\)|\d+(?:\([^)]+\))?)(?:[A-Za-zア-ンぁ-ん①-⑳一-龥]{0,5})?)\s+(\d{1,2})\s+(○|×)\s+(100(?:\.0)?|\d{1,2}(?:\.\d+)?)(?=\s|$)/g;
    let m;
    while ((m = re.exec(source))) {
      const id = m[1].replace(/\s+/g,'');
      const points = Number(m[2]);
      const rate = Number(m[4]);
      if (!(points > 0 && points <= 30 && rate >= 0 && rate <= 100)) continue;
      out.push({ id, points, correct:m[3] === '○', rate });
    }
    return out;
  }

  function parseMathQuestions(pageTexts, mathMax) {
    const target = Number(mathMax || 150);
    let best = [];
    for (const raw of (pageTexts || [])) {
      const rows = questionMatches(raw);
      if (rows.length < 5) continue;
      let sum = 0;
      const math = [];
      for (const q of rows) {
        if (sum + q.points > target) break;
        math.push(q);
        sum += q.points;
        if (sum === target) break;
      }
      if (sum === target && math.length >= 10) return math;
      if (math.length > best.length) best = math;
    }
    return best;
  }

  function classify(q) {
    if (!q.correct && q.rate >= 70) return {key:'must', label:'最優先：高正答率の取りこぼし', weight:500};
    if (!q.correct && q.rate >= 50) return {key:'target', label:'優先：50〜70%の失点', weight:400};
    if (!q.correct && q.rate >= 30) return {key:'growth', label:'成長域：30〜50%の失点', weight:260};
    if (!q.correct) return {key:'hard', label:'難問：30%未満', weight:120};
    if (q.rate < 30) return {key:'hardwin', label:'難問を獲得', weight:70};
    if (q.rate < 50) return {key:'stretchwin', label:'30〜50%を獲得', weight:60};
    return {key:'secure', label:'取るべき問題を確保', weight:10};
  }

  function sectionFocus(sections) {
    return (sections || []).map(s => ({
      ...s,
      delta: Math.round((s.scoreRate - s.avgRate) * 10) / 10,
      need: (s.avgRate - s.scoreRate) + (s.scoreRate < 70 ? 10 : 0)
    })).sort((a,b) => b.need - a.need);
  }

  function topicKeywords(name) {
    const n = String(name || '');
    const map = [
      [/計算/, ['計算','整数','数の性質']],
      [/平面図形/, ['平面図形','図形','角度','面積']],
      [/立体図形/, ['立体図形','立体','体積','展開図']],
      [/規則/, ['規則性','規則','周期','数列']],
      [/場合の数/, ['場合の数','場合分け','数え上げ','組合せ']],
      [/つるかめ/, ['つるかめ','差集め','条件整理']],
      [/過不足/, ['過不足','条件整理']],
      [/分数/, ['分数','数の性質']],
      [/速さ/, ['速さ','旅人算','通過算','流水算']],
      [/比|割合/, ['比','割合','比例']],
      [/数の性質/, ['数の性質','整数','倍数','約数','余り']]
    ];
    for (const [re, words] of map) if (re.test(n)) return words;
    if (/小問集合/.test(n)) return ['条件整理','逆向き思考'];
    return n.replace(/[0-9０-９（）()・]/g,' ').split(/\s+/).filter(x => x.length >= 2).slice(0,3);
  }

  function metrics(questions) {
    const qs = questions || [];
    const wrong = qs.filter(q => !q.correct);
    const must = wrong.filter(q => q.rate >= 70);
    const target = wrong.filter(q => q.rate >= 50 && q.rate < 70);
    const growth = wrong.filter(q => q.rate >= 30 && q.rate < 50);
    const hard = wrong.filter(q => q.rate < 30);
    const midWin = qs.filter(q => q.correct && q.rate >= 30 && q.rate < 50);
    const hardWin = qs.filter(q => q.correct && q.rate < 30);
    const pts = arr => arr.reduce((a,q) => a + q.points, 0);
    return {
      mustCount:must.length, mustPoints:pts(must),
      targetCount:target.length, targetPoints:pts(target),
      growthCount:growth.length, growthPoints:pts(growth),
      hardCount:hard.length, hardPoints:pts(hard),
      midWinCount:midWin.length, hardWinCount:hardWin.length,
      recoverablePoints:pts(must) + pts(target)
    };
  }

  function analyzePages(pageTexts, sourceName) {
    const pages = (pageTexts || []).map(normalizeText);
    const all = pages.join(' ');
    const summary = parseSummary(pages);
    const mathMax = summary.math && summary.math.max ? summary.math.max : 150;
    const sections = parseMathSections(pages, mathMax);
    const questions = parseMathQuestions(pages, mathMax).map(q => ({...q, bucket:classify(q).key, bucketLabel:classify(q).label}));
    const focusSections = sectionFocus(sections);
    const focusKeywords = [];
    focusSections.slice(0,3).forEach(s => topicKeywords(s.name).forEach(k => {
      if (!focusKeywords.includes(k)) focusKeywords.push(k);
    }));
    const rankedQuestions = questions.slice().sort((a,b) => {
      const aw = classify(a).weight + a.points * 10 + a.rate;
      const bw = classify(b).weight + b.points * 10 + b.rate;
      return bw - aw;
    });
    return {
      schema:2,
      source:'sapix-pdf',
      sourceName: String(sourceName || '').replace(/[^\w\-\.（）()＜＞一-龥ぁ-んァ-ン]/g,'').slice(0,80),
      importedAt:new Date().toISOString(),
      name:parseTitle(all),
      date:parseDate(all),
      summary,
      mathSections:sections,
      mathQuestions:rankedQuestions,
      metrics:metrics(questions),
      focusKeywords:focusKeywords.slice(0,10),
      causes:{},
      parseQuality:{
        summary:!!summary.math,
        sectionsTotal:sections.reduce((a,s)=>a+s.max,0),
        questionsTotal:questions.reduce((a,q)=>a+q.points,0),
        questionCount:questions.length
      }
    };
  }

  async function extractPdf(file, onProgress) {
    if (!file) throw new Error('PDFファイルが選択されていません。');
    if (file.size > 25 * 1024 * 1024) throw new Error('PDFが25MBを超えています。');
    if (onProgress) onProgress('PDF解析ライブラリを読み込み中…');
    const pdfjs = await import(PDFJS_URL);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    const data = new Uint8Array(await file.arrayBuffer());
    if (onProgress) onProgress('PDFを端末内で読み取り中…');
    const doc = await pdfjs.getDocument({data}).promise;
    const pages = [];
    for (let i=1; i<=doc.numPages; i++) {
      if (onProgress) onProgress('PDF ' + i + '/' + doc.numPages + 'ページを解析中…');
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const parts = [];
      let lastY = null;
      for (const item of content.items) {
        const y = item.transform && item.transform[5];
        if (lastY !== null && y !== undefined && Math.abs(y-lastY) > 3) parts.push('\n');
        parts.push(item.str || '');
        parts.push(' ');
        if (y !== undefined) lastY = y;
      }
      pages.push(parts.join(''));
    }
    return pages;
  }

  async function analyzePdf(file, onProgress) {
    const pages = await extractPdf(file, onProgress);
    const result = analyzePages(pages, file.name);
    if (!result.parseQuality.summary) throw new Error('SAPIX成績票の総合成績を読み取れませんでした。');
    if (result.parseQuality.questionsTotal !== (result.summary.math && result.summary.math.max || 150)) {
      result.warning = '設問別正答率の一部を読み取れませんでした。総合・分野別分析は利用できます。';
    }
    return result;
  }

  function analyzeText(text, sourceName) {
    const raw = String(text || '');
    const pages = raw.split(/(?:<PARSED TEXT FOR PAGE:|\f|---PAGE---)/i).filter(Boolean);
    return analyzePages(pages.length ? pages : [raw], sourceName || 'pasted-text');
  }

  window.SapixAnalyzer = {
    version:'2.2.0',
    pdfjsVersion:PDFJS_VERSION,
    analyzePdf,
    analyzeText,
    classify,
    topicKeywords
  };
})();