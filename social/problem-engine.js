(() => {
  const D = window.SOCIAL_DATA;
  const uniq = arr => [...new Set(arr)];
  function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
  function seededShuffle(arr, seed){const a=[...arr];let x=seed||1;for(let i=a.length-1;i>0;i--){x=(Math.imul(1664525,x)+1013904223)>>>0;const j=x%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
  function choices(answer,pool,id,n=4){const rest=seededShuffle(pool.filter(x=>x!==answer),hash(id)).slice(0,n-1);return seededShuffle([answer,...rest],hash(id+'-choices'))}
  function rub(label, keys){return {label,keys:Array.isArray(keys)?keys:[keys]}}

  const bank=[];
  const regions=['北海道','東北','関東','中部','近畿','中国','四国','九州・沖縄'];
  const capitals=D.prefs.map(x=>x[1]);
  D.prefs.forEach(([pref,capital,region],i)=>{
    let id=`G-PREF-CAP-${String(i+1).padStart(2,'0')}`;
    bank.push({id,domain:'地理',unit:'都道府県',level:1,type:'mcq',prompt:`${pref}の都道府県庁所在地はどこ？`,choices:choices(capital,capitals,id),answer:capital,explanation:`${pref}の都道府県庁所在地は${capital}。県名と同じとは限らないので、地図上の位置とセットで覚える。`,hint:'県名と同じ市名かどうかを先に決めつけず、地方→県→中心都市の順で思い出そう。'});
    id=`G-PREF-REG-${String(i+1).padStart(2,'0')}`;
    bank.push({id,domain:'地理',unit:'都道府県',level:1,type:'mcq',prompt:`${pref}はどの地方に入る？`,choices:choices(region,regions,id),answer:region,explanation:`${pref}は${region}地方に入る。`,hint:'日本列島を北から8つの地方に区切って位置を思い出そう。'});
  });

  const geoTopics=D.geo.map(x=>x[0]);
  D.geo.forEach(([topic,feature,cause,effect,keys],i)=>{
    const no=String(i+1).padStart(2,'0');
    let id=`G-CONCEPT-${no}`;
    bank.push({id,domain:'地理',unit:'地理因果',level:2,type:'mcq',source:`特徴：${feature}`,prompt:'この特徴と最も関係が深い項目はどれ？',choices:choices(topic,geoTopics,id),answer:topic,explanation:`${topic}。${cause}。`,hint:'場所・気候・産業・交通のどの種類の話かを先に分類しよう。'});
    id=`G-CAUSE-${no}`;
    bank.push({id,domain:'地理',unit:'地理因果',level:2,type:'short',source:`${topic}：${feature}`,prompt:'この特徴が生じる理由を1〜2文で説明しよう。',rubrics:[rub(cause,keys)],model:cause+'。',hint:'「何がある／どこにある」だけで終わらず、それがどう働くかまでつなげよう。'});
    id=`G-EFFECT-${no}`;
    bank.push({id,domain:'地理',unit:'地理因果',level:3,type:'short',source:`${topic}：${feature}\n理由：${cause}`,prompt:'この条件が人の暮らし・産業・防災にどんな影響を与えるか説明しよう。',rubrics:[rub(effect,uniq(effect.match(/[一-龠ぁ-んァ-ヶー]{2,}/g)||[effect]).slice(0,3))],model:effect+'。',hint:'資料にある自然条件や交通条件が、人の行動をどう変えるか考えよう。'});
  });

  const eras=uniq(D.history.map(x=>x[0]));
  D.history.forEach(([era,name,cause,effect],i)=>{
    const no=String(i+1).padStart(2,'0');
    let id=`H-ERA-${no}`;
    bank.push({id,domain:'歴史',unit:'時代判定',level:2,type:'mcq',prompt:`「${name}」は主にどの時代の出来事？`,choices:choices(era,eras,id),answer:era,explanation:`「${name}」は${era}時代。出来事名だけでなく、前後の流れとセットで覚える。`,hint:'人物・政治の中心地・前後の出来事から時代を絞ろう。'});
    id=`H-CAUSE-${no}`;
    bank.push({id,domain:'歴史',unit:'原因→出来事',level:3,type:'short',prompt:`「${name}」が起きた背景・理由を説明しよう。`,rubrics:[rub(cause,uniq(cause.match(/[一-龠ぁ-んァ-ヶー]{2,}/g)||[cause]).slice(0,3))],model:cause+'。',hint:'その出来事の直前に、だれが何に困っていたか・何を求めていたかを考えよう。'});
    id=`H-EFFECT-${no}`;
    bank.push({id,domain:'歴史',unit:'出来事→結果',level:3,type:'short',prompt:`「${name}」の後、政治や社会はどう変わった？`,rubrics:[rub(effect,uniq(effect.match(/[一-龠ぁ-んァ-ヶー]{2,}/g)||[effect]).slice(0,3))],model:effect+'。',hint:'「起きたこと」の言い換えではなく、その後に何が変化したかを答えよう。'});
  });

  const civTerms=D.civics.map(x=>x[0]);
  D.civics.forEach(([term,def,example,anchor],i)=>{
    const no=String(i+1).padStart(2,'0');
    let id=`C-DEF-${no}`;
    bank.push({id,domain:'公民',unit:'制度・用語',level:2,type:'mcq',prompt:`「${def}」に当てはまる言葉は？`,choices:choices(term,civTerms,id),answer:term,explanation:`${term}：${def}。`,hint:`具体例「${example}」から、だれが何をする仕組みか考えよう。`});
    id=`C-EX-${no}`;
    bank.push({id,domain:'公民',unit:'制度・用語',level:2,type:'mcq',source:`例：${example}`,prompt:'この例と最も関係が深い用語はどれ？',choices:choices(term,civTerms,id),answer:term,explanation:`${term}の具体例として考えられる。${def}。`,hint:'例の中で「だれが」「何をしているか」を抜き出そう。'});
    id=`C-EXPLAIN-${no}`;
    bank.push({id,domain:'公民',unit:'制度説明',level:3,type:'short',prompt:`「${term}」とはどんなもの？ 小学生にも分かるように説明しよう。`,rubrics:[rub(def,[anchor,...uniq(def.match(/[一-龠]{2,}/g)||[]).slice(0,2)])],model:`${def}。たとえば、${example}。`,hint:'用語をそのまま繰り返さず、「だれが・何を・何のために」のどれかを入れよう。'});
  });

  D.challenges.forEach(([theme,source,prompt,rubrics,hint],i)=>{
    const id=`X-${String(i+1).padStart(2,'0')}`;
    bank.push({id,domain:'最難関',unit:theme,level:4,type:'short',source,prompt,rubrics:rubrics.map(([label,keys])=>rub(label,keys)),model:rubrics.map(x=>x[0]).join('。')+'。',hint});
  });

  const byId=Object.fromEntries(bank.map(q=>[q.id,q]));
  function get(id){return byId[id]||null}
  function list(filter={}){return bank.filter(q=>(!filter.domain||q.domain===filter.domain)&&(!filter.unit||q.unit===filter.unit)&&(!filter.level||q.level===filter.level))}
  function pick(filter={},exclude=[]){const xs=list(filter).filter(q=>!exclude.includes(q.id));const pool=xs.length?xs:list(filter);return pool[Math.floor(Math.random()*pool.length)]||null}
  function count(){return bank.length}
  window.SocialEngine={bank,get,list,pick,count};
})();
