/* Local classifier. Each label is represented by the bigrams in its examples. */
(() => {
  const examples = {
    office:["早上通勤上班","去公司工作","在辦公室見同事","跟客戶開會","公司開個會","今天要簡報","上班見客戶","午休跟同事吃飯"],
    casual:["週末出門逛街","去咖啡廳坐坐","跟朋友吃飯","出去走走放鬆","買菜跑腿","放假在家","日常輕鬆出門"],
    date:["晚上和伴侶約會","跟另一半吃飯","第一次約會","兩人晚餐","去見喜歡的人","跟女友看電影","跟男友約會","想要有點浪漫"],
    formal:["出席正式晚宴","參加婚禮","穿西裝的正式場合","去參加頒獎典禮","出席商務酒會","吃喜酒穿禮服","婚宴和典禮"],
    sport:["上健身房運動","去健身房流汗","戶外慢跑","去爬山健行","等一下要重訓","去打球流汗","騎車和戶外活動"],
    night:["今晚去酒吧","晚上和朋友喝酒","夜晚聚會要去派對","續攤去夜店","想去喝一杯","跟朋友去跨年派對"],
    low:["希望低調一點","香味輕一點","想要淡淡的","怕打擾別人","靠近才聞得到","想噴貼膚一點","味道柔和一些","希望擴散弱一點","香味不想太強烈"],
    high:["想有存在感","想要明顯一點","擴散強一點","香味要濃一點","希望比較有氣勢","想讓別人聞得到","想要令人印象深刻"]
  };
  const normalize = text => String(text).normalize("NFKC").toLowerCase();
  function bigrams(text) {
    const pairs = new Set();
    for (const word of normalize(text).replace(/一點|一些|一點點/gu," ").split(/[^\p{L}\p{N}]+/u)) {
      for (let i = 1; i < word.length; i++) pairs.add(word.slice(i-1,i+1));
    }
    return pairs;
  }
  const training = Object.entries(examples).map(([label,values]) => [label,values.map(bigrams)]);
  function classify(input, labels) {
    const query = bigrams(input);
    const ranked = training.filter(([label]) => labels.includes(label)).map(([label,vectors]) => {
      const score = Math.max(...vectors.map(vector => {
        const overlap = [...vector].filter(term => query.has(term)).length;
        return overlap < 2 ? 0 : overlap / Math.sqrt(vector.size * Math.min(15,query.size));
      }));
      return {label,score};
    }).sort((a,b) => b.score-a.score);
    return ranked[0].score >= .24 && ranked[0].score - ranked[1].score >= .045 ? ranked[0].label : undefined;
  }

  const scentTerms = {
    woody:"木質|木頭|木香", citrus:"柑橘|佛手柑|葡萄柚|檸檬", fresh:"清爽|清新|乾淨", aquatic:"水生|水感|海洋|海風",
    sweet:"甜|美食調|焦糖", amber:"琥珀", musky:"麝香", floral:"花香|花味|花調", powdery:"粉感|粉味", green:"綠意|綠葉|青草",
    smoky:"煙燻|煙味|菸草", oud:"沉香|烏木", leather:"皮革", rose:"玫瑰", vanilla:"香草|香莢蘭", fruity:"果香|水果|果味",
    herbal:"草本", vetiver:"岩蘭草", tea:"茶香|茶味", spicy:"辛香|辛辣", balsamic:"焚香|乳香|香脂"
  };
  const matchMood = /(不要|不想要?|不喜歡|不愛|不偏好|避免|排除|別|拒絕|少一點|怕|無)(?:有|太|過於|很|那種|偏|一點|很重的)*/u;
  const neutral = /^(?:都可以|不限|無所謂|皆可|也行|沒差)/u;
  function parseIntent(text) {
    const input = normalize(text).slice(0,180);
    const clauses = input.split(/[，。！？,.!?；;]|不過|但是|(?=但)/u).filter(Boolean);
    const positive = clauses.map(clause => clause.split(/不是|並非|不要|不想|不喜歡|別|避免|排除/u)[0]).join(" ");
    const found = {};
    const day = /白天|早上|上午|中午|下午|今早/u.test(positive);
    const night = /今天晚上|今晚|傍晚|晚上|夜晚|夜間|半夜/u.test(positive);
    if (day !== night) found.period = day ? "day" : "night";
    const explicitOcc = Object.entries({
      office:/上班|通勤|辦公/u, casual:/休閒/u, date:/約會/u, formal:/正式|晚宴|婚禮/u,
      sport:/運動|健身/u, night:/夜晚聚會|夜店/u
    }).filter(([,pattern]) => pattern.test(positive));
    const occ = explicitOcc.length === 1 ? explicitOcc[0][0] :
      classify(positive,["office","casual","date","formal","sport","night"]);
    if (occ) found.occ = occ;
    const diffusion = /(?:不要|不想要?|別|避免|怕)(?:太|過於|那麼)?(?:濃|重|強|明顯|高調|刺鼻|有存在感)|(?:不要|別)太香|不想讓.{0,12}聞到/u.test(input) ? "low" :
      /(?:不要|不想要?|別)(?:太|過於)?(?:淡|弱|低調|貼膚)/u.test(input) ? "high" :
        /低調|貼膚|淡淡|輕一點/u.test(positive) ? "low" :
          /有存在感|擴散強/u.test(positive) ? "high" : classify(positive,["low","high"]);
    if (diffusion) found.diffusion = diffusion;
    const preferences = new Map();
    const terms = new RegExp(Object.values(scentTerms).join("|"),"gu");
    for (const clause of clauses) {
      let cursor = 0, priorNegative = false;
      for (const match of clause.matchAll(terms)) {
        const term = match[0], family = Object.keys(scentTerms).find(key => scentTerms[key].split("|").includes(term));
        const lead = clause.slice(cursor,match.index);
        const tail = clause.slice(match.index+term.length);
        cursor = match.index+term.length;
        if (neutral.test(tail) || /[不無](?:要|有)?太?$/u.test(lead) && !matchMood.test(lead)) continue;
        const negative = matchMood.test(lead) || /^(?:不要|太重就不要|少一點)/u.test(tail) ||
          (priorNegative && /^(?:[、\s]|或是?|以及|跟|和|及)*$/u.test(lead));
        preferences.set(family,!negative);
        priorNegative = negative;
      }
    }
    const prefer = [...preferences].filter(([,value]) => value).map(([family]) => family);
    const avoid = [...preferences].filter(([,value]) => !value).map(([family]) => family);
    if (prefer.length) found.prefer = prefer;
    if (avoid.length) found.avoid = avoid;
    return found;
  }

  function exactChoice(candidates, exact) {
    return candidates.length === 1 && exact.length === 1 ? exact[0] : null;
  }

  // Find the light neutral region connected to the outer edge. Interior labels and highlights are left intact.
  function removeBottleBackground(data,width,height) {
    const size = width*height, queue = new Uint32Array(size), seen = new Uint8Array(size);
    let read = 0, end = 0;
    function add(index) {
      if (seen[index]) return;
      seen[index] = 1;
      const i = index*4, min = Math.min(data[i],data[i+1],data[i+2]), max = Math.max(data[i],data[i+1],data[i+2]);
      if (data[i+3] !== 255 || min < 237 || max-min > 15) return;
      queue[end++] = index;
    }
    for (const i of [0,width-1,size-width,size-1]) add(i);
    if (end < 3) return false;
    for (let x = 0; x < width; x++) { add(x); add(size-width+x); }
    for (let y = 1; y < height-1; y++) { add(y*width); add((y+1)*width-1); }
    while (read < end) {
      const i = queue[read++], x = i%width;
      if (x > 0) add(i-1);
      if (x < width-1) add(i+1);
      if (i >= width) add(i-width);
      if (i < size-width) add(i+width);
    }
    if (end < size*.07 || end > size*.94) return false;
    for (let i = 0; i < end; i++) data[queue[i]*4+3] = 0;
    return true;
  }

  const features = {parseIntent,exactChoice,removeBottleBackground};
  if (typeof module !== "undefined" && module.exports) module.exports = features;
  else globalThis.PerfumeEnrichment = features;
})();
