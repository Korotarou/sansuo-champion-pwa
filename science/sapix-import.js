(() => {
  'use strict';

  const PDFJS_VERSION='6.3.289';
  const PDFJS_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/'+PDFJS_VERSION+'/pdf.min.mjs';
  const PDFJS_WORKER_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/'+PDFJS_VERSION+'/pdf.worker.min.mjs';

  function normalizeText(s){
    return String(s||'')
      .replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))
      .replace(/[Ａ-Ｚａ-ｚ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))
      .replace(/[－―−]/g,'-')
      .replace(/（/g,'(').replace(/）/g,')')
      .replace(/％/g,'%').replace(/，/g,',')
      .replace(/[\u00A0\u2000-\u200B\u3000]/g,' ')
      .replace(/\s+/g,' ').trim();
  }
  function isoDate(y,m,d){
    return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  }
  function parseDate(text){
    const m=normalizeText(text).match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
    return m?isoDate(m[1],m[2],m[3]):'';
  }
  function mapTopic(name){
    const n=String(name||'').replace(/\s+/g,'');
    if(/星|天体/.test(n)) return '星の動き';
    if(/花|アブラナ|受粉|めしべ|おしべ/.test(n)) return '花のつくりと分類';
    if(/小問/.test(n)) return '小問集合';
    if(/水溶液|溶液|溶け|とけ/.test(n)) return '水溶液';
    if(/植物/.test(n)) return '植物';
    if(/ばね|てこ/.test(n)) return 'ばねとてこ';
    if(/動物|食物連鎖/.test(n)) return '動物の分類と食物連鎖';
    if(/ろうそく|燃焼|気体/.test(n)) return '燃焼と気体';
    return null;
  }
  function parseRows(raw){
    const text=normalizeText(raw);
    const anchor=text.search(/分野\s*得点\s*\/\s*配点\s*平均点|設問内容別成績/);
    const source=anchor>=0?text.slice(anchor):text;
    const re=/(?:^|\s)([1-9])\s+(.{1,42}?)\s+(\d{1,3})\s*\/\s*(\d{1,3})\s+(\d{1,3}(?:\.\d+)?)(?=\s|$)/g;
    const rows=[]; let m;
    while((m=re.exec(source))){
      const score=Number(m[3]), max=Number(m[4]), avg=Number(m[5]);
      if(!(max>0&&max<=150&&score>=0&&score<=max&&avg>=0&&avg<=max)) continue;
      rows.push({no:Number(m[1]),name:m[2].trim(),score,max,avg});
    }
    return rows;
  }
  function splitSubjects(rows){
    const targets=[150,150,100,100];
    const groups=[[],[],[],[]];
    let subject=0, subtotal=0;
    for(const row of rows){
      if(subject>=targets.length) break;
      if(subtotal+row.max>targets[subject]){
        if(subtotal===targets[subject]){ subject++; subtotal=0; }
        else continue;
      }
      if(subject>=targets.length) break;
      groups[subject].push(row);
      subtotal+=row.max;
      if(subtotal===targets[subject]){ subject++; subtotal=0; }
    }
    return groups;
  }
  function parseScienceSections(pageTexts){
    let best=[];
    for(const raw of (pageTexts||[]).slice(0,5)){
      const rows=parseRows(raw);
      if(rows.length<5) continue;
      const groups=splitSubjects(rows);
      const science=groups[2]||[];
      const total=science.reduce((a,r)=>a+r.max,0);
      if(total===100 && science.length>=2) return science;
      if(science.length>best.length) best=science;
    }
    return best;
  }
  function analyzePages(pageTexts){
    const sections=parseScienceSections(pageTexts);
    const all=(pageTexts||[]).join(' ');
    return {
      schema:1,
      source:'sapix-local-file',
      date:parseDate(all),
      sections:sections.map(r=>({
        rawName:r.name,
        topic:mapTopic(r.name),
        score:r.score,
        max:r.max,
        average:r.avg,
        scoreRate:Math.round(r.score/r.max*1000)/10,
        averageRate:Math.round(r.avg/r.max*1000)/10
      })),
      parseQuality:{
        sectionCount:sections.length,
        scienceTotal:sections.reduce((a,r)=>a+r.max,0),
        mappedCount:sections.filter(r=>mapTopic(r.name)).length
      }
    };
  }
  async function extractPdf(file,onProgress){
    if(file.size>25*1024*1024) throw new Error('PDFが25MBを超えています。');
    if(onProgress) onProgress('PDF解析ライブラリを読み込み中…');
    const pdfjs=await import(PDFJS_URL);
    pdfjs.GlobalWorkerOptions.workerSrc=PDFJS_WORKER_URL;
    const data=new Uint8Array(await file.arrayBuffer());
    if(onProgress) onProgress('PDFを端末内で読み取り中…');
    const doc=await pdfjs.getDocument({data}).promise;
    const pages=[];
    for(let i=1;i<=doc.numPages;i++){
      if(onProgress) onProgress('PDF '+i+'/'+doc.numPages+'ページを解析中…');
      const page=await doc.getPage(i);
      const content=await page.getTextContent();
      const parts=[]; let lastY=null;
      for(const item of content.items){
        const y=item.transform&&item.transform[5];
        if(lastY!==null&&y!==undefined&&Math.abs(y-lastY)>3) parts.push('\n');
        parts.push(item.str||''); parts.push(' ');
        if(y!==undefined) lastY=y;
      }
      pages.push(parts.join(''));
    }
    return pages;
  }
  async function analyzeFile(file,onProgress){
    if(!file) throw new Error('ファイルが選択されていません。');
    const name=String(file.name||'').toLowerCase();
    let pages;
    if(file.type==='application/pdf'||name.endsWith('.pdf')){
      pages=await extractPdf(file,onProgress);
    }else if(name.endsWith('.txt')||name.endsWith('.html')||name.endsWith('.htm')||file.type.startsWith('text/')){
      if(onProgress) onProgress('成績データを端末内で読み取り中…');
      const text=await file.text();
      pages=text.split(/(?:<PARSED TEXT FOR PAGE:|\f|---PAGE---)/i).filter(Boolean);
      if(!pages.length) pages=[text];
    }else{
      throw new Error('PDF、HTML、TXTの成績票に対応しています。');
    }
    const result=analyzePages(pages);
    if(result.parseQuality.scienceTotal!==100 || result.parseQuality.sectionCount<2){
      throw new Error('理科100点分の分野表を読み取れませんでした。手入力を利用してください。');
    }
    return result;
  }

  window.ScienceSapixImport={
    version:'1.0.0',
    pdfjsVersion:PDFJS_VERSION,
    analyzeFile,
    analyzeText:text=>analyzePages(String(text||'').split(/(?:<PARSED TEXT FOR PAGE:|\f|---PAGE---)/i).filter(Boolean)),
    mapTopic
  };
})();