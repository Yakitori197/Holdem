import { useState, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   CORE ENGINE (main thread, chunked via setTimeout)
   ═══════════════════════════════════════════════════════════════════════ */

function R(c) { return (c >> 2) + 2; }
function S(c) { return c & 3; }

function fullDeck() {
  const d = [];
  for (let r = 0; r < 13; r++) for (let s = 0; s < 4; s++) d.push(r * 4 + s);
  return d;
}

function remainingDeck(known) {
  const set = new Set(known);
  return fullDeck().filter(c => !set.has(c));
}

function makeRng(seed) {
  let s = [seed >>> 0, (seed * 1597334677) >>> 0, (seed * 2654435769) >>> 0, (seed * 3449720903) >>> 0];
  if (!s[0] && !s[1] && !s[2] && !s[3]) s[0] = 1;
  const rotl = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0;
  return () => {
    const result = (rotl((s[1] * 5) >>> 0, 7) * 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t; s[3] = rotl(s[3], 11);
    return result / 4294967296;
  };
}

function sampleK(arr, k, rng) {
  const n = arr.length, out = arr.slice();
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (n - i));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, k);
}

const COMBOS7 = [];
for (let a = 0; a < 7; a++) for (let b = a+1; b < 7; b++) for (let c = b+1; c < 7; c++)
  for (let d = c+1; d < 7; d++) for (let e = d+1; e < 7; e++) COMBOS7.push([a,b,c,d,e]);

function eval5(r0,r1,r2,r3,r4,s0,s1,s2,s3,s4) {
  const cnt = new Int8Array(15);
  cnt[r0]++; cnt[r1]++; cnt[r2]++; cnt[r3]++; cnt[r4]++;
  const fours=[],threes=[],pairs=[],singles=[];
  for (let r=14;r>=2;r--) { const c=cnt[r]; if(c===4)fours.push(r);else if(c===3)threes.push(r);else if(c===2)pairs.push(r);else if(c===1)singles.push(r); }
  const isFlush=s0===s1&&s1===s2&&s2===s3&&s3===s4;
  let isStraight=false,sHi=0;
  if(singles.length===5){if(singles[0]-singles[4]===4){isStraight=true;sHi=singles[0];}else if(singles[0]===14&&singles[1]===5&&singles[2]===4&&singles[3]===3&&singles[4]===2){isStraight=true;sHi=5;}}
  if(isStraight&&isFlush)return[8,sHi];
  if(fours.length)return[7,fours[0],threes.length?threes[0]:pairs.length?pairs[0]:singles[0]];
  if(threes.length&&pairs.length)return[6,threes[0],pairs[0]];
  if(isFlush)return[5,...singles];
  if(isStraight)return[4,sHi];
  if(threes.length)return[3,threes[0],singles[0],singles[1]];
  if(pairs.length>=2)return[2,pairs[0],pairs[1],singles.length?singles[0]:0];
  if(pairs.length)return[1,pairs[0],singles[0],singles[1],singles[2]];
  return[0,...singles];
}

function best5of7(seven) {
  const r=seven.map(R),s=seven.map(S);
  let best=[-1];
  for(const[a,b,c,d,e]of COMBOS7){const sc=eval5(r[a],r[b],r[c],r[d],r[e],s[a],s[b],s[c],s[d],s[e]);if(cmpA(sc,best)>0)best=sc;}
  return best;
}

function cmpA(a,b){const m=Math.min(a.length,b.length);for(let i=0;i<m;i++)if(a[i]!==b[i])return a[i]-b[i];return a.length-b.length;}

/* bestHand: general version for 5, 6, or 7 cards */
function bestHand(cards) {
  if (cards.length < 5) return null;
  if (cards.length === 5) {
    const r = cards.map(R), s = cards.map(S);
    return eval5(r[0],r[1],r[2],r[3],r[4],s[0],s[1],s[2],s[3],s[4]);
  }
  if (cards.length === 7) return best5of7(cards);
  /* 6 cards: C(6,5)=6 combos */
  const n = cards.length;
  let best = [-1];
  const gen = (start, ch) => {
    if (ch.length === 5) {
      const r = ch.map(i=>R(cards[i])), s = ch.map(i=>S(cards[i]));
      const sc = eval5(r[0],r[1],r[2],r[3],r[4],s[0],s[1],s[2],s[3],s[4]);
      if (cmpA(sc,best)>0) best=sc;
      return;
    }
    for (let i=start;i<n;i++){ch.push(i);gen(i+1,ch);ch.pop();}
  };
  gen(0,[]);
  return best;
}

/* Async chunked equity calc */
function calcEquityAsync(heroPacked, boardPacked, iters, seed, onProgress, onDone) {
  const rem = remainingDeck(heroPacked.concat(boardPacked));
  const boardLen = boardPacked.length;
  const t0 = performance.now();
  const rng = makeRng(seed !== null ? seed : Math.floor(Math.random() * 2147483647));
  let win=0, tie=0, lose=0, total=0, method="monte_carlo";

  if (boardLen === 5) {
    method = "exhaustive";
    const hScore = best5of7([...heroPacked,...boardPacked]);
    for(let i=0;i<rem.length;i++)for(let j=i+1;j<rem.length;j++){
      const c=cmpA(hScore,best5of7([rem[i],rem[j],...boardPacked]));
      if(c>0)win++;else if(c===0)tie++;else lose++;total++;
    }
    onDone({win:win/total,tie:tie/total,lose:lose/total,samples:total,elapsed:(performance.now()-t0)/1000,method});
    return {cancel:()=>{}};
  }

  let cancelled = false;
  const CHUNK = 2000;

  if (boardLen === 4) {
    method = "river_enum+MC";
    const oppPerRiver = Math.max(1, Math.floor(iters / rem.length));
    let ri = 0, k = 0;
    const tick = () => {
      if (cancelled) return;
      const deadline = performance.now() + 30;
      while (ri < rem.length && performance.now() < deadline) {
        const riverCard = rem[ri];
        const fullBoard = [...boardPacked, riverCard];
        const rem2 = rem.filter(c => c !== riverCard);
        const hScore = best5of7([...heroPacked, ...fullBoard]);
        while (k < oppPerRiver && performance.now() < deadline) {
          const opp = sampleK(rem2, 2, rng);
          const c = cmpA(hScore, best5of7([...opp, ...fullBoard]));
          if(c>0)win++;else if(c===0)tie++;else lose++;total++;k++;
        }
        if (k >= oppPerRiver) { ri++; k = 0; }
      }
      if (ri < rem.length) { onProgress(total, oppPerRiver * rem.length); setTimeout(tick, 0); }
      else onDone({win:win/total,tie:tie/total,lose:lose/total,samples:total,elapsed:(performance.now()-t0)/1000,method});
    };
    setTimeout(tick, 0);
  } else {
    const needed = (5 - boardLen) + 2;
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      const end = Math.min(i + CHUNK, iters);
      for (; i < end; i++) {
        const drawn = sampleK(rem, needed, rng);
        const simBoard = boardPacked.concat(drawn.slice(0, 5 - boardLen));
        const opp = drawn.slice(5 - boardLen, 5 - boardLen + 2);
        const c = cmpA(best5of7([...heroPacked,...simBoard]), best5of7([...opp,...simBoard]));
        if(c>0)win++;else if(c===0)tie++;else lose++;
      }
      total = i;
      if (i < iters) { onProgress(i, iters); setTimeout(tick, 0); }
      else onDone({win:win/total,tie:tie/total,lose:lose/total,samples:total,elapsed:(performance.now()-t0)/1000,method});
    };
    setTimeout(tick, 0);
  }
  return { cancel: () => { cancelled = true; } };
}

/* ═══════════════════════════════════════════════════════════════════════
   HAND ANALYSIS ENGINE
   ═══════════════════════════════════════════════════════════════════════ */

const HAND_ZH = ["高牌","一對","兩對","三條","順子","同花","葫蘆","四條","同花順"];

function rl(r) {
  return ["","","2","3","4","5","6","7","8","9","10","J","Q","K","A"][r] || "?";
}

function formatHandName(score) {
  if (!score || score[0] < 0) return "無法判定";
  const t = score[0], name = HAND_ZH[t];
  switch (t) {
    case 0: return `${name}（${rl(score[1])}-high）`;
    case 1: return `${name}（${rl(score[1])}，踢腳 ${rl(score[2])}）`;
    case 2: return `${name}（${rl(score[1])} 與 ${rl(score[2])}，踢腳 ${rl(score[3])}）`;
    case 3: return `${name}（${rl(score[1])}，踢腳 ${rl(score[2])} ${rl(score[3])}）`;
    case 4: return `${name}（${rl(score[1])}-high）`;
    case 5: return `${name}（${rl(score[1])}-high）`;
    case 6: return `${name}（${rl(score[1])} 滿 ${rl(score[2])}）`;
    case 7: return `${name}（${rl(score[1])}，踢腳 ${rl(score[2])}）`;
    case 8: return score[1] === 14 ? "皇家同花順" : `${name}（${rl(score[1])}-high）`;
    default: return name;
  }
}

function analyzeBoard(boardPacked) {
  if (!boardPacked || !boardPacked.length) return { hasPair:false, hasTrips:false, pairedRanks:[], has3Flush:false, has4Flush:false, isStraighty:false };
  const ranks = boardPacked.map(R), suits = boardPacked.map(S);
  const rc = {};
  ranks.forEach(r => { rc[r] = (rc[r]||0)+1; });
  const pairedRanks = Object.entries(rc).filter(([,c])=>c>=2).map(([r])=>+r);
  const hasPair = pairedRanks.length > 0;
  const hasTrips = Object.values(rc).some(c=>c>=3);
  const sc = [0,0,0,0];
  suits.forEach(s => sc[s]++);
  const mx = Math.max(...sc);
  const has3Flush = mx >= 3, has4Flush = mx >= 4;
  const sorted = [...new Set(ranks)].sort((a,b)=>a-b);
  let maxCon=1, con=1;
  for(let i=1;i<sorted.length;i++){if(sorted[i]===sorted[i-1]+1){con++;if(con>maxCon)maxCon=con;}else con=1;}
  if(sorted.includes(14)&&sorted.includes(2)){let lc=2;for(let r=3;r<=5;r++){if(sorted.includes(r))lc++;else break;}if(lc>maxCon)maxCon=lc;}
  return { hasPair, hasTrips, pairedRanks, has3Flush, has4Flush, isStraighty: maxCon>=3 };
}

function produceRiskBadges(ba) {
  const b = [];
  if (ba.hasTrips) b.push("公牌三條（可能出現葫蘆/四條）");
  else if (ba.hasPair) b.push("公牌成對（可能出現葫蘆/四條）");
  if (ba.has4Flush) b.push("四同花（同花已成立，注意更高同花）");
  else if (ba.has3Flush) b.push("同花面（對手可能完成同花/更高同花）");
  if (ba.isStraighty) b.push("順子面（對手可能完成順子/更高順子）");
  return b;
}

function generateAnalysis(heroScore, ba, winPct) {
  if (!heroScore || heroScore[0]<0) return {whyNot:"",loseTo:[]};
  if (winPct >= 0.999) return {whyNot:"你的牌型極強，幾乎不可能被擊敗。",loseTo:[]};
  const ht = heroScore[0];
  let whyNot="", loseTo=[];
  switch(ht){
    case 8:
      if(heroScore[1]<14){loseTo=["更高同花順"];whyNot="對手可能持有更高的同花順。";}
      else whyNot="你已持有皇家同花順，極難被擊敗。";
      break;
    case 7:
      loseTo=["更高四條","同花順"];
      whyNot="雖然四條極強，但對手仍可能有同花順或更高四條。";
      break;
    case 6:
      loseTo=["更高葫蘆","四條","同花順"];
      whyNot="對手可能形成更高葫蘆、四條或同花順。";
      break;
    case 5:
      if(ba.hasPair||ba.hasTrips){loseTo.push("葫蘆","四條");whyNot="牌面成對，對手可能形成葫蘆或四條，擊敗你的同花。";}
      loseTo.push("更高同花","同花順");
      if(!whyNot)whyNot="對手可能拿到更高同花而反超。";
      break;
    case 4:
      if(heroScore[1]<14)loseTo.push("更高順子");
      loseTo.push("同花","葫蘆","四條","同花順");
      whyNot=ba.hasPair?"牌面成對，對手可能形成葫蘆或四條；也可能有同花或更高順子。":"對手可能形成更高順子、同花或葫蘆等更強牌型。";
      break;
    case 3:
      loseTo=["更高三條","順子","同花","葫蘆","四條"];
      whyNot="對手可能有更高三條、順子、同花等更強牌型。";
      break;
    case 2:
      loseTo=["更高兩對","三條","順子","同花","葫蘆"];
      whyNot="對手可能有更高兩對、三條、順子或同花等牌型。";
      break;
    case 1:
      loseTo=["更高一對","兩對","三條","順子","同花"];
      whyNot="你僅有一對，對手容易以兩對、三條或更高牌型擊敗。";
      break;
    case 0:
      loseTo=["任意一對以上牌型","更高高牌"];
      whyNot="你僅有高牌，對手只需一對即可擊敗。";
      break;
  }
  return {whyNot,loseTo:[...new Set(loseTo)].slice(0,4)};
}

function generateBeatConditions(heroScore, ba) {
  if(!heroScore||heroScore[0]<0)return [];
  const ht=heroScore[0], c=[];
  switch(ht){
    case 5:
      if(ba.hasPair||ba.hasTrips){
        ba.pairedRanks.forEach(r=>c.push(`對手持有任一張 ${rl(r)}，可能組成三條甚至葫蘆/四條，擊敗你的同花`));
        c.push("對手持有與牌面配對的組合，可能形成葫蘆");
      }
      c.push("對手持有更高的同花牌（同花色更高牌面），可形成更高同花");
      c.push("對手持有同花色的連張，可能形成同花順");
      break;
    case 4:
      c.push("對手持有形成更高順子的牌，可擊敗你的順子");
      c.push("對手持有同花色五張牌，可形成同花");
      if(ba.hasPair)ba.pairedRanks.forEach(r=>c.push(`牌面有 ${rl(r)} 對子，對手持有 ${rl(r)} 可能形成葫蘆/四條`));
      break;
    case 3:
      c.push("對手持有更高的三條");
      c.push("對手持有形成順子或同花的牌組合");
      if(ba.has3Flush||ba.has4Flush)c.push("牌面有同花面，對手可能湊齊同花");
      break;
    case 2:
      c.push("對手持有更高的兩對（比較最高對子）");
      c.push("對手持有三條、順子或同花等更強牌型");
      break;
    case 1:
      c.push("對手持有更高的一對，或能形成兩對/三條");
      c.push("對手持有形成順子或同花的牌");
      break;
    case 0:
      c.push("對手持有任何一對以上的牌型即可擊敗");
      c.push("對手持有更高的高牌也可能勝出");
      break;
    case 6:
      c.push("對手持有更高的葫蘆（更高三條部分）");
      c.push("對手持有四條或同花順");
      break;
    case 7:
      c.push("對手持有更高的四條");
      c.push("對手持有同花順");
      break;
    case 8:
      c.push(heroScore[1]<14?"對手持有更高的同花順":"皇家同花順，幾乎無法被擊敗");
      break;
  }
  return c.slice(0,6);
}

/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTS & STYLE TOKENS
   ═══════════════════════════════════════════════════════════════════════ */
const RANK_LABELS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUIT_SYMBOLS = ["♠","♥","♦","♣"];
const SUIT_COLORS = ["#cbd5e1","#ef4444","#60a5fa","#4ade80"];
const RANK_TO_INT = Object.fromEntries(RANK_LABELS.map((r,i)=>[r,i+2]));
const SUIT_TO_INT = Object.fromEntries(SUIT_SYMBOLS.map((s,i)=>[s,i]));
function packCard(rank,suit){return(RANK_TO_INT[rank]-2)*4+SUIT_TO_INT[suit];}
const PREC={fast:{label:"快速",iters:20000},standard:{label:"標準",iters:200000},high:{label:"高精度",iters:1000000}};
const ft = "'Libre Caslon Text',Georgia,serif";
const mn = "'Source Code Pro','Courier New',monospace";
const sn = "'Nunito Sans','Segoe UI',sans-serif";

/* ═══════════════════════════════════════════════════════════════════════
   UI COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

const selSty={background:"#1a2a1a",color:"#b0c4a8",border:"1px solid rgba(255,255,255,0.1)",borderRadius:4,padding:"2px 3px",fontSize:12,fontFamily:sn,outline:"none",cursor:"pointer",width:36};

function CardSlot({rank,suit,onSelect,label}) {
  const has=rank&&suit;
  const sc=suit?SUIT_COLORS[SUIT_TO_INT[suit]]:null;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
      <span style={{fontSize:10,color:"#78866f",letterSpacing:1.5,fontFamily:sn,fontWeight:700}}>{label}</span>
      <div style={{width:60,height:84,borderRadius:7,background:has?"linear-gradient(160deg,#faf3e0,#f0e2b8,#e8d9a0)":"#1c2a1c",border:has?"2px solid #c5b47b":"2px dashed rgba(255,255,255,0.08)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",transition:"all 0.25s",boxShadow:has?"0 3px 12px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.8)":"none"}}>
        {has?(<><span style={{fontSize:21,fontWeight:700,color:sc==="#cbd5e1"?"#1e293b":sc,fontFamily:ft,lineHeight:1}}>{rank}</span><span style={{fontSize:18,color:sc==="#cbd5e1"?"#1e293b":sc,lineHeight:1,marginTop:1}}>{suit}</span></>):(<span style={{fontSize:20,color:"rgba(255,255,255,0.06)"}}>?</span>)}
      </div>
      <div style={{display:"flex",gap:3}}>
        <select value={rank||""} onChange={e=>onSelect(e.target.value,suit)} style={selSty}><option value="">-</option>{RANK_LABELS.map(r=><option key={r} value={r}>{r}</option>)}</select>
        <select value={suit||""} onChange={e=>onSelect(rank,e.target.value)} style={selSty}><option value="">-</option>{SUIT_SYMBOLS.map(s=><option key={s} value={s}>{s}</option>)}</select>
      </div>
    </div>
  );
}

function Bar({win,tie,lose}){const w=win*100,t=tie*100,l=lose*100;return(<div style={{width:"100%",height:28,borderRadius:6,overflow:"hidden",display:"flex",border:"1px solid rgba(255,255,255,0.06)",boxShadow:"inset 0 2px 6px rgba(0,0,0,0.3)"}}><div style={{width:`${w}%`,background:"linear-gradient(135deg,#22c55e,#16a34a)",transition:"width 0.5s",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff"}}>{w>9?`${w.toFixed(1)}%`:""}</div><div style={{width:`${t}%`,background:"linear-gradient(135deg,#94a3b8,#64748b)",transition:"width 0.5s",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff"}}>{t>9?`${t.toFixed(1)}%`:""}</div><div style={{width:`${l}%`,background:"linear-gradient(135deg,#ef4444,#dc2626)",transition:"width 0.5s",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff"}}>{l>9?`${l.toFixed(1)}%`:""}</div></div>);}

function Stat({label,value,samples,color,method}){const pct=(value*100).toFixed(2);const isE=method==="exhaustive";const ci=isE?0:1.96*Math.sqrt(value*(1-value)/samples)*100;return(<div style={{textAlign:"center",minWidth:90}}><div style={{fontSize:10,color:"#78866f",letterSpacing:2,marginBottom:3,fontFamily:sn,fontWeight:700}}>{label}</div><div style={{fontSize:26,fontWeight:700,fontFamily:ft,color,lineHeight:1}}>{pct}%</div><div style={{fontSize:10,color:"#607060",marginTop:3,fontFamily:mn}}>{isE?"精確計算":`±${ci.toFixed(2)}%`}</div></div>);}

function Section({title,children}){return(<div style={{marginTop:20}}><div style={{fontSize:10,fontWeight:800,color:"#a08c5a",letterSpacing:2.5,marginBottom:8,fontFamily:sn}}>{title}</div><div style={{background:"rgba(255,255,255,0.025)",borderRadius:10,border:"1px solid rgba(255,255,255,0.05)",padding:18}}>{children}</div></div>);}

/* ═══════════════════════════════════════════════════════════════════════
   HAND ANALYSIS PANEL
   ═══════════════════════════════════════════════════════════════════════ */

function HandAnalysisPanel({heroScore,boardAnalysis,winPct,boardLen}) {
  const handName = formatHandName(heroScore);
  const analysis = generateAnalysis(heroScore, boardAnalysis, winPct);
  const risks = produceRiskBadges(boardAnalysis);
  const beats = generateBeatConditions(heroScore, boardAnalysis);
  const partial = boardLen < 5;

  const lbl={fontSize:11,color:"#78866f",fontWeight:700,letterSpacing:1,marginBottom:4,fontFamily:sn};
  const txt={fontSize:13,color:"#b8ccb0",lineHeight:1.7,marginBottom:14};
  const badge={display:"inline-block",fontSize:11.5,color:"#d4a844",background:"rgba(212,168,68,0.08)",border:"1px solid rgba(212,168,68,0.18)",borderRadius:5,padding:"4px 10px",marginRight:6,marginBottom:6};

  return (
    <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,border:"1px solid rgba(255,255,255,0.05)",padding:20,marginTop:16}}>
      <div style={{fontSize:10,fontWeight:800,color:"#a08c5a",letterSpacing:2.5,marginBottom:14,fontFamily:sn}}>手牌分析</div>

      {partial&&(<div style={{fontSize:11,color:"#8a7a50",background:"rgba(197,180,123,0.06)",borderRadius:6,padding:"6px 10px",marginBottom:12,border:"1px solid rgba(197,180,123,0.1)"}}>公牌尚未全部翻出，以下分析基於目前已知牌面，最終牌型可能改變。</div>)}

      {/* A1 */}
      <div style={lbl}>你的最佳牌型</div>
      <div style={{...txt,fontSize:15,color:"#d0e0c8",fontWeight:600}}>{handName}</div>

      {/* A4 */}
      {risks.length>0&&(<><div style={lbl}>牌面風險提示</div><div style={{marginBottom:14}}>{risks.map((r,i)=><span key={i} style={badge}>⚠ {r}</span>)}</div></>)}

      {/* A2 */}
      {analysis.whyNot&&(<><div style={lbl}>為什麼不是 100%</div><div style={txt}>{analysis.whyNot}</div></>)}

      {/* A3 */}
      {analysis.loseTo.length>0&&(<><div style={lbl}>可能輸給</div><div style={txt}>{analysis.loseTo.join("、")}</div></>)}

      {/* B */}
      {beats.length>0&&(
        <details style={{marginTop:4,marginBottom:14}}>
          <summary style={{fontSize:12,color:"#a08c5a",cursor:"pointer",fontWeight:700,fontFamily:sn,padding:"8px 0",borderTop:"1px solid rgba(255,255,255,0.04)",userSelect:"none"}}>
            ▸ 對手如何擊敗你？
          </summary>
          <div style={{padding:"8px 0 4px 4px"}}>
            {beats.map((b,i)=>(<div key={i} style={{fontSize:12.5,color:"#90a888",lineHeight:1.8,paddingLeft:10,borderLeft:"2px solid rgba(197,180,123,0.15)",marginBottom:6}}>{b}</div>))}
          </div>
        </details>
      )}

      {/* D */}
      <div style={{borderTop:"1px solid rgba(255,255,255,0.04)",paddingTop:10,marginTop:4,fontSize:11,color:"#506050",lineHeight:1.8}}>
        <p>※ 分析為輔助理解牌型與風險，非投資/下注建議。</p>
        <p>※ 建議重算多次（或提高精度）觀察結果是否穩定。</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   HELP
   ═══════════════════════════════════════════════════════════════════════ */
function Help(){
  const h={fontFamily:ft,color:"#c5b47b",fontSize:15,margin:"18px 0 6px"};
  const p={color:"#90a888",fontSize:13,lineHeight:1.85,margin:"4px 0 4px 12px"};
  const sep={height:1,background:"rgba(255,255,255,0.04)",margin:"16px 0"};
  return(
    <div style={{maxWidth:560,margin:"0 auto",padding:"8px 0 40px"}}>
      <div style={h}>操作步驟</div>
      <div style={p}>1. 選擇 Hero 手牌（必選 2 張），每張分別選 Rank 與 Suit</div>
      <div style={p}>2. 選擇公牌 Board（0~5 張），依序填寫不可跳過</div>
      <div style={p}>3. 選擇計算精度，點擊「計算」</div>
      <div style={p}>4. 點「重新計算」可再算一次（不清空輸入）</div>
      <div style={sep}/>
      <div style={h}>結果解讀</div>
      <div style={p}>Win / Tie / Lose 為對上一位隨機對手的勝率估計。括號內 ± 為 95% 信賴區間。若 5 張公牌全部填入，系統自動使用精確計算（窮舉），沒有誤差。</div>
      <div style={sep}/>
      <div style={h}>手牌分析</div>
      <div style={p}>計算完成後，結果下方會顯示手牌分析區塊，包含你的最佳牌型、牌面風險、為什麼不是 100%、以及對手可能如何擊敗你的說明。</div>
      <div style={sep}/>
      <div style={h}>計算精度</div>
      <div style={p}><b style={{color:"#c8d4c0"}}>快速</b> — 幾秒出結果，適合快速預覽</div>
      <div style={p}><b style={{color:"#c8d4c0"}}>標準</b> — 日常使用，精度與速度兼顧</div>
      <div style={p}><b style={{color:"#c8d4c0"}}>高精度</b> — 更精確但耗時較長</div>
      <div style={sep}/>
      <div style={h}>Seed</div>
      <div style={p}>一般留空即可。填入整數可重現相同結果。</div>
      <div style={sep}/>
      <div style={{background:"rgba(197,180,123,0.06)",borderRadius:8,padding:14,border:"1px solid rgba(197,180,123,0.12)",marginTop:12}}>
        <div style={{color:"#c5b47b",fontWeight:800,fontSize:11,letterSpacing:1.5,marginBottom:6,fontFamily:sn}}>重要提醒</div>
        <div style={{color:"#90a888",fontSize:12.5,lineHeight:1.8}}>結果為模擬估計值，非精確預測。建議多算幾次觀察穩定性，或使用高精度檔位。</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════════════════ */
export default function App(){
  const [tab,setTab]=useState("calc");
  const [hero,setHero]=useState([{rank:null,suit:null},{rank:null,suit:null}]);
  const [board,setBoard]=useState(Array(5).fill(null).map(()=>({rank:null,suit:null})));
  const [prec,setPrec]=useState("standard");
  const [seed,setSeed]=useState("");
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState(0);
  const [error,setError]=useState(null);
  const cancelRef=useRef(null);

  const updH=(i,r,s)=>{const n=[...hero];n[i]={rank:r||null,suit:s||null};setHero(n);};
  const updB=(i,r,s)=>{const n=[...board];n[i]={rank:r||null,suit:s||null};setBoard(n);};

  const validate=useCallback(()=>{
    for(const c of hero){if(!c.rank||!c.suit)return"Hero 手牌必須完整選擇 2 張";}
    let gap=false;const bc=[];
    for(let i=0;i<5;i++){const c=board[i];if(!c.rank&&!c.suit)gap=true;else if((c.rank&&!c.suit)||(!c.rank&&c.suit))return"公牌請同時選擇 Rank 和 Suit";else{if(gap)return"公牌不可跳過";bc.push(c);}}
    const all=[...hero,...bc].filter(c=>c.rank&&c.suit);const keys=all.map(c=>c.rank+c.suit);
    if(new Set(keys).size!==keys.length)return"有重複的牌";
    return null;
  },[hero,board]);

  const run=useCallback(()=>{
    const err=validate();if(err){setError(err);return;}
    setError(null);cancelRef.current?.cancel();
    const hp=hero.map(c=>packCard(c.rank,c.suit));
    const bc=board.filter(c=>c.rank&&c.suit);
    const bp=bc.map(c=>packCard(c.rank,c.suit));
    const it=PREC[prec].iters;
    const s=seed.trim()?parseInt(seed.trim()):null;
    setBusy(true);setResult(null);setProgress(0);
    cancelRef.current=calcEquityAsync(hp,bp,it,s,
      (done,total)=>setProgress(Math.round(done/(total||1)*100)),
      (res)=>{setResult(res);setBusy(false);setProgress(100);}
    );
  },[hero,board,prec,seed,validate]);

  const clear=()=>{cancelRef.current?.cancel();setHero([{rank:null,suit:null},{rank:null,suit:null}]);setBoard(Array(5).fill(null).map(()=>({rank:null,suit:null})));setSeed("");setResult(null);setError(null);setBusy(false);};

  /* Compute analysis when result ready */
  const boardCards=board.filter(c=>c.rank&&c.suit);
  const totalCards=2+boardCards.length;
  let heroScore=null,boardAna=null;
  if(result&&totalCards>=5){
    const allP=[...hero,...boardCards].map(c=>packCard(c.rank,c.suit));
    heroScore=bestHand(allP);
    boardAna=analyzeBoard(boardCards.map(c=>packCard(c.rank,c.suit)));
  }

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(170deg,#0b1a0b 0%,#122412 40%,#0e1e0e 100%)",color:"#c8d4c0",fontFamily:sn,backgroundImage:"radial-gradient(ellipse at 50% -10%,rgba(197,180,123,0.04),transparent 60%)"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:wght@400;700&family=Nunito+Sans:wght@400;600;700;800&family=Source+Code+Pro:wght@400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0;}::selection{background:rgba(197,180,123,0.25);}@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <header style={{textAlign:"center",padding:"24px 16px 14px",borderBottom:"1px solid rgba(197,180,123,0.1)"}}>
        <img src="/header.png" alt="Texas Hold'em Monte Carlo Simulation" style={{maxWidth:340,width:"80%",height:"auto",display:"block",margin:"0 auto"}} />
      </header>

      <nav style={{display:"flex",justifyContent:"center",gap:0,marginTop:8}}>
        {[["calc","計算器"],["help","使用說明"]].map(([k,l])=>(<button key={k} onClick={()=>setTab(k)} style={{padding:"9px 28px",background:tab===k?"rgba(197,180,123,0.08)":"transparent",color:tab===k?"#c5b47b":"#607060",border:"none",borderBottom:tab===k?"2px solid #c5b47b":"2px solid transparent",fontFamily:sn,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.2s",letterSpacing:0.5}}>{l}</button>))}
      </nav>

      <main style={{maxWidth:680,margin:"0 auto",padding:"10px 16px 50px"}}>
        {tab==="calc"?(
          <div style={{animation:"fadeIn 0.35s ease"}}>

            <Section title="HERO HAND"><div style={{display:"flex",gap:16,justifyContent:"center"}}>{hero.map((c,i)=><CardSlot key={i} rank={c.rank} suit={c.suit} label={`Card ${i+1}`} onSelect={(r,s)=>updH(i,r,s)}/>)}</div></Section>

            <Section title="COMMUNITY BOARD"><div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>{board.map((c,i)=><CardSlot key={i} rank={c.rank} suit={c.suit} label={["Flop 1","Flop 2","Flop 3","Turn","River"][i]} onSelect={(r,s)=>updB(i,r,s)}/>)}</div></Section>

            <Section title="SETTINGS">
              <div style={{display:"flex",gap:20,flexWrap:"wrap",justifyContent:"center",alignItems:"flex-end"}}>
                <div>
                  <div style={{fontSize:10,color:"#78866f",letterSpacing:1.5,marginBottom:5,fontWeight:700}}>精度</div>
                  <div style={{display:"flex",gap:5}}>{Object.entries(PREC).map(([k,v])=>(<button key={k} onClick={()=>setPrec(k)} style={{padding:"5px 13px",borderRadius:5,background:prec===k?"rgba(197,180,123,0.12)":"rgba(255,255,255,0.03)",color:prec===k?"#c5b47b":"#78866f",border:prec===k?"1px solid rgba(197,180,123,0.35)":"1px solid rgba(255,255,255,0.06)",fontFamily:sn,fontSize:12,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}>{v.label}</button>))}</div>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#78866f",letterSpacing:1.5,marginBottom:5,fontWeight:700}}>SEED</div>
                  <input value={seed} onChange={e=>setSeed(e.target.value)} placeholder="留空=隨機" style={{background:"#162016",color:"#b0c4a8",border:"1px solid rgba(255,255,255,0.08)",borderRadius:5,padding:"5px 9px",fontSize:12,fontFamily:mn,width:100,outline:"none"}}/>
                </div>
              </div>
            </Section>

            <div style={{display:"flex",gap:8,justifyContent:"center",margin:"18px 0"}}>
              <button onClick={run} disabled={busy} style={{padding:"10px 32px",borderRadius:7,background:busy?"rgba(255,255,255,0.04)":"linear-gradient(135deg,#c5b47b,#a89460)",color:busy?"#506050":"#0b1a0b",border:"none",fontFamily:sn,fontSize:14,fontWeight:800,cursor:busy?"wait":"pointer",transition:"all 0.2s",boxShadow:busy?"none":"0 3px 15px rgba(197,180,123,0.2)",letterSpacing:0.5}}>{busy?"計算中...":"計算"}</button>
              {result&&!busy&&<button onClick={run} style={{padding:"10px 20px",borderRadius:7,background:"rgba(255,255,255,0.04)",color:"#90a888",border:"1px solid rgba(255,255,255,0.08)",fontSize:12,fontWeight:700,fontFamily:sn,cursor:"pointer"}}>重新計算</button>}
              <button onClick={clear} style={{padding:"10px 20px",borderRadius:7,background:"rgba(255,255,255,0.02)",color:"#607060",border:"1px solid rgba(255,255,255,0.06)",fontSize:12,fontWeight:600,fontFamily:sn,cursor:"pointer"}}>清空</button>
            </div>

            <div style={{textAlign:"center",marginBottom:12}}>
              <a href="https://yakitori197.github.io/YoLab/" target="_blank" rel="noopener noreferrer" style={{fontFamily:ft,fontSize:14,fontWeight:700,color:"#c5b47b",textDecoration:"none",letterSpacing:1,padding:"4px 12px",borderRadius:5,border:"1px solid rgba(197,180,123,0.2)",background:"rgba(197,180,123,0.06)",transition:"all 0.2s"}}>YoLab</a>
            </div>

            {busy&&(<div style={{textAlign:"center",padding:20}}><div style={{width:"60%",height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,margin:"0 auto 10px",overflow:"hidden"}}><div style={{width:`${progress}%`,height:"100%",background:"linear-gradient(90deg,#c5b47b,#a89460)",transition:"width 0.3s",borderRadius:2}}/></div><span style={{fontSize:12,color:"#78866f"}}>{progress}%</span></div>)}

            {error&&<div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:8,padding:"9px 16px",textAlign:"center",color:"#ef4444",fontSize:12.5,marginBottom:12,animation:"fadeIn 0.3s"}}>{error}</div>}

            {result&&!busy&&(
              <>
                <div style={{background:"rgba(255,255,255,0.025)",borderRadius:10,border:"1px solid rgba(197,180,123,0.1)",padding:22,animation:"fadeIn 0.4s",boxShadow:"0 6px 30px rgba(0,0,0,0.15)"}}>
                  <div style={{fontSize:10,color:"#78866f",letterSpacing:2,marginBottom:14,textAlign:"center",fontWeight:700}}>{PREC[prec].label} &nbsp;|&nbsp; {result.samples.toLocaleString()} samples &nbsp;|&nbsp; {result.elapsed.toFixed(2)}s</div>
                  <Bar win={result.win} tie={result.tie} lose={result.lose}/>
                  <div style={{display:"flex",justifyContent:"center",gap:28,marginTop:18,flexWrap:"wrap"}}>
                    <Stat label="WIN" value={result.win} samples={result.samples} color="#22c55e" method={result.method}/>
                    <Stat label="TIE" value={result.tie} samples={result.samples} color="#94a3b8" method={result.method}/>
                    <Stat label="LOSE" value={result.lose} samples={result.samples} color="#ef4444" method={result.method}/>
                  </div>
                  <div style={{marginTop:16,padding:"10px 14px",borderRadius:7,background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.04)",fontSize:11,color:"#607060",lineHeight:1.8}}>
                    {result.method==="exhaustive"?<p>※ 本結果為精確計算（已窮舉所有對手組合）</p>:<p>※ 本結果為 Monte Carlo 模擬估計值，非精確機率</p>}
                  </div>
                </div>

                {heroScore&&boardAna&&(
                  <div style={{animation:"fadeIn 0.5s ease 0.1s both"}}>
                    <HandAnalysisPanel heroScore={heroScore} boardAnalysis={boardAna} winPct={result.win} boardLen={boardCards.length}/>
                  </div>
                )}
              </>
            )}
          </div>
        ):(
          <div style={{animation:"fadeIn 0.35s ease"}}><Help/></div>
        )}
      </main>
    </div>
  );
}
