/* ======================================================================
   APP: giao diện, tải dữ liệu, quét, vị thế, vẽ biểu đồ
   Phần vẽ của từng chỉ báo không còn ở đây: xem hàm draw / pane trong js/indicators/*.js.
   App vẫn đọc trực tiếp một số trường ind.* (ind.hist, ind.sk, ind.sd ...) cho cảnh báo vị thế và bộ quét hỗ trợ.
   ====================================================================== */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const TFS={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000};
const LAYERS=[['fc','Dự báo'],['sig','Tín hiệu quá khứ']].concat(Indicators.layers());   // các lớp chỉ báo lấy từ js/indicators/
const COL={buy:'#0E8A6D',sell:'#C93A52',zone:'#C98A0B',wave:'#4B46B8',ink:'#17222D',mut:'#5B6B7A',line:'#DDE4EA',blue:'#2F7DBE',orange:'#D9822B',purple:'#9B3FA0',ema200:'#8A5A9E'};
const S={tab:'chart',tf:'4h',sym:'BTCUSDT',L:Object.assign({fc:1,sig:1},Indicators.layerDefaults()),mode:'spot',ft:Indicators.toggleDefaults(),rrT:2,minRR:1.5,scanAt:0,oppKeys:{},srTf:'1h',srFilter:'all',srRows:[],srBusy:false,srTok:0,srAt:0,srMk:'',srCache:{},caches:{coin:new Map(),stock:new Map(),fx:new Map(),bstock:new Map()},tops:{coin:null,stock:null,fx:null,bstock:null},mkt:'coin',saved:{},scanTok:0,cur:null,selSig:null,selBar:null,
  scan:[],filter:'all',onlyPos:false,scanning:false,scannedTf:null,hits:[],live:{},lastV:{},mtfLive:null,mtfClosed:null};
Object.defineProperty(S,'cache',{get(){return S.caches[S.mkt];}});
Object.defineProperty(S,'top',{get(){return S.tops[S.mkt];},set(v){S.tops[S.mkt]=v;}});
S.calc={cap:1000,risk:1,lev:5};S.calcOv=null;S.lv=null;S.fwd=null;
const V={barW:9,end:0};

/* ---------- dữ liệu ---------- */
const HOSTS=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com','https://api-gcp.binance.com'];
const MKT={
  coin:{label:'Coin',src:'Binance',hosts:HOSTS,rest:'/api/v3',ws:q=>WSHOSTS.map(h=>h+'/stream?streams='+q),def:'BTCUSDT',minBars:400,minRaw:250,warm:250,demo:true,fee:0.002},
  stock:{label:'Cổ phiếu',src:'Binance Futures',hosts:['https://fapi.binance.com'],rest:'/fapi/v1',ws:q=>['wss://fstream.binance.com/stream?streams='+q,'wss://fstream.binance.com/market/stream?streams='+q],def:'TSLAUSDT',minBars:150,minRaw:60,warm:100,demo:false,fee:0.001},
  fx:{label:'Forex',src:'Bybit',hosts:['https://api.bybit.com','https://api.bytick.com'],rest:'/v5',bybit:true,wsUrls:['wss://stream.bybit.com/v5/public/linear'],def:'EURUSDUSDT',minBars:80,minRaw:100,warm:60,demo:false,fee:0.0006,mtf:['4h','1h','15m'],tfs:['15m','1h','4h'],btPages:{'4h':1,'1h':1,'15m':4}},
  bstock:{label:'Bybit TradFi',src:'Bybit',hosts:['https://api.bybit.com','https://api.bytick.com'],rest:'/v5',bybit:true,wsUrls:['wss://stream.bybit.com/v5/public/linear'],def:'TSLAUSDT',minBars:150,minRaw:100,warm:100,demo:false,fee:0.0012}
};
const NAMES={CL:'Dầu thô',XAU:'Vàng',XAG:'Bạc',XPT:'Bạch kim',XPD:'Palladium',EURUSD:'EUR/USD',GBPUSD:'GBP/USD',USDJPY:'USD/JPY'};
const BYBIT_TRADFI=new Set(['TSLA','AAPL','NVDA','META','GOOGL','MSFT','AMZN','NFLX','AMD','INTC','COIN','MSTR','HOOD','CRCL','PLTR','MU','SNDK','TSM','SPY','QQQ','ORCL','AVGO','BABA','JPM','WMT','XAU','XAG','CL','XPT','XPD','BRENT','WTI']);
const FXRE=/^(USD|EUR|GBP|JPY|AUD|NZD|CAD|CHF)(USD|EUR|GBP|JPY|AUD|NZD|CAD|CHF)USDT$/;
const IVB={'15m':'15','1h':'60','4h':'240','1d':'D'},IVB_REV={'15':'15m','60':'1h','240':'4h','D':'1d'};
function klPath(mk,sym,tf,limit,end){
  if(MKT[mk].bybit) return `/v5/market/kline?category=linear&symbol=${sym}&interval=${IVB[tf]}&limit=${limit}${end?'&end='+end:''}`;
  return `${MKT[mk].rest}/klines?symbol=${sym}&interval=${tf}&limit=${limit}${end?'&endTime='+end:''}`;
}
function klParse(mk,raw,tf){
  if(MKT[mk].bybit){
    if(!raw||raw.retCode!==0){const e=new Error((raw&&raw.retMsg)||'lỗi Bybit');if(raw&&(raw.retCode===10001||/symbol/i.test(raw.retMsg||''))) e.bad=true;throw e;}
    const st=TFS[tf];
    return raw.result.list.map(k=>({t:+k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5],ct:+k[0]+st-1})).sort((a,b)=>a.t-b.t);
  }
  if(!Array.isArray(raw)) throw new Error('dữ liệu không hợp lệ');
  return raw.map(k=>({t:k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5],ct:k[6]}));
}
const NET={coin:{pref:0,down:0,err:''},stock:{pref:0,down:0,err:''},fx:{pref:0,down:0,err:''},bstock:{pref:0,down:0,err:''}};
const netReset=mk=>{const N=NET[mk||S.mkt];N.down=0;N.err='';};
async function getJSON(path,mk){
  mk=mk||S.mkt;const N=NET[mk],H=MKT[mk].hosts;
  if(Date.now()<N.down){const e=new Error(N.err||'network');throw e;}
  let last;
  for(let k=0;k<H.length;k++){
    const idx=(N.pref+k)%H.length,h=H[idx];
    const ac=new AbortController(); const to=setTimeout(()=>ac.abort(),7000);
    try{
      const r=await fetch(h+path,{signal:ac.signal,cache:'no-store'});
      clearTimeout(to);
      if(r.status===400){const e=new Error('bad');e.bad=true;throw e;}
      if(!r.ok) throw new Error('HTTP '+r.status+' từ '+h.replace('https://',''));
      N.pref=idx;
      return await r.json();
    }catch(e){clearTimeout(to);if(e.bad)throw e;last=e;}
  }
  N.err=(last&&(last.name==='AbortError'?'quá thời gian chờ':last.message))||'không có mạng';
  N.down=Date.now()+20000;
  throw last||new Error('network');
}
async function load(sym,tf,mk){
  mk=mk||S.mkt;const cache=S.caches[mk],key=sym+'|'+tf,c=cache.get(key);
  if(c&&(Date.now()-c.t<60000||(c.ws&&RT.ok&&RT.sym===sym&&RT.mk===mk))) return c;
  let C,demo=false;
  try{
    const raw=await getJSON(klPath(mk,sym,tf,1000),mk);
    C=klParse(mk,raw,tf);
    if(C.length<MKT[mk].minRaw) throw new Error('ít dữ liệu');
    if(C[C.length-1].ct>Date.now()) C.pop(); // bỏ nến đang chạy để tín hiệu không bị đổi
  }catch(e){
    if(e.bad||!MKT[mk].demo) throw e;
    demo=true; C=genDemo(sym,TFS[tf],1000);
  }
  const ent={sym,tf,mk,C,A:analyze(C),t:Date.now(),demo,err:demo?NET[mk].err:'',ws:!demo&&RT.ok&&RT.sym===sym&&RT.mk===mk};
  cache.set(key,ent);
  return ent;
}
const FALLBACK=['BTC','ETH','BNB','SOL','XRP','DOGE','ADA','AVAX','LINK','TON','DOT','TRX','LTC','BCH','NEAR','APT','ARB','OP','SUI','INJ','ATOM','FIL','ETC','UNI','AAVE'];
const KNOWN_EQ=['TSLA','AAPL','NVDA','META','GOOGL','MSFT','AMZN','NFLX','AMD','INTC','COIN','MSTR','HOOD','CRCL','PLTR','MU','SNDK','TSM','SPY','QQQ','ORCL','AVGO','BABA','JPM','WMT'];
async function loadTop(n,mk){
  mk=mk||S.mkt;
  if(S.tops[mk]&&S.tops[mk].length>=n) return S.tops[mk].slice(0,n);
  try{
    let list;
    if(mk==='coin'){
      const all=await getJSON('/api/v3/ticker/24hr',mk);
      const stable=/^(USDC|FDUSD|TUSD|USDP|DAI|BUSD|EUR|AEUR|USD1|USDE|XUSD|PAXG|WBTC|WBETH)$/;
      list=all.filter(t=>t.symbol.endsWith('USDT')).map(t=>({sym:t.symbol,base:t.symbol.slice(0,-4),vol:+t.quoteVolume,chg:+t.priceChangePercent}))
        .filter(t=>!stable.test(t.base)&&!/(UP|DOWN|BULL|BEAR)$/.test(t.base)&&t.vol>0).sort((a,b)=>b.vol-a.vol).slice(0,40);
    }else if(mk==='bstock'){
      const [inst,tk]=await Promise.all([getJSON('/v5/market/instruments-info?category=linear&limit=1000',mk),getJSON('/v5/market/tickers?category=linear',mk)]);
      if(!inst||inst.retCode!==0||!tk||tk.retCode!==0) throw new Error('lỗi Bybit');
      const keep=new Set();
      for(const x of inst.result.list||[]){
        if(x.status!=='Trading'||x.quoteCoin!=='USDT') continue;
        const tag=JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k])=>/type|categor|tag|label/i.test(k))));
        if(BYBIT_TRADFI.has(x.baseCoin)||/tradfi|equit|stock|commodit|etf|pre-?ipo/i.test(tag)) keep.add(x.symbol);
      }
      list=tk.result.list.filter(t=>keep.has(t.symbol)&&!FXRE.test(t.symbol)).map(t=>({sym:t.symbol,base:t.symbol.slice(0,-4),vol:+t.turnover24h,chg:+t.price24hPcnt*100}))
        .sort((a,b)=>b.vol-a.vol).slice(0,60);
      if(!list.length) throw new Error('không tìm thấy hợp đồng TradFi');
    }else if(mk==='fx'){
      const j=await getJSON('/v5/market/tickers?category=linear',mk);
      if(!j||j.retCode!==0) throw new Error((j&&j.retMsg)||'lỗi Bybit');
      const re=/^(USD|EUR|GBP|JPY|AUD|NZD|CAD|CHF)(USD|EUR|GBP|JPY|AUD|NZD|CAD|CHF)USDT$/;
      list=j.result.list.filter(t=>re.test(t.symbol)).map(t=>({sym:t.symbol,base:t.symbol.slice(0,-4),vol:+t.turnover24h,chg:+t.price24hPcnt*100}))
        .sort((a,b)=>b.vol-a.vol);
      if(!list.length) throw new Error('không tìm thấy hợp đồng forex');
    }else{
      const [info,all]=await Promise.all([getJSON('/fapi/v1/exchangeInfo',mk),getJSON('/fapi/v1/ticker/24hr',mk)]);
      const eq=new Set();
      for(const x of info.symbols||[]){
        if(x.contractType!=='PERPETUAL'||x.status!=='TRADING'||x.quoteAsset!=='USDT') continue;
        const tag=JSON.stringify([x.underlyingType,x.underlyingSubType]);
        if(/TRADFI|EQUITY|STOCK|ETF/i.test(tag)||KNOWN_EQ.includes(x.baseAsset)) eq.add(x.symbol);
      }
      list=all.filter(t=>eq.has(t.symbol)).map(t=>({sym:t.symbol,base:t.symbol.slice(0,-4),vol:+t.quoteVolume,chg:+t.priceChangePercent}))
        .filter(t=>t.vol>=0).sort((a,b)=>b.vol-a.vol).slice(0,40);
      if(!list.length) throw new Error('không tìm thấy hợp đồng cổ phiếu');
    }
    S.tops[mk]=list;
  }catch(e){
    S.tops[mk]=(mk==='coin'?FALLBACK:mk==='fx'?['EURUSD','GBPUSD','USDJPY']:mk==='bstock'?['TSLA','XAU','XAG','CL','GOOGL','AMZN','SNDK']:KNOWN_EQ.slice(0,12)).map(b=>({sym:b+'USDT',base:b,chg:null}));
  }
  if(S.mkt===mk) $('symList').innerHTML=S.tops[mk].map(t=>`<option value="${t.sym}"${NAMES[t.base]?` label="${NAMES[t.base]}"`:''}>`).join('');
  return S.tops[mk].slice(0,n);
}
/* ---------- tiện ích hiển thị ---------- */
const pad=n=>String(n).padStart(2,'0');
function fdate(t,full){
  const d=new Date(t+7*3600000);
  const s=`${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}`;
  if(S.tf==='1d') return s+'/'+String(d.getUTCFullYear()).slice(2);
  return full?`${s} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`:`${s} ${pad(d.getUTCHours())}h`;
}
const FUT=()=>S.mode==='fut';
const mv=(R,no15)=>mtfVerdict(R,no15,FUT());
const rdy=v=>mtfReady(v,FUT());
const sideTxt=s=>FUT()?(s==='buy'?'Long':'Short'):(s==='buy'?'Mua':'Bán');
const lw=s=>FUT()?(s==='buy'?'long':'short'):(s==='buy'?'mua':'bán');
const R2=x=>(x>=0?'+':'')+x.toFixed(2)+'R';
function verdict(now){
  if(!now.ok) return {cls:'wait',txt:'Chưa đủ đồng thuận'};
  if(FUT()) return now.side==='buy'?{cls:'buy',txt:now.strong?'Nghiêng LONG mạnh':'Nghiêng LONG'}:{cls:'sell',txt:now.strong?'Nghiêng SHORT mạnh':'Nghiêng SHORT'};
  return now.side==='buy'?{cls:'buy',txt:now.strong?'Dự báo tăng mạnh':'Dự báo tăng'}:{cls:'sell',txt:now.strong?'Dự báo giảm mạnh':'Dự báo giảm'};
}
function btBadge(st,oos){
  if(st.n<20) return {cls:'few',txt:'Mẫu nhỏ, chưa đủ tin'};
  if(st.exp>0&&oos.n>=5&&oos.exp>0) return {cls:'ok',txt:'Kỳ vọng dương, vượt kiểm tra'};
  if(st.exp>0) return {cls:'few',txt:'Dương nhưng chưa vượt kiểm tra'};
  return {cls:'no',txt:'Kỳ vọng âm, không nên theo'};
}

/* ---------- vẽ biểu đồ ---------- */
function cl(x,a,b){return Math.max(a,Math.min(b,x));}
function clampEnd(plotW){
  const n=S.cur?S.cur.C.length:0; const vis=plotW/V.barW;
  V.end=cl(V.end,Math.min(n-1,vis*0.5),n-1+Math.floor(vis*0.4));
}
function draw(){
  const cv=$('cv'),wrap=$('wrap');
  const dpr=window.devicePixelRatio||1,W=wrap.clientWidth,H=wrap.clientHeight;
  if(!W||!H) return;
  if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);}
  const g=cv.getContext('2d');
  g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H);
  g.font='12px "Be Vietnam Pro",system-ui,sans-serif';
  S.hits=[];
  const E=S.cur;
  if(!E){g.fillStyle=COL.mut;g.fillText('Đang tải dữ liệu…',16,28);return;}
  const {C,A}=E,ind=A.ind,n=C.length,AX=66,TX=22,plotW=W-AX;
  clampEnd(plotW);
  const bw=V.barW,x=i=>plotW-(V.end-i+0.5)*bw;
  const i0=Math.max(0,Math.floor(V.end-plotW/bw)-1),i1=Math.min(n-1,Math.ceil(V.end));
  const subs=Indicators.panes().map(p=>p.id).filter(k=>S.L[k]);
  const subH=subs.length?Math.max(78,Math.floor(H*0.15)):0;
  const priceH=H-TX-subH*subs.length;

  // thang giá
  let hi=-Infinity,lo=Infinity;
  for(let i=i0;i<=i1;i++){if(C[i].h>hi)hi=C[i].h;if(C[i].l<lo)lo=C[i].l;}
  if(!isFinite(hi)){hi=1;lo=0;}
  const LV=liveOf(E);
  if(LV&&V.end>=n-0.5){hi=Math.max(hi,LV.h);lo=Math.min(lo,LV.l);}
  const padv=(hi-lo)*0.08||hi*0.01; hi+=padv; lo-=padv;
  const PT=26,PB=16;
  const py=p=>PT+(hi-p)/(hi-lo)*(priceH-PT-PB);

  // lưới giá
  g.lineWidth=1;g.textAlign='left';g.textBaseline='middle';
  for(let k=0;k<=5;k++){
    const p=lo+(hi-lo)*k/5,y=py(p);
    g.strokeStyle=COL.line;g.beginPath();g.moveTo(0,y);g.lineTo(plotW,y);g.stroke();
    g.fillStyle=COL.mut;g.fillText(fmt(p),plotW+6,y);
  }
  g.save();g.beginPath();g.rect(0,0,plotW,priceH);g.clip();

  // ngữ cảnh vẽ đưa cho từng chỉ báo
  const zr=(z,start,lab)=>{const xa=x(start),xb=z.end!=null?x(z.end):plotW;if(xb<0||xa>plotW) return;
    const ya=py(z.hi),yb=py(z.lo),w=Math.max(2,xb-xa),hh=Math.max(2,yb-ya),bu=z.side==='buy';
    g.fillStyle=bu?'rgba(14,138,109,.13)':'rgba(201,58,82,.13)';g.fillRect(xa,ya,w,hh);
    g.strokeStyle=bu?'rgba(14,138,109,.55)':'rgba(201,58,82,.55)';g.lineWidth=1;g.strokeRect(xa,ya,w,hh);
    g.fillStyle=COL.mut;g.font='11px sans-serif';g.fillText(lab,Math.max(xa+2,2),ya-2);g.font='12px "Be Vietnam Pro",system-ui,sans-serif';};
  const R={g,x,py,i0,i1,bw,plotW,priceH,W,H,hi,lo,n,C,E,A,ind,S,V,COL,cl,fmt,zr};
  // các lớp vẽ dưới nến: vùng giá, Bollinger, Kalman, FRVP, Ichimoku, Fibonacci (mỗi cái nằm trong file chỉ báo của nó)
  for(const p of Indicators.drawers('under')) p.draw(R);
  // nến
  for(let i=i0;i<=i1;i++){
    const k=C[i],xc=x(i),up=k.c>=k.o;
    g.strokeStyle=g.fillStyle=up?COL.buy:COL.sell;
    g.lineWidth=1;g.beginPath();g.moveTo(xc,py(k.h));g.lineTo(xc,py(k.l));g.stroke();
    const bwid=Math.max(1,bw*0.68),yo=py(k.o),yc=py(k.c);
    g.fillRect(xc-bwid/2,Math.min(yo,yc),bwid,Math.max(1,Math.abs(yo-yc)));
  }
  // các lớp vẽ trên nến: EMA, VWAP, OB, FVG, phân kỳ, Elliott (mỗi cái nằm trong file chỉ báo của nó)
  for(const p of Indicators.drawers('over')) p.draw(R);
  // điểm mua bán
  const sig=S.L.sig?A.signals.filter(s=>s.i>=i0&&s.i<=i1):[];
  g.textAlign='center';
  for(const s of sig){
    const k=C[s.i],xc=x(s.i),buy=s.side==='buy';
    const ty=buy?Math.min(py(k.l)+6,priceH-30):Math.max(py(k.h)-6,30);
    g.fillStyle=buy?COL.buy:COL.sell;g.beginPath();
    if(buy){g.moveTo(xc,ty);g.lineTo(xc-7,ty+12);g.lineTo(xc+7,ty+12);}
    else{g.moveTo(xc,ty);g.lineTo(xc-7,ty-12);g.lineTo(xc+7,ty-12);}
    g.closePath();g.fill();
    g.font='bold 11px "Be Vietnam Pro",system-ui,sans-serif';g.textBaseline='middle';
    g.fillText(String(s.strength),xc,buy?ty+22:ty-22);
    S.hits.push({x:xc,y:buy?ty+8:ty-8,s});
  }
  g.font='12px "Be Vietnam Pro",system-ui,sans-serif';
  // tín hiệu đang chọn: vào lệnh, cắt lỗ, chốt lời
  const sel=S.selSig;
  if(sel&&S.L.sig){
    const xs=x(sel.i),xe=x(sel.res.exit!=null?sel.res.exit:Math.min(n-1,sel.i+25));
    const lines=[[sel.tp,COL.buy,'Chốt lời'],[sel.entry,COL.ink,'Vào lệnh'],[sel.sl,COL.sell,'Cắt lỗ']];
    for(const [p,col,lb] of lines){
      const y=py(p);g.strokeStyle=col;g.lineWidth=1.5;g.setLineDash(lb==='Vào lệnh'?[]:[6,4]);
      g.beginPath();g.moveTo(xs,y);g.lineTo(Math.max(xe,xs+40),y);g.stroke();g.setLineDash([]);
      const txt=`${lb} ${fmt(p)}`,lx=Math.max(xe,xs+40)+5,tw=g.measureText(txt).width;
      g.fillStyle='rgba(253,254,254,.92)';g.fillRect(lx-3,y-9,tw+8,18);
      g.fillStyle=col;g.textAlign='left';g.textBaseline='middle';g.fillText(txt,lx+1,y);
    }
    const k=C[sel.i];
    g.strokeStyle=sel.side==='buy'?COL.buy:COL.sell;g.lineWidth=2;g.beginPath();
    g.arc(xs,sel.side==='buy'?Math.min(py(k.l)+14,priceH-24):Math.max(py(k.h)-14,24),17,0,7);g.stroke();
    if(sel.res.exit!=null){
      g.fillStyle=sel.res.status==='tp'?COL.buy:sel.res.status==='sl'?COL.sell:COL.mut;
      g.beginPath();g.arc(x(sel.res.exit),py(sel.res.status==='tp'?sel.tp:sel.res.status==='sl'?sel.sl:C[sel.res.exit].c),5,0,7);g.fill();
    }
  }
  // giá hiện tại (realtime): nến đang chạy vẽ mờ, nét đứt, và nhãn giá
  const lastC=C[n-1];
  const pxv=LV?LV.c:lastC.c,pUp=LV?LV.c>=LV.o:lastC.c>=lastC.o;
  if(LV){
    const xc=x(n),yo=py(LV.o),yc=py(LV.c),col=pUp?COL.buy:COL.sell,bwid=Math.max(3,bw*0.7),bh=Math.max(2,Math.abs(yc-yo));
    g.strokeStyle=col;g.lineWidth=1.3;g.beginPath();g.moveTo(xc,py(LV.h));g.lineTo(xc,py(LV.l));g.stroke();
    g.fillStyle=pUp?'rgba(14,138,109,.35)':'rgba(201,58,82,.35)';g.fillRect(xc-bwid/2,Math.min(yo,yc),bwid,bh);
    g.setLineDash([3,2]);g.strokeRect(xc-bwid/2,Math.min(yo,yc),bwid,bh);g.setLineDash([]);
  }
  g.strokeStyle=pUp?COL.buy:COL.sell;g.setLineDash([2,3]);g.lineWidth=1;
  g.beginPath();g.moveTo(0,py(pxv));g.lineTo(plotW,py(pxv));g.stroke();g.setLineDash([]);
  if(LV){const tx=fmt(pxv),tw=g.measureText(tx).width+12;
    g.fillStyle=pUp?COL.buy:COL.sell;g.fillRect(plotW-tw-2,py(pxv)-10,tw,20);
    g.fillStyle='#fff';g.textAlign='left';g.textBaseline='middle';g.fillText(tx,plotW-tw+4,py(pxv));}
  // dự báo cho các nến sắp tới (chưa xảy ra)
  if(S.L.fc&&A.fc){
    const fc=A.fc,x0=x(n-1),y0=py(lastC.c),xe=plotW-6;
    g.font='bold 12px "Be Vietnam Pro",system-ui,sans-serif';g.textBaseline='middle';
    if(fc.dir==='wait'){
      g.fillStyle=COL.mut;g.textAlign='left';g.fillText('Dự báo: chưa rõ hướng',Math.max(8,Math.min(x0+10,plotW-150)),PT+10);
    }else if(xe>x0+40){
      const buy=fc.dir==='buy',col=buy?COL.buy:COL.sell,yT=py(fc.tp1),yS=py(fc.sl),y2=py(fc.tp2);
      g.fillStyle=buy?'rgba(14,138,109,.11)':'rgba(201,58,82,.11)';
      g.beginPath();g.moveTo(x0,y0);g.lineTo(xe,yT);g.lineTo(xe,y2);g.closePath();g.fill();
      g.fillStyle='rgba(201,58,82,.07)';g.beginPath();g.moveTo(x0,y0);g.lineTo(xe,yS);g.lineTo(xe,y0);g.closePath();g.fill();
      g.font='11.5px "Be Vietnam Pro",system-ui,sans-serif';g.textAlign='right';g.textBaseline='bottom';g.lineWidth=1.2;
      for(const [p,cc,lb] of [[fc.tp2,col,'Mục tiêu 2'],[fc.tp1,col,'Mục tiêu 1'],[fc.sl,COL.sell,'Cắt lỗ nếu sai']]){
        const y=py(p);g.strokeStyle=cc;g.setLineDash([5,4]);g.beginPath();g.moveTo(x0,y);g.lineTo(plotW,y);g.stroke();g.setLineDash([]);
        const t=`${lb} ${fmt(p)}`,tw=g.measureText(t).width;
        g.fillStyle='rgba(253,254,254,.9)';g.fillRect(plotW-tw-8,y-16,tw+8,15);g.fillStyle=cc;g.fillText(t,plotW-4,y-3);
      }
      const ax=xe-4,ang=Math.atan2(yT-y0,ax-x0);
      g.strokeStyle=col;g.fillStyle=col;g.lineWidth=2.6;g.beginPath();g.moveTo(x0,y0);g.lineTo(ax,yT);g.stroke();
      g.beginPath();g.moveTo(ax,yT);g.lineTo(ax-11*Math.cos(ang-0.45),yT-11*Math.sin(ang-0.45));g.lineTo(ax-11*Math.cos(ang+0.45),yT-11*Math.sin(ang+0.45));g.closePath();g.fill();
      g.font='bold 12px "Be Vietnam Pro",system-ui,sans-serif';g.textAlign='left';g.textBaseline='middle';
      const tag=buy?'Dự báo tăng':'Dự báo giảm',tw=g.measureText(tag).width,ty=buy?y0+14:y0-32;
      g.fillStyle=col;g.fillRect(x0+8,ty,tw+12,19);g.fillStyle='#fff';g.fillText(tag,x0+14,ty+10);
    }
    g.font='12px "Be Vietnam Pro",system-ui,sans-serif';
  }
  g.restore();
  g.fillStyle=lastC.c>=lastC.o?COL.buy:COL.sell;g.fillRect(plotW,py(lastC.c)-9,AX,18);
  g.fillStyle='#fff';g.textAlign='left';g.textBaseline='middle';g.fillText(fmt(lastC.c),plotW+5,py(lastC.c));

  // thanh chọn nến
  const sb=S.selBar!=null?S.selBar:n-1;
  // các khung chỉ báo
  const row=(k,top)=>{
    g.strokeStyle=COL.line;g.lineWidth=1;g.beginPath();g.moveTo(0,top);g.lineTo(W,top);g.stroke();
    g.save();g.beginPath();g.rect(0,top,plotW,subH);g.clip();
    const pad=8,yy=(v,a,b)=>top+pad+(b-v)/(b-a)*(subH-pad*2);
    const line=(arr,col,a,b)=>{g.strokeStyle=col;g.lineWidth=1.6;g.beginPath();let st=false;
      for(let i=i0;i<=i1;i++){const v=arr[i];if(!isFinite(v)){st=false;continue;}const Y=yy(cl(v,a,b),a,b);if(!st){g.moveTo(x(i),Y);st=true;}else g.lineTo(x(i),Y);}g.stroke();};
    let title='',vals='';
    const f1=v=>isFinite(v)?v.toFixed(1):'–';
    const sf=v=>!isFinite(v)?'–':Math.abs(v)>=100?v.toFixed(1):String(Number(v.toPrecision(3)));
    const osc=(a,b)=>{
      g.fillStyle='rgba(14,138,109,.07)';g.fillRect(0,yy(20,a,b),plotW,yy(0,a,b)-yy(20,a,b));
      g.fillStyle='rgba(201,58,82,.07)';g.fillRect(0,yy(100,a,b),plotW,yy(80,a,b)-yy(100,a,b));
      g.strokeStyle='#B8C3CD';g.setLineDash([4,4]);g.beginPath();
      for(const lv of (k==='kdj'?[20,80]:[20,80])){g.moveTo(0,yy(lv,a,b));g.lineTo(plotW,yy(lv,a,b));}g.stroke();g.setLineDash([]);
    };
    const P={top,subH,pad,yy,line,f1,sf,sb,osc};
    ({title,vals}=Indicators.get(k).pane(R,P));   // phần vẽ riêng nằm trong js/indicators/*.js
    // vạch gióng các điểm mua bán để thấy sự đồng thuận
    for(const s of sig){g.strokeStyle=s.side==='buy'?'rgba(14,138,109,.35)':'rgba(201,58,82,.35)';g.lineWidth=1;g.beginPath();g.moveTo(x(s.i),top);g.lineTo(x(s.i),top+subH);g.stroke();}
    g.restore();
    g.textAlign='left';g.textBaseline='top';g.fillStyle=COL.ink;g.font='bold 12px "Be Vietnam Pro",system-ui,sans-serif';g.fillText(title,8,top+4);
    g.font='12px "Be Vietnam Pro",system-ui,sans-serif';g.fillStyle=COL.mut;g.font='bold 12px "Be Vietnam Pro",system-ui,sans-serif';const tw0=g.measureText(title).width;g.font='12px "Be Vietnam Pro",system-ui,sans-serif';g.fillText(vals,8+tw0+18,top+4);
  };
  subs.forEach((k,idx)=>row(k,priceH+idx*subH));

  // trục thời gian
  const ty0=H-TX;g.fillStyle=COL.mut;g.textAlign='center';g.textBaseline='middle';
  g.strokeStyle=COL.line;g.beginPath();g.moveTo(0,ty0);g.lineTo(W,ty0);g.stroke();
  const stepBars=Math.max(1,Math.ceil(100/bw));
  const first=Math.ceil(i0/stepBars)*stepBars;
  for(let i=first;i<=i1;i+=stepBars){const xx=x(i);if(xx<20||xx>plotW-20)continue;g.fillText(fdate(C[i].t),xx,ty0+11);}

  // thanh chọn + thông tin nến
  const kk=C[sb],xb=x(sb);
  if(S.selBar!=null&&xb>=0&&xb<=plotW){
    g.strokeStyle='rgba(23,34,45,.45)';g.setLineDash([3,3]);g.lineWidth=1;g.beginPath();g.moveTo(xb,0);g.lineTo(xb,H-TX);g.stroke();g.setLineDash([]);
  }
  g.textAlign='left';g.textBaseline='top';g.fillStyle=COL.ink;g.font='bold 13px "Be Vietnam Pro",system-ui,sans-serif';
  const head=`${E.sym.replace('USDT','')}/USDT ${S.tf}`;g.fillText(head,8,6);
  const hw=g.measureText(head).width;
  g.font='12px "Be Vietnam Pro",system-ui,sans-serif';g.fillStyle=COL.mut;
  g.fillText(`${fdate(kk.t,true)}   Mở ${fmt(kk.o)}   Cao ${fmt(kk.h)}   Thấp ${fmt(kk.l)}   Đóng ${fmt(kk.c)}`,16+hw,7);
}

/* ---------- cột bên phải ---------- */
/* ---------- Kết luận đa khung: 1d + 4h = xu hướng, 1h = xác nhận, 15m = điểm vào ---------- */
const MTF_ORDER=['1d','4h','1h','15m'];
const mtfOf=mk=>MKT[mk||S.mkt].mtf||MTF_ORDER;
const MTF_ROLE={'1d':'Xu hướng lớn','4h':'Xu hướng lớn','1h':'Xác nhận','15m':'Điểm vào'};
let mtfTok=0;
const dirTxt=d=>d==='buy'?'Tăng':d==='sell'?'Giảm':'Chưa rõ';
/* ---------- Máy tính vị thế và rủi ro ---------- */
const nf=(x,d=2)=>isFinite(x)?x.toLocaleString('vi-VN',{minimumFractionDigits:d,maximumFractionDigits:d}):'–';
const MK_NAME={coin:'Coin',stock:'Cổ phiếu',bstock:'Bybit TradFi',fx:'Forex'};
function calcDefaults(){
  const L=S.lv;if(!L||!isFinite(L.px)||!isFinite(L.atr)) return null;
  const risk=1.5*L.atr,X=S.anchor,A=X&&X.sym===S.sym&&X.ready&&X.a&&!X.a.touched?X.a:null;
  const useB=A&&(A.side||'buy')==='buy'&&L.px>A.sl&&L.px<A.tp, useS=A&&A.side==='sell'&&L.px<A.sl&&L.px>A.tp;
  return {buy:{entry:L.px,sl:useB?A.sl:L.px-risk,tp:useB?A.tp:L.px+S.rrT*risk},sell:{entry:L.px,sl:useS?A.sl:L.px+risk,tp:useS?A.tp:L.px-S.rrT*risk}};
}
function calcState(){
  const L=S.lv,d=calcDefaults();if(!L||!d) return null;
  const ov=(S.calcOv&&S.calcOv.sym===S.sym)?S.calcOv:{};
  const side=ov.side||L.side,df=d[side];
  return {side,entry:ov.entry!=null?ov.entry:df.entry,sl:ov.sl!=null?ov.sl:df.sl,tp:ov.tp!=null?ov.tp:df.tp};
}
function calcRecalc(){
  const out=$('calcOut'),st=calcState();if(!out||!st) return;
  const base=S.sym.replace(/USDT$/,'');
  const r=calcPos({side:st.side,cap:S.calc.cap,riskPct:S.calc.risk,entry:st.entry,sl:st.sl,tp:st.tp,lev:S.calc.lev,fee:MKT[S.mkt].fee});
  if(!r.ok){out.innerHTML=`<span class="warn">${r.err}</span>`;return;}
  const lines=[];
  lines.push(`Rủi ro tối đa: <b>${nf(r.riskAmt)}</b> USDT (${nf(S.calc.risk,2)}% vốn).`);
  lines.push(`Khối lượng: <b>${nf(r.qty,r.qty<1?5:3)}</b> ${base}, giá trị lệnh <b>${nf(r.notional)}</b> USDT.`);
  lines.push(`Ký quỹ cần ở đòn bẩy ${nf(r.lev,0)}x: <b>${nf(r.margin)}</b> USDT.`);
  lines.push(`Giá thanh lý ước tính: <b>${fmt(r.liq)}</b> (cách giá vào ${nf(r.liqDistPct*100)}%); cắt lỗ cách giá vào ${nf(r.distPct*100)}%.`);
  lines.push(r.slOk?`<span class="okk">Cắt lỗ nằm trước giá thanh lý với biên an toàn.</span>`:`<span class="bad">NGUY HIỂM: cắt lỗ quá gần hoặc vượt giá thanh lý. Giảm đòn bẩy, tối đa khoảng ${r.maxSafeLev}x cho mức cắt lỗ này.</span>`);
  lines.push(`Đòn bẩy tối đa nên dùng (cắt lỗ cách thanh lý ít nhất 20%): <b>${r.maxSafeLev}x</b>.`);
  lines.push(`Nếu chạm cắt lỗ: <span class="dn"><b>−${nf(r.lossAtSL)}</b></span> USDT (đã gồm phí ${nf(r.feeAmt)}).`);
  if(r.profitAtTP!=null) lines.push(`Nếu chạm chốt lời: <span class="up"><b>+${nf(r.profitAtTP)}</b></span> USDT, lãi/lỗ 1:${nf(r.rr,2)}.`);
  if(r.capped) lines.push(`<span class="warn">Khối lượng bị giới hạn bởi đòn bẩy bạn chọn, rủi ro thực chỉ còn ${nf(r.realRiskPct)}% vốn.</span>`);
  lines.push(`<span class="mut">Ước tính ký quỹ cô lập, tỉ lệ ký quỹ duy trì giả định 0,5%, chưa tính funding. Luôn đối chiếu bằng máy tính của sàn trước khi vào lệnh.</span>`);
  out.innerHTML=lines.join('<br>');
}
const agoTxt=ms=>{const m=Math.max(0,Math.round(ms/60000));if(m<60) return m+' phút';const h=Math.floor(m/60),r=m%60;return h+' giờ'+(r?' '+r+' phút':'');};
function curPx(){
  const sym=S.sym,e=S.cache.get(sym+'|15m');
  let px=NaN,best=0;
  for(const tf of Object.keys(TFS)){const l=S.live[sym+'|'+tf];if(l&&l.t>best){best=l.t;px=l.c;}}
  if(isFinite(px)) return px;
  if(e&&e.C.length) return e.C[e.C.length-1].c;
  return NaN;
}
function paintValid(){
  const el=$('mtfValid');if(!el) return;
  const X=S.anchor;if(!X||X.sym!==S.sym){el.innerHTML='';return;}
  if(!X.ready||!X.a){
    el.innerHTML=`<div class="valid"><b>Hiện chưa có tín hiệu ${FUT()?'LONG/SHORT':'MUA'} hợp lệ để vào lệnh.</b>Khi đủ điều kiện, mục này sẽ hiện giờ tín hiệu hình thành, điểm vào, và cho biết giá hiện tại còn vào được hay đã trễ.</div>`;return;
  }
  const a=X.a,P=curPx();
  if(!isFinite(P)){el.innerHTML='';return;}
  if(S.lv&&S.lv.sym===S.sym) S.lv.px=P;
  const q=sigStatus(a,P),age=Date.now()-(a.ct+1);
  const cls=q.st==='ok'?'ok':q.st==='late'?'late':'bad';
  const tm=new Date(a.ct+1).toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'});
  const sd=a.side==='sell'?-1:1,pc=sd*(P-a.E0)/a.E0*100,sgn=x=>(x>=0?'+':'')+x;
  const dead=q.st==='sl'||q.st==='tp';
  el.innerHTML=`<div class="valid ${cls}"><b>${FUT()?(sd>0?'LONG: ':'SHORT: '):''}${q.txt}</b>
    Tín hiệu hình thành lúc <b style="display:inline">${tm}</b> (cách đây ${agoTxt(age)}), tính trên nến 15m vừa đóng.<br>
    Giá lúc đó <b style="display:inline">${fmt(a.E0)}</b>, giá hiện tại <b style="display:inline">${fmt(P)}</b> (${sgn(q.m.toFixed(2))}R, ${sgn(pc.toFixed(2))}%).<br>
    ${dead?'':(sd>0?`Vùng vào hợp lệ: đến <b style="display:inline">${fmt(q.maxEntry)}</b> (R:R còn lại ≥ 1:${q.need}). Trên <b style="display:inline">${fmt(q.noChase)}</b> (R:R còn lại dưới 1:1) thì bỏ qua, đừng đuổi giá.<br>`:`Vùng vào hợp lệ: từ <b style="display:inline">${fmt(q.maxEntry)}</b> trở lên (R:R còn lại ≥ 1:${q.need}). Dưới <b style="display:inline">${fmt(q.noChase)}</b> (R:R còn lại dưới 1:1) thì bỏ qua, đừng đuổi giá.<br>`)}
    Cắt lỗ <b style="display:inline">${fmt(a.sl)}</b> (−${(a.risk/a.E0*100).toFixed(2)}%) · Chốt lời <b style="display:inline">${fmt(a.tp)}</b>${dead?'':` · lãi/lỗ còn lại 1:${q.rrLeft.toFixed(2)}`}
    ${age>6*36e5&&!dead?'<br>Tín hiệu này đã kéo dài hơn 6 giờ. Nếu chưa vào lệnh thì chỉ nên vào khi giá hồi về vùng hợp lệ.':''}${dead?'':'<br><button class="chip sm" data-pa="fromsig" style="margin-top:6px">Tôi đã vào lệnh này, theo dõi giúp</button>'}</div>`;
}
function renderCalc(){
  const host=$('calc');if(!host) return;
  const st=calcState();
  if(!st){host.innerHTML='';return;}
  const pv=x=>isFinite(x)?String(+x.toPrecision(7)):'';
  host.innerHTML=`<details class="card calc" open><summary>Máy tính vị thế và rủi ro</summary>
    <div class="g">
      <div><label>Vốn (USDT)</label><input type="number" step="any" inputmode="decimal" data-k="cap" value="${pv(S.calc.cap)}"></div>
      <div><label>Rủi ro mỗi lệnh (%)</label><input type="number" step="any" inputmode="decimal" data-k="risk" value="${pv(S.calc.risk)}"></div>
      <div><label>Đòn bẩy (x)</label><input type="number" step="any" inputmode="decimal" data-k="lev" value="${pv(S.calc.lev)}"></div>
      <div><label>Hướng lệnh</label><select data-k="side"><option value="buy"${st.side==='buy'?' selected':''}>Mua (long)</option><option value="sell"${st.side==='sell'?' selected':''}>Bán (short)</option></select></div>
      <div><label>Giá vào</label><input type="number" step="any" inputmode="decimal" data-k="entry" value="${pv(st.entry)}"></div>
      <div><label>Cắt lỗ</label><input type="number" step="any" inputmode="decimal" data-k="sl" value="${pv(st.sl)}"></div>
      <div><label>Chốt lời</label><input type="number" step="any" inputmode="decimal" data-k="tp" value="${pv(st.tp)}"></div>
    </div>
    <div class="out" id="calcOut"></div>
    <p class="note">Giá vào là giá hiện tại. Cắt lỗ và chốt lời lấy theo tín hiệu gốc khi đang có tín hiệu ${FUT()?'LONG/SHORT':'MUA'} còn hiệu lực, nếu không thì tính theo ATR khung 1h (cắt lỗ 1,5 ATR, chốt lời ${S.rrT} lần mức rủi ro). Giá đã chạy xa khỏi điểm vào thì khoảng cách cắt lỗ lớn hơn và khối lượng tự giảm. Bạn có thể sửa tay.</p>
  </details>`;
  host.querySelector('details').addEventListener('input',e=>{
    const k=e.target.dataset&&e.target.dataset.k;if(!k) return;
    const v=parseFloat(e.target.value);
    if(k==='cap'||k==='risk'||k==='lev'){S.calc[k]=isFinite(v)?v:0;try{localStorage.setItem('calc',JSON.stringify(S.calc));}catch(x){}}
    else if(k==='side'){S.calcOv={sym:S.sym,side:e.target.value};renderCalc();return;}
    else{S.calcOv=Object.assign({sym:S.sym,side:st.side},(S.calcOv&&S.calcOv.sym===S.sym)?S.calcOv:{},{[k]:isFinite(v)?v:null});}
    calcRecalc();
  });
  calcRecalc();
}

/* ---------- Kết quả thật: đọc data/signals.json do bot ghi ---------- */
async function loadFwd(){
  const body=$('fwdBody');if(body) body.innerHTML='<p class="note">Đang tải…</p>';
  S.fwdErr='';
  try{
    const r=await fetch('data/signals.json?ts='+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    S.fwd=await r.json();
  }catch(e){S.fwd=null;S.fwdErr=(e&&e.message)||'lỗi';}
  renderFwd();
}
function renderFwd(){
  const body=$('fwdBody');if(!body) return;
  const dt=ms=>new Date(ms).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  if(!S.fwd){
    body.innerHTML=`<div class="card"><h3>Chưa có dữ liệu tín hiệu thật</h3><p class="note">Trang này đọc file <b>data/signals.json</b> do bot ghi lại mỗi tín hiệu mua cùng kết quả sau đó (chạm cắt lỗ hay chốt lời). Bot chưa chạy hoặc chưa tạo file${S.fwdErr?' ('+S.fwdErr+')':''}. Làm theo hướng dẫn trong file README-bot.md để bật bot.</p></div>`;
    $('fwdUpd').textContent='';return;
  }
  const sg=S.fwd.signals||[],closed=sg.filter(x=>x.status!=='open'),open=sg.filter(x=>x.status==='open');
  const stat=a=>{const st=calcStats(a.map(x=>({R:x.R})));return {n:st.n,wr:st.n?(st.wr*100).toFixed(0)+'%':'–',exp:st.n?R2(st.exp):'–',pf:st.n?(isFinite(st.pf)?st.pf.toFixed(2):'∞'):'–',pos:st.n&&st.exp>0};};
  const all=stat(closed);
  $('fwdUpd').textContent=S.fwd.lastRun?'Bot chạy lần cuối: '+dt(S.fwd.lastRun):'';
  const rowM=(k)=>{const a=closed.filter(x=>x.mk===k),t=stat(a);return `<tr><td>${MK_NAME[k]}</td><td>${t.n}</td><td>${t.wr}</td><td class="${t.pos?'up':'dn'}">${t.exp}</td><td>${t.pf}</td></tr>`;};
  const statusTxt={open:'Đang mở',win:'Thắng',loss:'Thua',expired:'Hết hạn'};
  const rows=sg.slice().sort((a,b)=>b.t-a.t).slice(0,40).map(x=>`<tr><td>${dt(x.t)}</td><td>${(MK_NAME[x.mk]||x.mk)}</td><td>${x.sym.replace(/USDT$/,'')}</td><td class="${x.side==='sell'?'dn':'up'}">${x.side==='sell'?'Short':'Long/Mua'}</td><td>${fmt(x.entry)}</td><td>${statusTxt[x.status]||x.status}</td><td class="${x.R>0?'up':x.R<0?'dn':''}">${x.R==null?'–':R2(x.R)}</td></tr>`).join('');
  body.innerHTML=`<div class="card"><h3>Kết quả tín hiệu thật (forward test)</h3>
    <p style="font-size:14px;margin:4px 0">Tổng <b>${sg.length}</b> tín hiệu, <b>${open.length}</b> đang mở, <b>${closed.length}</b> đã đóng. Thắng <b>${all.wr}</b>, kỳ vọng mỗi lệnh <b class="${all.pos?'up':'dn'}">${all.exp}</b>, PF <b>${all.pf}</b>.</p>
    ${closed.length<30?'<p class="note"><b>Chưa đủ mẫu:</b> cần ít nhất khoảng 30 lệnh đã đóng thì con số mới đáng tin. Hiện chỉ '+closed.length+' lệnh, rất dễ lệch do may rủi.</p>':''}
    <div class="sc"><table><tr class="mut"><th>Thị trường</th><th>Lệnh</th><th>Thắng</th><th>Kỳ vọng</th><th>PF</th></tr>${['coin','stock','bstock','fx'].map(rowM).join('')}</table></div>
    <p class="note">Kỳ vọng tính theo R (1R là mức rủi ro mỗi lệnh), đã trừ phí giả định. Tín hiệu ghi ở giá lúc bot phát hiện, cắt lỗ 1,5 ATR(1h), chốt lời 2R, hết hạn sau 60 giờ. Nếu một nến chạm cả hai mức thì tính là thua.</p></div>
    <div class="card"><h3>40 tín hiệu gần nhất</h3><div class="sc"><table><tr class="mut"><th>Thời gian</th><th>Thị trường</th><th>Mã</th><th>Hướng</th><th>Giá vào</th><th>Trạng thái</th><th>R</th></tr>${rows||'<tr><td colspan="7">Chưa có tín hiệu nào.</td></tr>'}</table></div></div>`;
}


/* ---------- Lệnh của tôi: theo dõi lệnh đã vào, gợi ý giữ / kéo SL / chốt sớm ----------
 * Lưu trong localStorage của trình duyệt này (không gửi đi đâu). Mỗi 60 giây (và khi mở tab) app lấy giá hiện tại và 4 khung,
 * cộng điểm cảnh báo khi thị trường có dấu hiệu đổi hướng ngược lệnh, rồi gợi ý: giữ, kéo SL, chốt một phần, chốt hẳn hoặc cắt sớm. */
let POS=[];const POS_EV={};let posBusy=false;
const ACT_NAME={hold:'GIỮ LỆNH',trail:'GIỮ, KÉO SL',watch:'THEO DÕI SÁT',partial:'CHỐT MỘT PHẦN',exit:'CHỐT LỆNH',cut:'CẮT SỚM',hit:'ĐÃ CHẠM SL/TP'};
function posLoad(){try{const a=JSON.parse(localStorage.getItem('pos')||'[]');POS=Array.isArray(a)?a.filter(x=>x&&x.sym&&x.entry>0&&x.sl0>0):[];}catch(e){POS=[];}}
function posSave(){try{localStorage.setItem('pos',JSON.stringify(POS));}catch(e){}}
const fdt=t=>new Date(t).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
async function lastPx(mk,sym){
  try{
    if(MKT[mk].bybit){const j=await getJSON('/v5/market/tickers?category=linear&symbol='+sym,mk);const x=j&&j.retCode===0&&j.result&&j.result.list&&j.result.list[0];if(x&&+x.lastPrice>0) return +x.lastPrice;}
    else{const j=await getJSON(MKT[mk].rest+'/ticker/price?symbol='+sym,mk);if(j&&+j.price>0) return +j.price;}
  }catch(e){}
  return NaN;
}
/* Phần quyết định, không đụng tới mạng hay giao diện. es = tổng điểm cảnh báo (0 là chưa có dấu hiệu nào):
 * dưới 1,5 giữ; từ 1,5 đến dưới 3 chốt một phần (nếu đang lãi) hoặc theo dõi; từ 3 trở lên chốt hẳn (nếu đang lãi) hoặc cắt sớm. */
function posAdvise(q){
  const sg=q.sg,entry=q.entry,sl=q.sl,tp=q.tp,P=q.P,pk=q.pk,fee=q.fee,atr1=q.atr1,es=q.es,r0=Math.abs(entry-q.sl0);
  const m=sg*(P-entry)/r0,mfe=Math.max(m,sg*(pk-entry)/r0),tpDist=sg*(tp-P)/r0;
  let cand=null,candWhy='';
  if(mfe>=1){cand=entry*(1+sg*fee);candWhy='hòa vốn đã trừ phí';}
  if(mfe>=1.5&&atr1>0){const k=es>=1.5?1:1.5,tr=pk-sg*k*atr1;if(sg*(tr-cand)>0){cand=tr;candWhy='đỉnh '+(sg>0?'trừ ':'cộng ')+k+' ATR(1h)';}}
  if(cand!=null){const buf=0.15*(atr1>0?atr1:r0);if(!(sg*(cand-sl)>entry*1e-5&&sg*(P-cand)>buf)){cand=null;candWhy='';}}
  let act,cls;
  if(es>=3){act=m>=0.3?'exit':'cut';cls='bad';}
  else if(es>=1.5){act=m>=0.5?'partial':'watch';cls='late';}
  else{act=mfe>=1?'trail':'hold';cls='ok';}
  return {m,mfe,tpDist,cand,candWhy,lockR:cand!=null?sg*(cand-entry)/r0:null,act,cls,r0};
}
function posTexts(p,a,es){
  const sg=p.side==='sell'?-1:1,sc=es.toFixed(1);
  const cs=a.cand!=null?`dời SL lên <b style="display:inline">${fmt(a.cand)}</b> (${a.candWhy}, khóa ${R2(a.lockR)})`:'';
  let head,adv;
  if(a.act==='exit'){
    head='CHỐT LỆNH: thị trường đã đổi hướng';
    adv=`Điểm cảnh báo ${sc} (từ 3 trở lên là nặng). Lệnh đang lãi ${R2(a.m)} nhưng các dấu hiệu bên dưới cho thấy kịch bản ban đầu không còn nguyên. Nên chốt phần lớn hoặc toàn bộ, đừng chờ chạm chốt lời ${fmt(p.tp)}.${cs?' Nếu muốn giữ phần nhỏ còn lại thì '+cs+'.':''}`;
  }else if(a.act==='cut'){
    head='CÂN NHẮC CẮT SỚM, đừng chờ chạm cắt lỗ';
    adv=`Điểm cảnh báo ${sc} (từ 3 trở lên là nặng): kịch bản ban đầu đã yếu đi nhiều trong khi lệnh chưa có lãi (${R2(a.m)}). Cắt sớm thường lỗ nhỏ hơn mức −1R nếu chờ chạm SL ${fmt(p.sl)}. Nếu vẫn quyết giữ thì giữ nguyên SL, không dời SL ra xa hơn.`;
  }else if(a.act==='partial'){
    head='CHỐT MỘT PHẦN (khoảng 50%) VÀ KÉO SL';
    adv=`Đã có dấu hiệu yếu đi (điểm cảnh báo ${sc}) trong khi lệnh đang lãi ${R2(a.m)}. Chốt khoảng một nửa để khóa lãi, phần còn lại ${cs||'giữ SL hiện tại <b style="display:inline">'+fmt(p.sl)+'</b>'}. Nếu điểm cảnh báo lên từ 3 thì thoát nốt.`;
  }else if(a.act==='watch'){
    head='THEO DÕI SÁT, chưa nên chốt';
    adv=`Có dấu hiệu yếu đi (điểm cảnh báo ${sc}) nhưng lệnh chưa lãi đủ để chốt (${R2(a.m)}). Giữ SL ${fmt(p.sl)}, nếu điểm cảnh báo lên từ 3 thì thoát sớm.`;
  }else if(a.act==='trail'){
    head='GIỮ, KÉO SL ĐỂ KHÓA LÃI';
    adv=a.cand!=null
      ?`Lệnh đã từng chạy +${a.mfe.toFixed(2)}R và các khung vẫn ủng hộ (điểm cảnh báo ${sc}). Chưa cần chốt, nhưng ${cs} để nếu bị quét SL vẫn không lỗ.`
      :`Lệnh đã từng chạy +${a.mfe.toFixed(2)}R và các khung vẫn ủng hộ (điểm cảnh báo ${sc}). SL hiện tại ${fmt(p.sl)} đã tốt hơn mức gợi ý (hoặc giá quá sát nên không kéo thêm), giữ nguyên.`;
  }else{
    head='GIỮ LỆNH, kịch bản vẫn còn nguyên';
    adv=`${es>0?'Chỉ có dấu hiệu nhẹ (điểm cảnh báo '+sc+'), chưa đủ để hành động.':'Chưa thấy dấu hiệu thị trường đổi hướng (điểm cảnh báo 0).'} Giữ SL ${fmt(p.sl)} và chốt lời ${fmt(p.tp)}. Khi lệnh chạy được +1R, app sẽ gợi ý dời SL về hòa vốn.`;
  }
  if(a.tpDist<=0.25&&a.tpDist>0&&(a.act==='hold'||a.act==='trail')) adv+=` Giá chỉ còn cách chốt lời ${a.tpDist.toFixed(2)}R: có thể chốt luôn hoặc chốt một nửa.`;
  return {head,adv};
}
async function posEval(p){
  const sg=p.side==='sell'?-1:1,fee=MKT[p.mk].fee,ord=mtfOf(p.mk);
  const ents=await Promise.all(ord.map(tf=>load(p.sym,tf,p.mk)));
  if(ents.some(e=>e.demo)) return {err:'Đang dùng dữ liệu mô phỏng nên chưa đánh giá được lệnh này.'};
  const E={};ord.forEach((tf,i)=>{E[tf]=ents[i];});
  const e15=E['15m'];
  let P=await lastPx(p.mk,p.sym);if(!isFinite(P)) P=e15.C[e15.C.length-1].c;
  // đỉnh/đáy từ lúc vào lệnh và kiểm tra đã chạm SL/TP chưa (theo nến 15m đã đóng + giá hiện tại)
  let hi=p.entry,lo=p.entry,hit=null,hitT=null;
  for(const k of e15.C){
    if(k.t<p.t) continue;
    const slOn=k.t>=(p.slT||p.t);
    if(slOn&&(sg>0?k.l<=p.sl:k.h>=p.sl)){hit='sl';hitT=k.t;break;}
    if(sg>0?k.h>=p.tp:k.l<=p.tp){hit='tp';hitT=k.t;break;}
    if(k.h>hi) hi=k.h;if(k.l<lo) lo=k.l;
  }
  if(!hit){if(sg*(P-p.sl)<=0){hit='sl';hitT=Date.now();}else if(sg*(P-p.tp)>=0){hit='tp';hitT=Date.now();}}
  const pk=sg>0?Math.max(p.pk||p.entry,hi,P):Math.min(p.pk||p.entry,lo,P);
  p.pk=pk;
  const r0=Math.abs(p.entry-p.sl0),m0=sg*(P-p.entry)/r0,pct=sg*(P-p.entry)/p.entry*100,usd=p.size>0?p.size*pct/100:null;
  if(hit){
    const lvl=hit==='sl'?p.sl:p.tp,rr=sg*(lvl-p.entry)/r0-p.entry*fee/r0;
    return {hit,hitT,P,pk,m:m0,mfe:Math.max(m0,sg*(pk-p.entry)/r0),pct,usd,act:'hit',cls:hit==='tp'?'ok':'bad',lvl,
      head:hit==='tp'?'ĐÃ CHẠM CHỐT LỜI':'ĐÃ CHẠM CẮT LỖ'+(p.sl!==p.sl0?' (SL đã dời)':''),
      adv:`Giá đã chạm ${hit==='tp'?'chốt lời':'cắt lỗ'} ${fmt(lvl)} (khoảng ${fdt(hitT)}). Kết quả ước tính ${R2(rr)} sau phí. Bấm "Ghi kết quả" để lưu vào lịch sử, hoặc "Xoá" nếu bạn không còn lệnh này.`};
  }
  const Rm={};ord.forEach(tf=>{const fc=E[tf].A.fc;Rm[tf]={dir:fc.dir,pct:fc.pct,norm:fc.bias/fc.max};});
  const sup={};ord.forEach(tf=>{sup[tf]=dirSg(Rm[tf].dir)*sg;});
  const v=mtfVerdict(Rm,false,sg<0||FUT());
  const warn=[],W=(w,t)=>warn.push({w,t});
  const nm=sg>0?'tăng':'giảm',op=sg>0?'giảm':'tăng';
  const D1=sup['1d']!=null?sup['1d']:0,H4=sup['4h'],H1=sup['1h'],M15=sup['15m'];
  if(D1===-1&&H4===-1) W(3,`1 ngày và 4h đều đã nghiêng ${op}, ngược hướng lệnh`);
  else if(H4===-1) W(2,`Khung 4h đã nghiêng ${op}, ngược hướng lệnh`);
  else if(D1===-1) W(1,`Khung 1 ngày nghiêng ${op}, ngược hướng lệnh`);
  if(H1===-1) W(2,`Khung 1h đã quay ${op}`);
  else if(H1===0) W(1,`Khung 1h không còn nghiêng ${nm} (chưa rõ hướng)`);
  if(M15===-1) W(1,`15m đã quay ${op}`);
  for(const tf of ['1h','15m']){
    const A=E[tf].A,ind=A.ind,i=A.n-1,hv=tf==='1h';
    const h0=ind.hist[i],h1=ind.hist[i-1],h2=ind.hist[i-2];
    if(isN(h0)&&isN(h1)&&isN(h2)&&sg*h0<sg*h1&&sg*h1<sg*h2) W(hv?1:0.5,`MACD ${tf} yếu dần 2 nến liên tiếp theo hướng lệnh`);
    const K=ind.sk[i],D=ind.sd[i];
    if(isN(K)&&isN(D)&&(sg>0?(K>75&&K<D):(K<25&&K>D))) W(hv?1:0.7,`StochRSI ${tf} ${sg>0?'cắt xuống từ vùng quá mua':'cắt lên từ vùng quá bán'}`);
    for(let k=0;k<=8&&i-k>=0;k++){const d=A.ext.divAt[i-k];if(d){if(d.side!==(sg>0?'buy':'sell')) W(hv?1.5:1,`Phân kỳ ${d.side==='sell'?'giảm':'tăng'} RSI/MACD trên ${tf} (${k===0?'nến vừa đóng':k+' nến trước'})`);break;}}
    const ob=A.ext.obV[i];
    if(sg*ob<0) W(1,`Giá đang ở trong Order Block ${ob>0?'tăng (vùng cầu)':'giảm (vùng cung)'} trên ${tf}, dễ bị đẩy ngược`);
  }
  if(m0>=0.5){
    let zn=null;
    for(const z of (E['1h'].A.zonesNow||[])){
      if(sg>0?(z.hi>=P&&z.lo>p.entry&&z.lo<p.tp):(z.lo<=P&&z.hi<p.entry&&z.hi>p.tp)){
        const d=(sg>0?Math.max(0,z.lo-P):Math.max(0,P-z.hi))/r0;if(d<=0.4&&(!zn||d<zn.d)) zn={z,d};
      }
    }
    if(zn) W(1,`Giá ${zn.d===0?'đang ở trong':'sát'} vùng ${sg>0?'cản':'đỡ'} ${fmt(zn.z.lo)}–${fmt(zn.z.hi)} trên 1h`);
  }
  const mfe0=Math.max(m0,sg*(pk-p.entry)/r0);
  if(mfe0>=1&&mfe0-m0>=0.6) W(1.5,`Giá đã trả lại ${(mfe0-m0).toFixed(1)}R từ đỉnh (+${mfe0.toFixed(1)}R)`);
  if((Date.now()-p.t)/36e5>60) W(1,'Lệnh đã mở hơn 60 giờ, quá thời hạn của tín hiệu gốc');
  const es=warn.reduce((a,x)=>a+x.w,0),A1=E['1h'].A,atr1=A1.ind.atr[A1.n-1];
  const a=posAdvise({sg,entry:p.entry,sl0:p.sl0,sl:p.sl,tp:p.tp,P,pk,fee,atr1,es});
  const tx=posTexts(p,a,es);
  const rows=ord.map(tf=>({tf,dir:Rm[tf].dir,s:sup[tf]}));
  return Object.assign({P,pk,pct,usd,es,warn,rows,v,head:tx.head,adv:tx.adv},a);
}
async function posRefresh(){
  if(posBusy) return;posBusy=true;
  try{
    for(const p of POS.filter(x=>x.st==='open')){
      let ev;
      try{ev=await posEval(p);}catch(e){ev={err:'Không tải được dữ liệu ('+((e&&e.message)||'lỗi')+')'};}
      POS_EV[p.id]=ev;
      if(ev.act){
        const prev=p.lastAct;p.lastAct=ev.act;
        if(prev&&prev!==ev.act){
          const msg=p.sym.replace(/USDT$/,'')+' '+(p.side==='sell'?'Short':'Long')+': gợi ý đổi sang '+ACT_NAME[ev.act];
          toast(msg,ev.act==='hold'||ev.act==='trail'||ev.act==='watch'?'':'sell');
          try{if('Notification' in window&&Notification.permission==='granted') new Notification('Lệnh của tôi',{body:msg});}catch(e){}
        }
      }
      if(S.tab==='pos') renderPos();
    }
    posSave();
  }finally{posBusy=false;}
  const u=$('posUpd');if(u){const d=new Date();u.textContent='Kiểm tra lúc '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());}
  if(S.tab==='pos') renderPos();
}
function posDraftNow(){
  const d={mk:S.mkt,sym:S.sym,side:'buy',entry:'',sl:'',tp:'',size:'',at:''};
  const X=S.anchor,P=curPx();
  if(X&&X.sym===S.sym&&X.ready&&X.a&&!X.a.touched){d.side=X.a.side||'buy';d.entry=isFinite(P)?P:X.a.E0;d.sl=X.a.sl;d.tp=X.a.tp;}
  else{const st=calcState();if(st){d.side=st.side;d.entry=st.entry;d.sl=st.sl;d.tp=st.tp;}}
  for(const k of ['entry','sl','tp']) if(typeof d[k]==='number'&&isFinite(d[k])) d[k]=+d[k].toPrecision(7);
  return d;
}
function renderPosForm(){
  const host=$('posForm');if(!host) return;
  const d=S.posDraft||(S.posDraft={mk:S.mkt,sym:S.sym,side:'buy',entry:'',sl:'',tp:'',size:'',at:''});
  const op=(v,t,c)=>`<option value="${v}"${c===v?' selected':''}>${t}</option>`;
  host.innerHTML=`<div class="card"><h3>Ghi lệnh bạn đã vào để app theo dõi</h3>
    <div class="posf">
      <div><label>Thị trường</label><select data-pk="mk">${['coin','stock','bstock','fx'].map(k=>op(k,MK_NAME[k],d.mk)).join('')}</select></div>
      <div><label>Mã</label><input data-pk="sym" value="${d.sym||''}" autocapitalize="characters" spellcheck="false" autocomplete="off"></div>
      <div><label>Hướng lệnh</label><select data-pk="side">${op('buy','Mua (long)',d.side)}${op('sell','Bán (short)',d.side)}</select></div>
      <div><label>Giá vào thực tế</label><input data-pk="entry" type="number" step="any" inputmode="decimal" value="${d.entry}"></div>
      <div><label>Cắt lỗ đang đặt</label><input data-pk="sl" type="number" step="any" inputmode="decimal" value="${d.sl}"></div>
      <div><label>Chốt lời (bỏ trống = ${S.rrT}R)</label><input data-pk="tp" type="number" step="any" inputmode="decimal" value="${d.tp}"></div>
      <div><label>Giá trị lệnh USDT (không bắt buộc)</label><input data-pk="size" type="number" step="any" inputmode="decimal" value="${d.size}"></div>
      <div><label>Vào lúc (bỏ trống = bây giờ)</label><input data-pk="at" type="datetime-local" value="${d.at||''}"></div>
    </div>
    <div class="posb"><button class="go" data-pa="save">Lưu và theo dõi</button><button class="chip" data-pa="fill">Điền từ tín hiệu đang xem</button></div>
    <p class="note" id="posMsg"></p>
    <p class="note">Dữ liệu lưu ngay trên trình duyệt này, không gửi đi đâu, đổi máy hoặc xóa dữ liệu trình duyệt là mất. Nếu bạn vào lệnh từ trước, hãy nhập đúng giờ vào để app tính đúng đỉnh giá đã đạt.</p></div>`;
}
function posInput(e){
  const k=e.target&&e.target.dataset&&e.target.dataset.pk;if(!k||!S.posDraft) return;
  S.posDraft[k]=e.target.value;
}
async function posAdd(){
  const d=S.posDraft,msg=$('posMsg'),say=t=>{if(msg) msg.innerHTML=t;};if(!d) return;
  const bad=t=>say('<span class="dn"><b>'+t+'</b></span>');
  const sg=d.side==='sell'?-1:1,entry=+d.entry,sl=+d.sl;let tp=+d.tp;
  let s=String(d.sym||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!s) return bad('Nhập mã.');
  if(d.mk==='coin'){if(!/.{2,}(USDT|USDC|BTC|ETH|FDUSD)$/.test(s)) s+='USDT';}else if(!/(USDT|USDC)$/.test(s)) s+='USDT';
  if(!(entry>0&&sl>0)) return bad('Nhập giá vào và cắt lỗ.');
  if(sg*(entry-sl)<=0) return bad(sg>0?'Lệnh mua: cắt lỗ phải thấp hơn giá vào.':'Lệnh bán: cắt lỗ phải cao hơn giá vào.');
  if(!(tp>0)) tp=entry+sg*S.rrT*Math.abs(entry-sl);
  if(sg*(tp-entry)<=0) return bad(sg>0?'Lệnh mua: chốt lời phải cao hơn giá vào.':'Lệnh bán: chốt lời phải thấp hơn giá vào.');
  let t=Date.now();
  if(d.at){const x=new Date(d.at).getTime();if(isFinite(x)){if(x>Date.now()+6e4) return bad('Giờ vào lệnh đang ở tương lai.');t=x;}}
  say('Đang kiểm tra mã…');
  try{await load(s,'1h',d.mk);}catch(e){if(e&&e.bad) return bad('Không tìm thấy mã '+s+' trên '+MK_NAME[d.mk]+'.');}
  POS.unshift({id:'p'+Date.now().toString(36),mk:d.mk,sym:s,side:sg>0?'buy':'sell',entry,sl0:sl,sl,tp,size:+d.size>0?+d.size:0,t,slT:t,pk:entry,st:'open',lastAct:null});
  posSave();S.posDraft=null;renderPosForm();renderPos();posRefresh();
}
function posClose(p,px){
  const sg=p.side==='sell'?-1:1,r0=Math.abs(p.entry-p.sl0),fee=MKT[p.mk].fee,ev=POS_EV[p.id]||{};
  p.st='closed';p.cpx=px;p.ct=Date.now();p.R=sg*(px-p.entry)/r0-p.entry*fee/r0;p.mfe=ev.mfe!=null?ev.mfe:null;p.lastEs=ev.es!=null?ev.es:null;
  posSave();renderPos();
}
function posClick(e){
  const b=e.target.closest('button[data-pa]');if(!b) return;
  const a=b.dataset.pa,p=b.dataset.id?POS.find(x=>x.id===b.dataset.id):null;
  if(a==='fromsig'){S.posDraft=posDraftNow();setTab('pos');}
  else if(a==='fill'){S.posDraft=posDraftNow();renderPosForm();}
  else if(a==='save') posAdd();
  else if(a==='refresh') posRefresh();
  else if(!p) return;
  else if(a==='sl'){
    const ev=POS_EV[p.id];if(!ev||ev.cand==null) return;
    p.sl=ev.cand;p.slT=Date.now();p.lastAct=null;posSave();
    toast('Đã ghi SL mới '+fmt(p.sl)+'. Nhớ dời lệnh cắt lỗ trên sàn cho khớp.','buy');
    posRefresh();
  }else if(a==='close'){
    const ev=POS_EV[p.id]||{},def=ev.hit?ev.lvl:ev.P;
    const v=window.prompt('Giá bạn đã đóng lệnh '+p.sym.replace(/USDT$/,'')+' (giá thực tế khớp trên sàn):',isFinite(def)?String(+(+def).toPrecision(7)):'');
    if(v===null) return;
    const px=parseFloat(String(v).replace(',','.'));
    if(!(px>0)){toast('Giá không hợp lệ.');return;}
    posClose(p,px);
  }else if(a==='del'){
    if(window.confirm('Xoá lệnh này khỏi danh sách theo dõi?')){POS=POS.filter(x=>x.id!==p.id);delete POS_EV[p.id];posSave();renderPos();}
  }else if(a==='chart'){
    if(p.mk!==S.mkt){applyMarket(p.mk);loadTop(25);}
    S.sym=p.sym;setTab('chart');showChart();
  }
}
function posCard(p){
  const ev=POS_EV[p.id],sg=p.side==='sell'?-1:1,base=p.sym.replace(/USDT$/,'');
  const sgn=x=>(x>=0?'+':'')+x;
  let h=`<div class="card posc"><h3>${base} <span class="pill ${sg>0?'buy':'sell'}">${sg>0?'Long/Mua':'Short/Bán'}</span><span class="mut" style="font-size:13px;font-weight:500">${MK_NAME[p.mk]} · vào ${fdt(p.t)}</span></h3>`;
  if(!ev) return h+'<p class="note">Đang tính…</p></div>';
  if(ev.err) return h+`<p class="note">${ev.err}</p><div class="posb"><button class="chip sm" data-pa="del" data-id="${p.id}">Xoá</button></div></div>`;
  h+=`<div class="valid ${ev.cls}"><b>${ev.head}</b>${ev.adv}</div>`;
  h+=`<div class="kv">
    <span class="mut">Giá hiện tại</span><b>${fmt(ev.P)}</b>
    <span class="mut">Giá vào</span><b>${fmt(p.entry)}</b>
    <span class="mut">Lãi/lỗ tạm tính</span><b class="${ev.m>=0?'up':'dn'}">${R2(ev.m)} · ${sgn(ev.pct.toFixed(2))}%${ev.usd!=null?' · '+sgn(nf(ev.usd))+' USDT':''}</b>
    <span class="mut">Đỉnh lãi đã đạt</span><b>${R2(ev.mfe)}</b>
    <span class="mut">Cắt lỗ hiện tại</span><b>${fmt(p.sl)}${p.sl!==p.sl0?' (đã dời)':''}</b>
    <span class="mut">Chốt lời</span><b>${fmt(p.tp)}</b>
    ${ev.cand!=null?`<span class="mut">SL gợi ý</span><b>${fmt(ev.cand)} (khóa ${R2(ev.lockR)})</b>`:''}
  </div>`;
  if(!ev.hit){
    h+=`<table>${ev.rows.map(r=>`<tr><td>${r.tf}</td><td><span class="pill ${r.dir==='buy'?'buy':r.dir==='sell'?'sell':'wait'}">${dirTxt(r.dir)}</span></td><td class="r">${r.s===1?'<span class="ok">✓ cùng hướng lệnh</span>':r.s===-1?'<span class="no">✗ ngược hướng lệnh</span>':'<span class="mut">– chưa rõ</span>'}</td></tr>`).join('')}</table>`;
    h+=ev.warn.length
      ?`<p style="font-size:14px;margin:8px 0 0"><b>Dấu hiệu cảnh báo (tổng ${ev.es.toFixed(1)}):</b></p><ul>${ev.warn.map(w=>`<li>${w.t}</li>`).join('')}</ul>`
      :`<p class="note">Chưa có dấu hiệu cảnh báo nào: các khung chưa đổi hướng, động lượng và vùng giá chưa báo ngược lệnh.</p>`;
    h+=`<p class="note">Kết luận đa khung hiện tại (tham khảo): <b>${ev.v.txt}</b></p>`;
  }
  h+=`<div class="posb">
    ${ev.cand!=null&&!ev.hit?`<button class="go" data-pa="sl" data-id="${p.id}">Ghi SL mới ${fmt(ev.cand)}</button>`:''}
    <button class="${ev.hit||ev.act==='exit'||ev.act==='cut'?'go':'chip'}" data-pa="close" data-id="${p.id}">${ev.hit?'Ghi kết quả':'Đã đóng lệnh'}</button>
    <button class="chip" data-pa="chart" data-id="${p.id}">Xem biểu đồ</button>
    <button class="chip" data-pa="del" data-id="${p.id}">Xoá</button></div></div>`;
  return h;
}
function renderPos(){
  const host=$('posList');if(!host) return;
  const open=POS.filter(p=>p.st==='open'),closed=POS.filter(p=>p.st==='closed').sort((a,b)=>b.ct-a.ct);
  let h='';
  h+=open.length?`<div class="posl">${open.map(posCard).join('')}</div>`:'<div class="card" style="margin-top:12px"><p class="note" style="margin:0">Chưa có lệnh nào đang theo dõi. Nhập lệnh bạn đã vào ở trên, hoặc bấm "Tôi đã vào lệnh này" trong mục kết luận đa khung ở tab Biểu đồ.</p></div>';
  if(closed.length){
    const n=closed.length,w=closed.filter(x=>x.R>0).length,avg=closed.reduce((a,x)=>a+x.R,0)/n;
    h+=`<div class="card" style="margin-top:12px"><h3>Lịch sử lệnh đã đóng</h3>
      <p style="font-size:14px;margin:4px 0">Tổng <b>${n}</b> lệnh, thắng <b>${(w/n*100).toFixed(0)}%</b>, trung bình <b class="${avg>=0?'up':'dn'}">${R2(avg)}</b> mỗi lệnh.</p>
      <div class="sc"><table class="hist"><tr class="mut"><th>Đóng lúc</th><th>Mã</th><th>Hướng</th><th>Vào</th><th>Đóng</th><th>Đỉnh</th><th>Kết quả</th></tr>${closed.slice(0,30).map(x=>`<tr><td>${fdt(x.ct)}</td><td>${x.sym.replace(/USDT$/,'')}</td><td class="${x.side==='sell'?'dn':'up'}">${x.side==='sell'?'Short':'Long'}</td><td>${fmt(x.entry)}</td><td>${fmt(x.cpx)}</td><td>${x.mfe==null?'–':R2(x.mfe)}</td><td class="${x.R>0?'up':'dn'}">${R2(x.R)}</td></tr>`).join('')}</table></div>
      <p class="note">Cột Đỉnh là mức lãi cao nhất lệnh từng đạt: nếu Đỉnh thường cao hơn Kết quả nhiều, bạn đang chốt quá muộn hoặc kéo SL quá chậm.</p></div>`;
  }
  h+=`<details class="card" style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">Cách app gợi ý giữ, kéo SL hay chốt sớm</summary>
    <p class="note">Mỗi lần kiểm tra, app cộng điểm cảnh báo khi thị trường có dấu hiệu đổi hướng ngược lệnh: 1 ngày và 4h quay ngược (nặng nhất), 1h quay ngược hoặc mất hướng, 15m quay ngược, MACD yếu dần, StochRSI quay đầu ở vùng quá mua/quá bán, phân kỳ RSI/MACD, giá chạm Order Block ngược hướng hoặc sát vùng cản/đỡ 1h, giá đã trả lại hơn 0,6R từ đỉnh, lệnh mở quá 60 giờ.</p>
    <p class="note"><b>Dưới 1,5 điểm:</b> giữ. Khi lệnh chạy được +1R thì gợi ý dời SL về hòa vốn (đã trừ phí), từ +1,5R thì kéo SL theo đỉnh trừ 1,5 ATR(1h) (siết còn 1 ATR nếu đã có cảnh báo).<br><b>1,5 đến dưới 3 điểm:</b> đang lãi từ +0,5R thì chốt khoảng một nửa và kéo SL, chưa lãi thì theo dõi sát.<br><b>Từ 3 điểm:</b> đang lãi thì chốt phần lớn hoặc hết, chưa lãi thì cân nhắc cắt sớm thay vì chờ chạm SL.</p>
    <p class="note">Đánh giá dùng nến đã đóng của 4 khung cùng giá hiện tại trên sàn, nên một nến đang chạy chưa làm đổi kết luận. Chạm SL/TP được dò theo nến 15m đã đóng nên có thể trễ tối đa 15 phút. Các ngưỡng điểm là quy tắc kinh nghiệm, chưa được backtest; đây là công cụ hỗ trợ, không phải lời khuyên đầu tư, quyết định cuối cùng và mức SL thực tế đặt trên sàn là của bạn.</p></details>`;
  host.innerHTML=h;
}

/* ---------- So sánh bật/tắt Kalman: cùng dữ liệu, cùng quy tắc vào lệnh đủ 4 khung, chỉ đổi việc Kalman có tính điểm hay không ---------- */
const CMP_VARS=[['off','Tắt Kalman',{kal:0}],['on','Bật Kalman',{kal:1}]];
async function btCmp(sym,mk,fut,prog){
  const D={},ord=mtfOf(mk),BP=MKT[mk].btPages||BT_PAGES;
  await Promise.all(ord.map(async tf=>{D[tf]=await loadDeep(sym,tf,BP[tf],mk);}));
  for(const tf of ord) if(D[tf].length<MKT[mk].minBars) throw new Error('ít dữ liệu '+tf);
  const C=D['1h'],n=C.length,h=C.map(x=>x.h),l=C.map(x=>x.l),c=C.map(x=>x.c);
  const startCt=D['15m'][0].ct+300*TFS['15m'];
  let w0=-1;for(let i=250;i<n;i++){ if(C[i].ct>=startCt){w0=i;break;} }
  if(w0<0||n-w0<200) throw new Error('cửa sổ ngắn');
  const lateFrom=w0+Math.floor(0.7*(n-w0)),out={days:Math.round((C[n-1].ct-C[w0].t)/86400000)};
  for(const [key,,ft] of CMP_VARS){
    if(prog) prog(key);
    const A={};for(const tf of ord){A[tf]=analyze(D[tf],{ft});await tick();}
    const atr=A['1h'].ind.atr,ptr={'1d':0,'4h':0,'15m':0},res=[];let last=-99,prev='';
    for(let i=w0;i<n-1;i++){
      const ct=C[i].ct,R={'1h':A['1h'].fcAt(i)};let ok=true;
      for(const tf of ord.filter(t=>t!=='1h')){
        const arr=D[tf];while(ptr[tf]+1<arr.length&&arr[ptr[tf]+1].ct<=ct) ptr[tf]++;
        if(arr[ptr[tf]].ct>ct||ptr[tf]<MKT[mk].warm){ok=false;break;}
        R[tf]=A[tf].fcAt(ptr[tf]);
      }
      if(!ok) continue;
      const v=mtfVerdict(R,false,fut),rd=mtfReady(v,fut)?v.side:'';
      if(rd&&rd!==prev&&i-last>=6&&isN(atr[i])){
        const sg=rd==='sell'?-1:1,risk=1.5*atr[i],rrT=+globalThis.__rrT||2,sig={i,side:rd,entry:c[i],risk,sl:c[i]-sg*risk,tp:c[i]+sg*rrT*risk,rr:rrT};
        const rs=simulate(sig,h,l,c,n,60);
        if(rs.status!=='open') res.push({R:rs.R,late:i>=lateFrom,side:rd});
        last=i;
      }
      prev=rd;
    }
    out[key]=res;
  }
  return out;
}
async function runCmp(){
  if(S.cmpBusy||S.mtfBusy) return;
  S.cmpBusy=true;const mk=S.mkt,fut=FUT();netReset(mk);let lastErr='';
  const b0=$('cmpBtBtn');if(b0){b0.classList.add('busy');b0.textContent='Đang so sánh bật/tắt Kalman…';}
  try{
    const coins=(await loadTop(6,mk)).map(t=>t.sym),agg={v:{off:[],on:[]},coins:[],days:0,fut,mk};
    for(let k=0;k<coins.length;k++){
      const say=key=>{const hh=$('cmpBt');if(hh) hh.innerHTML=`<p class="note">Đang chạy ${k+1}/${coins.length}: ${coins[k].replace('USDT','')}, bản "${(CMP_VARS.find(x=>x[0]===key)||[])[1]||''}". Mỗi coin mất khoảng nửa phút đến vài phút, vui lòng giữ trang mở.</p>`;};
      try{
        const r=await btCmp(coins[k],mk,fut,say);
        for(const [key] of CMP_VARS) agg.v[key].push(...r[key]);
        agg.coins.push(coins[k].replace('USDT',''));agg.days=Math.max(agg.days,r.days);
      }catch(e){ if(!agg.coins.length) lastErr=e&&e.message||''; }
    }
    S.cmpBt=agg.coins.length?agg:{err:'Không chạy được so sánh'+(lastErr?' ('+lastErr+')':'')+'. Thử lại bằng Chrome hoặc Safari, hoặc kiểm tra mạng.',mk,fut};
  }catch(e){ S.cmpBt={err:'Không chạy được so sánh: '+(e&&e.message||'lỗi'),mk,fut}; }
  S.cmpBusy=false;
  const b1=$('cmpBtBtn');if(b1){b1.classList.remove('busy');b1.textContent='Chạy lại so sánh bật/tắt Kalman';}
  renderCmp();
}
function renderCmp(){
  const r=S.cmpBt,host=$('cmpBt');if(!host||!r) return;
  if(r.mk!==S.mkt||r.fut!==FUT()){host.innerHTML='';return;}
  if(r.err){host.innerHTML=`<p class="note">${r.err}</p>`;return;}
  const row=(name,t)=>{const st=calcStats(t),ol=calcStats(t.filter(x=>x.late));
    return `<tr><td style="width:auto">${name}</td><td class="r">${st.n}</td><td class="r">${st.n?(st.wr*100).toFixed(0)+'%':'–'}</td><td class="r ${st.n&&st.exp>0?'up':'dn'}">${st.n?R2(st.exp):'–'}</td><td class="r">${st.n?(isFinite(st.pf)?st.pf.toFixed(2):'∞'):'–'}</td><td class="r">${ol.n?R2(ol.exp):'–'}</td></tr>`;};
  const off=calcStats(r.v.off),on=calcStats(r.v.on);
  let msg;
  if(off.n<20||on.n<20) msg='Số lệnh còn ít (dưới 20 ở một bản) nên chưa so sánh được. Mẫu nhỏ rất dễ cho kết quả đẹp hoặc xấu do may rủi.';
  else{
    const d=on.exp-off.exp;
    msg=d>0.1?`Bật Kalman cho kỳ vọng ${R2(on.exp)} mỗi lệnh, hơn tắt (${R2(off.exp)}) khoảng ${d.toFixed(2)}R, với ${on.n} so với ${off.n} lệnh. Xem thêm cột 30% mới nhất có còn dương không trước khi tin.`
      :d<-0.1?`Bật Kalman làm kỳ vọng giảm còn ${R2(on.exp)} so với ${R2(off.exp)} khi tắt (kém ${(-d).toFixed(2)}R mỗi lệnh). Trong điều kiện này nên tắt Kalman khỏi phần tính điểm.`
      :`Chưa có khác biệt rõ rệt: bật Kalman ${R2(on.exp)}, tắt ${R2(off.exp)}, chênh dưới 0,1R mỗi lệnh.`;
    if(Math.max(off.n,on.n)<60) msg+=' Dưới 60 lệnh nên chênh lệch nhỏ vẫn có thể chỉ do may rủi.';
  }
  host.innerHTML=`<p style="margin:10px 0 4px"><b>So sánh bật/tắt Kalman</b> <span class="mut">${r.coins.join(', ')}, khoảng ${r.days} ngày, quy tắc vào lệnh đủ 4 khung</span></p>
    <table style="font-size:13px"><tr class="mut"><td style="width:auto"></td><td class="r">Lệnh</td><td class="r">Thắng</td><td class="r">Kỳ vọng</td><td class="r">PF</td><td class="r">30% mới</td></tr>
    ${CMP_VARS.map(([k,t])=>row(t,r.v[k])).join('')}</table>
    <p style="font-size:14px;margin:8px 0 4px">${msg}</p>
    <p class="note">Mỗi dòng là một lần chạy riêng với cùng dữ liệu, cùng cắt lỗ 1,5 ATR(1h), chốt lời ${(+globalThis.__rrT||2)}R, chỉ khác việc Kalman có tính điểm hay không. Phí giả định theo thị trường, chưa tính funding. Các bộ lọc khác (VWAP, phân kỳ, Order Block, FVG) theo cài đặt hiện tại.</p>`;
}

/* ---------- Tab StochRSI: lọc nhanh nhiều mã theo StochRSI (nến đã đóng), bấm vào mã để xem chi tiết ---------- */
const SR_FILTERS=[['all','Tất cả'],['os','Quá bán (K dưới 20)'],['ob','Quá mua (K trên 80)'],['upos','Cắt lên từ quá bán'],['dnob','Cắt xuống từ quá mua']];
async function srLoad(sym,tf,mk){
  const cache=S.srCache[mk]||(S.srCache[mk]=new Map()),key=sym+'|'+tf,c=cache.get(key);
  if(c&&Date.now()-c.t<60000) return c;
  const raw=await getJSON(klPath(mk,sym,tf,300),mk),C=klParse(mk,raw,tf);
  if(C.length&&C[C.length-1].ct>Date.now()) C.pop();      // bỏ nến đang chạy, giống phần còn lại của app
  if(C.length<80) throw new Error('ít dữ liệu');
  const ind=calcInd(C.map(x=>x.o),C.map(x=>x.h),C.map(x=>x.l),C.map(x=>x.c),C.map(x=>x.v));
  const e={t:Date.now(),st:srStat(ind,C),price:C[C.length-1].c};
  cache.set(key,e);return e;
}
function srStat(ind,C){
  const sk=ind.sk,sd=ind.sd,i=C.length-1,K=sk[i],D=sd[i];
  if(!isN(K)||!isN(D)) return null;
  let cross=null;
  for(let k=0;k<=5&&i-k>=1;k++){
    const j=i-k;
    if(!isN(sk[j])||!isN(sd[j])||!isN(sk[j-1])||!isN(sd[j-1])) continue;
    const lo=Math.min(sk[j],sk[j-1],isN(sk[j-2])?sk[j-2]:100),hi=Math.max(sk[j],sk[j-1],isN(sk[j-2])?sk[j-2]:0);
    if(sk[j]>sd[j]&&sk[j-1]<=sd[j-1]){cross={dir:'up',ago:k,zone:lo<25};break;}
    if(sk[j]<sd[j]&&sk[j-1]>=sd[j-1]){cross={dir:'dn',ago:k,zone:hi>75};break;}
  }
  return {K,D,cross,zone:K<20?'os':K>80?'ob':'mid'};
}
function srMatch(st,f){
  if(!st) return false;
  if(f==='all') return true;
  if(f==='os') return st.zone==='os';
  if(f==='ob') return st.zone==='ob';
  if(f==='upos') return !!(st.cross&&st.cross.dir==='up'&&st.cross.zone&&st.cross.ago<=3);
  if(f==='dnob') return !!(st.cross&&st.cross.dir==='dn'&&st.cross.zone&&st.cross.ago<=3);
  return true;
}
function srWhy(st){
  const z=st.zone==='os'?'Quá bán':st.zone==='ob'?'Quá mua':'Vùng giữa',c=st.cross;
  let t=`${z}, K ${st.K.toFixed(0)} ${st.K>st.D?'trên':'dưới'} D ${st.D.toFixed(0)}`;
  if(c) t+=`. K cắt ${c.dir==='up'?'lên':'xuống'} D ${c.ago===0?'ở nến vừa đóng':'cách '+c.ago+' nến'}${c.zone?(c.dir==='up'?' từ vùng quá bán':' từ vùng quá mua'):''}`;
  return t;
}
function srRow(r,tfs){
  const base=r.sym.replace(/USDT$/,''),chg=r.chg==null||!isFinite(r.chg)?'':`<span class="${r.chg>=0?'up':'dn'}">${r.chg>=0?'+':''}${r.chg.toFixed(1)}%</span>`;
  const cells=tfs.map(tf=>{
    const st=r.st[tf];if(!st) return `<div class="cell${tf===S.srTf?' sel':''}"><b>–</b><small>${tf}</small></div>`;
    const x=st.cross&&st.cross.ago<=3?`cắt ${st.cross.dir==='up'?'lên':'xuống'}`:'D '+st.D.toFixed(0);
    return `<div class="cell ${st.zone==='mid'?'':st.zone}${tf===S.srTf?' sel':''}"><b>${st.K.toFixed(0)}${st.K>st.D?'▲':'▼'}</b><small>${tf} · ${x}</small></div>`;
  }).join('');
  const cur=r.st[S.srTf];
  return `<button class="srr" data-srsym="${r.sym}"><div class="srh"><span><b>${base}</b><span class="mut">/USDT</span></span><span>${fmt(r.price)} ${chg}</span></div>
    <div class="cells" style="grid-template-columns:repeat(${tfs.length},1fr)">${cells}</div>${cur?`<div class="why">${srWhy(cur)}</div>`:''}</button>`;
}
function renderSr(){
  const mk=S.mkt,tfs=MKT[mk].tfs||Object.keys(TFS);
  if(!tfs.includes(S.srTf)) S.srTf=tfs.includes('1h')?'1h':tfs[0];
  $('srTfs').innerHTML=tfs.map(k=>`<button class="chip" data-srtf="${k}" aria-pressed="${k===S.srTf}">${k}</button>`).join(' ');
  const all=S.srRows.filter(r=>r.st[S.srTf]);
  $('srFilters').innerHTML=SR_FILTERS.map(([k,t])=>`<button class="chip sm" data-srf="${k}" aria-pressed="${k===S.srFilter}">${t} (${all.filter(r=>srMatch(r.st[S.srTf],k)).length})</button>`).join('');
  let rows=all.filter(r=>srMatch(r.st[S.srTf],S.srFilter));
  const f=S.srFilter;
  if(f==='os') rows.sort((a,b)=>a.st[S.srTf].K-b.st[S.srTf].K);
  else if(f==='ob') rows.sort((a,b)=>b.st[S.srTf].K-a.st[S.srTf].K);
  else if(f==='upos'||f==='dnob') rows.sort((a,b)=>a.st[S.srTf].cross.ago-b.st[S.srTf].cross.ago||a.st[S.srTf].K-b.st[S.srTf].K);
  const info=$('srInfo');
  if(info){const d=new Date(S.srAt||Date.now());info.textContent=(S.srBusy?'Đang quét… ':'')+`${S.srRows.length} mã lúc ${pad(d.getHours())}:${pad(d.getMinutes())}. StochRSI dùng nến đã đóng, K/D làm tròn, ▲ là K trên D, xanh là quá bán, đỏ là quá mua.`;}
  $('srRows').innerHTML=rows.length?rows.map(r=>srRow(r,tfs)).join(''):`<div class="empty">${S.srBusy?'Đang quét…':'Không có mã nào khớp bộ lọc này ở khung '+S.srTf+'.'}</div>`;
}
async function runSr(){
  if(S.srBusy) return;
  const mk=S.mkt,tok=++S.srTok,tfs=MKT[mk].tfs||Object.keys(TFS);
  S.srBusy=true;S.srRows=[];S.srAt=Date.now();S.srMk=mk;
  const pg=$('srProg');pg.hidden=false;pg.firstElementChild.style.width='2%';renderSr();
  let list=[];try{list=await loadTop(25,mk);}catch(e){}
  let done=0;const q=list.slice();
  const worker=async()=>{
    while(q.length){
      const t=q.shift();if(tok!==S.srTok) return;
      try{
        const res=await Promise.all(tfs.map(tf=>srLoad(t.sym,tf,mk).catch(()=>null)));
        if(tok!==S.srTok) return;
        const st={};tfs.forEach((tf,i)=>{st[tf]=res[i]?res[i].st:null;});
        const px=(res.find(x=>x)||{}).price;
        if(px!=null) S.srRows.push({sym:t.sym,chg:t.chg,price:px,st});
      }catch(e){}
      done++;pg.firstElementChild.style.width=Math.round(done/Math.max(1,list.length)*100)+'%';renderSr();
    }
  };
  await Promise.all(Array.from({length:4},worker));
  if(tok!==S.srTok) return;
  S.srBusy=false;pg.hidden=true;S.srAt=Date.now();renderSr();
}
function srClick(e){
  const b=e.target.closest('button');if(!b) return;
  const d=b.dataset;
  if(d.srtf){S.srTf=d.srtf;renderSr();}
  else if(d.srf){S.srFilter=d.srf;renderSr();}
  else if(d.srsym){
    S.sym=d.srsym;if((MKT[S.mkt].tfs||Object.keys(TFS)).includes(S.srTf)) S.tf=S.srTf;
    S.L.srsi=1;tfButtons($('tfChart'));tfButtons($('tfScan'));buildLayers();setTab('chart');showChart();
  }
}

function frNote(A){
  const fr=A.frvp;
  if(!fr) return '<p class="note"><b>FRVP (điểm cân bằng theo xu hướng):</b> khung này chưa có xu hướng rõ (đi ngang hoặc nhịp quá nhỏ) nên chưa có profile. Chỉ để xem, không tính vào điểm.</p>';
  const last=A.C[A.n-1].c,d=(last/fr.poc-1)*100,up=fr.tr>0;
  const pos=last>fr.vah?'đang trên vùng giá trị':last<fr.val?'đang dưới vùng giá trị':'đang trong vùng giá trị';
  return `<p class="note"><b>FRVP, điểm cân bằng của ${up?'nhịp tăng':'nhịp giảm'}</b> (${fmt(fr.lo)} đến ${fmt(fr.hi)}, ${fr.e-fr.a+1} nến): POC <b>${fmt(fr.poc)}</b>, vùng giá trị <b>${fmt(fr.val)}</b> đến <b>${fmt(fr.vah)}</b>. Giá hiện tại ${pos}, ${d>=0?'cao hơn':'thấp hơn'} POC ${Math.abs(d).toFixed(1)}%. Trong ${up?'nhịp tăng POC và VAL':'nhịp giảm POC và VAH'} thường là vùng để canh giá hồi về. Chỉ để tham khảo, không tính vào điểm.</p>`;
}
async function renderMTF(){
  const el=$('mtf');if(!el) return;
  const sym=S.sym,tok=++mtfTok;
  el.innerHTML='<div class="card mtf"><h3>Kết luận đa khung</h3><p class="note">Đang tổng hợp 4 khung 15m, 1h, 4h, 1 ngày…</p></div>';
  const ord=mtfOf();
  const ents=await Promise.all(ord.map(tf=>load(sym,tf).catch(()=>null)));
  if(tok!==mtfTok||sym!==S.sym) return;
  const box=$('mtf');if(!box) return;
  if(ents.some(e=>!e)){box.innerHTML='<div class="card mtf"><h3>Kết luận đa khung</h3><p class="note">Chưa tải đủ dữ liệu 4 khung nên chưa kết luận được. Bấm Làm mới để thử lại.</p></div>';return;}
  const R={};ord.forEach((tf,i)=>{const fc=ents[i].A.fc;R[tf]={dir:fc.dir,pct:fc.pct,norm:fc.bias/fc.max,ent:ents[i]};});
  const v=mv(R),demo=ents.some(e=>e.demo);
  const want=v.side;
  const rows=ord.map(tf=>{
    const r=R[tf],mark=want?(r.dir===want?'<span class="ok">✓</span>':'<span class="no">✗</span>'):'';
    return `<tr><td>${tf}</td><td class="mut">${MTF_ROLE[tf]}</td><td><span class="pill ${r.dir==='buy'?'buy':r.dir==='sell'?'sell':'wait'}">${dirTxt(r.dir)}</span></td><td class="r">${r.pct}/100 ${mark}</td></tr>`;
  }).join('');
  const frRows=ord.map(tf=>{
    const A=R[tf].ent.A,fr=A.frvp,last=A.C[A.n-1].c;
    if(!fr) return `<tr><td>${tf}</td><td class="mut" colspan="4">chưa có xu hướng rõ</td></tr>`;
    const d=(last/fr.poc-1)*100;
    return `<tr><td>${tf}</td><td><span class="pill ${fr.tr>0?'buy':'sell'}">${fr.tr>0?'Nhịp tăng':'Nhịp giảm'}</span></td><td class="r">${fmt(fr.poc)}</td><td class="r">${fmt(fr.val)}–${fmt(fr.vah)}</td><td class="r ${d>=0?'up':'dn'}">${d>=0?'+':''}${d.toFixed(1)}%</td></tr>`;
  }).join('');
  const isReady=rdy(v);
  let anchor=null;
  if(isReady){const em={};ord.forEach((tf,i)=>{em[tf]=ents[i];});try{anchor=mtfAnchor(ord,em,192,true,v.side,FUT());}catch(e){anchor=null;}}
  S.anchor={sym,ready:isReady,a:anchor};
  box.innerHTML=`<div class="card ticket mtf ${v.cls==='wait'?'':v.cls}">
    <h3>Kết luận đa khung ${sym.replace('USDT','')}${FUT()?' · Futures':''}</h3>
    <div class="big ${v.cls==='buy'?'up':v.cls==='sell'?'dn':''}">${v.txt}</div>
    <p style="font-size:14px;margin:4px 0">${v.why}</p>
    <div id="mtfLive"></div>
    <div class="kv" style="margin-top:6px"><span class="mut">Điểm đa khung (−100 đến +100)</span><b>${v.score>0?'+':''}${Math.round(v.score*100)}</b></div>
    <div id="mtfValid"></div>
    <table>${rows}</table>
    <p style="margin:12px 0 2px;font-size:14px"><b>Điểm cân bằng theo từng khung (FRVP)</b></p>
    <div class="sc"><table style="font-size:13px"><tr class="mut"><td>Khung</td><td>Xu hướng</td><td class="r">POC</td><td class="r">Vùng giá trị</td><td class="r">Giá so POC</td></tr>${frRows}</table></div>
    <p class="note">FRVP là profile khối lượng của nhịp xu hướng hiện tại trên từng khung. Chỉ để tham khảo, không tính vào điểm hay kết luận.</p>
    <p class="note">Quy tắc: 1 ngày và 4h quyết định hướng, 1h xác nhận, 15m chọn điểm vào. Điểm vào là giá đóng nến 15m đầu tiên đủ điều kiện, giá hiện tại cho biết còn vào được hay đã trễ. Hai khung lớn ngược nhau thì luôn là CHỜ. Tính trên nến đã đóng; chỉ là xác suất, luôn đặt cắt lỗ.${FUT()?' Chế độ Futures: LONG và SHORT dùng cùng điều kiện đối xứng. Backtest chưa tính funding và rủi ro thanh lý, hãy dùng máy tính vị thế để chọn đòn bẩy.':''}${S.mkt==='bstock'?' Đây là hợp đồng vĩnh viễn TradFi của Bybit (cổ phiếu, vàng, bạc, dầu…): giá tổng hợp, giao dịch 24/7, có phí funding, có thể lệch giá thật ngoài giờ giao dịch của thị trường gốc. Với dầu thô, giá bám hợp đồng tương lai nên có thể có bước nhảy khi chuyển kỳ hạn. Nếu dùng đòn bẩy, hãy tính khoảng cách tới giá thanh lý trước khi đặt cắt lỗ.':''}${S.mkt==='fx'?' Đây là giá hợp đồng vĩnh viễn forex trên Bybit (tổng hợp, giao dịch 24/7, có phí funding), có thể lệch giá forex thật, nhất là cuối tuần. Hợp đồng mới ra mắt 8/9/2026 nên chưa có khung 1 ngày, kết luận dựa trên 4h, 1h và 15m. Đòn bẩy cao dễ chạm giá thanh lý, hãy tính trước khoảng cách này.':''}${S.mkt==='stock'?' Đây là giá hợp đồng vĩnh viễn trên Binance Futures: giao dịch 24/7, có phí funding mỗi 8 giờ và có thể lệch giá cổ phiếu thật ngoài giờ Mỹ. Nếu dùng đòn bẩy, hãy tính khoảng cách tới giá thanh lý trước khi đặt cắt lỗ.':''}${demo?' Đang dùng dữ liệu mô phỏng nên kết luận này chưa có giá trị.':''}</p>
    <button class="go" id="mtfBtBtn" style="width:100%;margin-top:10px">${S.mtfBt&&!S.mtfBt.err?'Chạy lại backtest đa khung':'Chạy backtest đa khung (6 coin lớn, ~4 tháng)'}</button>
    <div id="mtfBt"></div>
    <button class="go" id="cmpBtBtn" style="width:100%;margin-top:8px;background:#4B46B8">So sánh bật/tắt Kalman bằng backtest (6 coin)</button>
    <div id="cmpBt"></div>
  </div>`;
  const bb=$('mtfBtBtn');if(bb) bb.onclick=runMtfBt;
  const fb=$('cmpBtBtn');if(fb) fb.onclick=runCmp;renderCmp();
  renderMtfBt();
  {const e1=R['1h'].ent,e15=R['15m']?R['15m'].ent:e1,lc=e15.C[e15.C.length-1],lv15=S.live[sym+'|15m'];
   S.lv={sym,side:v.side==='sell'?'sell':'buy',px:lv15&&lv15.t>lc.t?lv15.c:lc.c,atr:e1.A.ind.atr[e1.A.n-1]};}
  paintValid();renderCalc();
  S.mtfClosed={sym,v};alertChange(sym,v);paintLive();provMTF();
  if('Notification' in window&&Notification.permission==='default'){const nb=document.createElement('button');nb.className='chip sm';nb.style.marginTop='8px';nb.textContent='Bật thông báo trình duyệt khi đổi kết luận';nb.onclick=()=>{try{Notification.requestPermission().then(()=>nb.remove());}catch(e){}};box.firstElementChild.appendChild(nb);}
}

/* ---------- Backtest đa khung: so bản 1h đơn lẻ với lọc đa khung, trên nhiều coin, dữ liệu sâu hơn 1000 nến ---------- */
const BT_PAGES={'1d':1,'4h':2,'1h':4,'15m':12};
async function loadDeep(sym,tf,pages,mk){
  const step=TFS[tf],now=Date.now(),reqs=[];
  for(let k=0;k<pages;k++) reqs.push(getJSON(klPath(mk,sym,tf,1000,now-k*1000*step),mk));
  const res=await Promise.all(reqs),m=new Map();
  for(const raw of res) for(const o of klParse(mk,raw,tf)){ if(o.ct<=now) m.set(o.t,o); }
  return [...m.values()].sort((a,b)=>a.t-b.t);
}
const tick=()=>new Promise(r=>setTimeout(r,0));
async function btCoin(sym,mk,fut){
  const D={},A={};
  const ord=mtfOf(mk),BP=MKT[mk].btPages||BT_PAGES;
  await Promise.all(ord.map(async tf=>{D[tf]=await loadDeep(sym,tf,BP[tf],mk);}));
  for(const tf of ord){ if(D[tf].length<MKT[mk].minBars) throw new Error('ít dữ liệu '+tf); A[tf]=analyze(D[tf]); await tick(); }
  const C=D['1h'],n=C.length,h=C.map(x=>x.h),l=C.map(x=>x.l),c=C.map(x=>x.c),atr=A['1h'].ind.atr;
  const startCt=D['15m'][0].ct+300*TFS['15m'];
  let w0=-1;for(let i=250;i<n;i++){ if(C[i].ct>=startCt){w0=i;break;} }
  if(w0<0||n-w0<200) throw new Error('cửa sổ ngắn');
  const lateFrom=w0+Math.floor(0.7*(n-w0));
  const ptr={'1d':0,'4h':0,'15m':0},out={base:[],mtf3:[],mtf4:[]},last={mtf3:-99,mtf4:-99},prev={mtf3:'',mtf4:''};
  const keys=[['mtf3',true],['mtf4',false]];
  for(let i=w0;i<n-1;i++){
    const ct=C[i].ct,R={'1h':A['1h'].fcAt(i)};let ok=true;
    for(const tf of ord.filter(t=>t!=='1h')){
      const arr=D[tf];while(ptr[tf]+1<arr.length&&arr[ptr[tf]+1].ct<=ct) ptr[tf]++;
      if(arr[ptr[tf]].ct>ct||ptr[tf]<MKT[mk].warm){ok=false;break;}
      R[tf]=A[tf].fcAt(ptr[tf]);
    }
    if(!ok) continue;
    for(const [key,no15] of keys){
      const v=mtfVerdict(R,no15,fut),rd=mtfReady(v,fut)?v.side:'';
      if(rd&&rd!==prev[key]&&i-last[key]>=6&&isN(atr[i])){
        const sg=rd==='sell'?-1:1,risk=1.5*atr[i],rrT=+globalThis.__rrT||2,sig={i,side:rd,entry:c[i],risk,sl:c[i]-sg*risk,tp:c[i]+sg*rrT*risk,rr:rrT};
        const res=simulate(sig,h,l,c,n,60);
        if(res.status!=='open') out[key].push({R:res.R,late:i>=lateFrom,side:rd});
        last[key]=i;
      }
      prev[key]=rd;
    }
  }
  for(const s of A['1h'].signals) if((fut||s.side==='buy')&&s.i>=w0&&s.res.status!=='open') out.base.push({R:s.res.R,late:s.i>=lateFrom,side:s.side});
  out.days=Math.round((C[n-1].ct-C[w0].t)/86400000);
  return out;
}
function setBt(mk,v){if(S.mkt===mk) S.mtfBt=v;else (S.saved[mk]=S.saved[mk]||{}).mtfBt=v;}
async function runMtfBt(){
  if(S.mtfBusy) return;
  S.mtfBusy=true;const mk=S.mkt;netReset(mk);let lastErr='';
  const b0=$('mtfBtBtn');if(b0){b0.classList.add('busy');b0.textContent='Đang chạy backtest…';}
  try{
    const fut=FUT(),coins=(await loadTop(6,mk)).map(t=>t.sym),agg={base:[],mtf3:[],mtf4:[],coins:[],days:0,fut};
    for(let k=0;k<coins.length;k++){
      const h=$('mtfBt');if(h) h.innerHTML=`<p class="note">Đang chạy ${k+1}/${coins.length}: ${coins[k].replace('USDT','')}. Mỗi coin mất vài giây, vui lòng giữ trang mở.</p>`;
      try{
        const r=await btCoin(coins[k],mk,fut);
        for(const key of ['base','mtf3','mtf4']) agg[key].push(...r[key]);
        agg.coins.push(coins[k].replace('USDT',''));agg.days=Math.max(agg.days,r.days);
      }catch(e){ if(!agg.coins.length) lastErr=e&&e.message||''; }
    }
    setBt(mk,agg.coins.length?agg:{err:'Không tải được dữ liệu '+MKT[mk].src+(lastErr?' ('+lastErr+')':'')+'. Thử lại bằng Chrome hoặc Safari, hoặc kiểm tra mạng.'});
  }catch(e){ setBt(mk,{err:'Không chạy được backtest: '+(e&&e.message||'lỗi')}); }
  S.mtfBusy=false;
  const b1=$('mtfBtBtn');if(b1){b1.classList.remove('busy');b1.textContent='Chạy lại backtest đa khung';}
  renderMtfBt();
}
function renderMtfBt(){
  const r=S.mtfBt,host=$('mtfBt');if(!host||!r) return;
  if(r.err){host.innerHTML=`<p class="note">${r.err}</p>`;return;}
  const row=(name,t)=>{const st=calcStats(t),ol=calcStats(t.filter(x=>x.late));
    return `<tr><td style="width:auto">${name}</td><td class="r">${st.n}</td><td class="r">${st.n?(st.wr*100).toFixed(0)+'%':'–'}</td><td class="r ${st.n&&st.exp>0?'up':'dn'}">${st.n?R2(st.exp):'–'}</td><td class="r">${st.n?(isFinite(st.pf)?st.pf.toFixed(2):'∞'):'–'}</td><td class="r">${ol.n?R2(ol.exp):'–'}</td></tr>`;};
  const b=calcStats(r.base),m3=calcStats(r.mtf3),m4=calcStats(r.mtf4);
  let msg;
  if(m4.n<20) msg='Số lệnh của bản đủ 4 khung còn ít (dưới 20) nên chưa kết luận được. Mẫu nhỏ rất dễ cho kết quả đẹp hoặc xấu do may rủi.';
  else if(m4.exp>0&&m4.exp>b.exp) msg=`Lọc đủ 4 khung cho kỳ vọng ${R2(m4.exp)} mỗi lệnh, cao hơn bản 1h đơn lẻ (${R2(b.exp)}), đổi lại số lệnh ít hơn (${m4.n} so với ${b.n}). Nên xem cột 30% mới nhất có còn dương không trước khi tin.`;
  else if(m4.exp>0) msg=`Bản đủ 4 khung vẫn có kỳ vọng dương (${R2(m4.exp)}) nhưng không hơn bản 1h đơn lẻ (${R2(b.exp)}). Lợi ích chính là bớt lệnh, chưa chứng minh chính xác hơn.`;
  else msg=`Kỳ vọng của bản đủ 4 khung vẫn âm (${R2(m4.exp)}). Chưa nên dựa riêng vào kết luận này để vào lệnh thật.`;
  host.innerHTML=`<p style="margin:10px 0 4px"><b>Kết quả backtest</b> <span class="mut">${r.coins.join(', ')}, khoảng ${r.days} ngày</span></p>
    <table style="font-size:13px"><tr class="mut"><td style="width:auto"></td><td class="r">Lệnh</td><td class="r">Thắng</td><td class="r">Kỳ vọng</td><td class="r">PF</td><td class="r">30% mới</td></tr>
    ${row('1h đơn lẻ (cũ)',r.base)}${row('Đa khung 1d+4h+1h',r.mtf3)}${row('Đủ 4 khung',r.mtf4)}${r.fut?row('  chỉ LONG',r.mtf4.filter(x=>x.side==='buy'))+row('  chỉ SHORT',r.mtf4.filter(x=>x.side==='sell')):''}</table>
    <p style="font-size:14px;margin:8px 0 4px">${msg}</p>
    ${S.mkt==='bstock'?'<p class="note">Hợp đồng TradFi của Bybit mới ra mắt từ khoảng tháng 3 và 4/2026 nên lịch sử chỉ vài tháng, mẫu nhỏ, chỉ mang tính tham khảo. Mức phí là giả định, backtest chưa tính phí funding.</p>':''}${S.mkt==='fx'?'<p class="note">Hợp đồng forex mới ra mắt 8/9/2026, lịch sử chỉ khoảng một tháng nên kết quả backtest gần như không có ý nghĩa thống kê. Mức phí là giả định, bạn nên đối chiếu với phí thật của Bybit.</p>':''}${S.mkt==='stock'?'<p class="note">Hợp đồng cổ phiếu mới niêm yết từ đầu 2026 nên lịch sử ngắn và mẫu nhỏ, chỉ mang tính tham khảo. Backtest chưa tính phí funding.</p>':''}<p class="note">${r.fut?'Tính cả lệnh LONG và SHORT, chưa tính phí funding và thanh lý.':'Chỉ tính lệnh mua.'} Vào ở giá đóng nến 1h, cắt lỗ 1,5 ATR(1h), chốt lời ${S.rrT}R, giữ tối đa 60 nến, phí giả định ${(((globalThis.__fee==null?0.002:globalThis.__fee))*50).toFixed(2).replace('.',',')}% mỗi chiều. Kỳ vọng tính theo R (1R = mức rủi ro mỗi lệnh). Mỗi tín hiệu chỉ dùng thông tin đã có tại lúc nến đóng. Quá khứ không đảm bảo tương lai, và đây là công cụ phân tích, không phải lời khuyên đầu tư.</p>`;
}

/* ---------- Realtime: WebSocket Binance cho cả 4 khung (dự phòng: hỏi giá mỗi 4 giây) ---------- */
const RT={hb:null,mk:'coin',ws:null,sym:null,ok:false,lastMsg:0,retry:0,timer:null,poll:null,dirty:false,provAt:0,prov:false,hostIdx:0,rs:{}};
const WSHOSTS=['wss://data-stream.binance.vision','wss://stream.binance.com:9443','wss://stream.binance.com'];
function liveOf(E){const o=S.live[E.sym+'|'+E.tf];return o&&o.t>E.C[E.C.length-1].t?o:null;}
function toast(msg,cls){
  const d=document.createElement('div');d.className='toast '+(cls==='buy'||cls==='sell'?cls:'');d.textContent=msg;
  document.body.appendChild(d);setTimeout(()=>d.remove(),9000);d.onclick=()=>d.remove();
}
function alertChange(sym,v){
  const prev=S.lastV[sym];S.lastV[sym]=v.txt;
  if(!prev||prev===v.txt) return;
  const msg=sym.replace('USDT','')+': kết luận đa khung đổi từ '+prev+' sang '+v.txt;
  toast(msg,v.cls==='wait'?'':v.cls);
  try{if('Notification' in window&&Notification.permission==='granted') new Notification('Trạm tín hiệu coin',{body:msg});}catch(e){}
}
function paintLive(){
  const el=$('mtfLive'),L=S.mtfLive;if(!el||!L||L.sym!==S.sym) return;
  const cl0=S.mtfClosed&&S.mtfClosed.sym===S.sym?S.mtfClosed.v:null,same=cl0&&cl0.txt===L.v.txt;
  const cls=L.v.cls==='buy'?'up':L.v.cls==='sell'?'dn':'';
  el.innerHTML=`<div class="livel"><span class="dot"></span>Nếu nến đóng ngay lúc này: <b class="${cls}">${L.v.txt}</b>${same?'':' <span class="chg">(khác kết luận đã chốt, chờ nến đóng để xác nhận)</span>'}</div>`;
}
async function provMTF(){
  if(RT.prov||!(RT.ok||RT.poll)) return;
  RT.prov=true;
  try{
    const sym=S.sym;let R={};
    for(const tf of mtfOf()){
      const ent=S.cache.get(sym+'|'+tf);if(!ent||ent.demo){R=null;break;}
      const lv=S.live[sym+'|'+tf],last=ent.C[ent.C.length-1];let fc=ent.A.fc;
      if(lv&&lv.t>last.t){fc=analyze(ent.C.concat([lv])).fc;await tick();}
      R[tf]={dir:fc.dir,pct:fc.pct,norm:fc.bias/fc.max};
    }
    if(R&&sym===S.sym){S.mtfLive={sym,R,v:mv(R),at:Date.now()};paintLive();}
  }catch(e){}
  RT.prov=false;
}
async function rtResync(tf){
  const sym=RT.sym,key=sym+'|'+tf;if(!sym||RT.rs[key]) return;
  RT.rs[key]=1;
  try{
    S.cache.delete(key);delete S.live[key];
    const e=await load(sym,tf);
    if(sym===S.sym){if(tf===S.tf){S.cur=e;renderAside();}else renderMTF();draw();}
  }catch(err){}
  delete RT.rs[key];
}
function rtCandle(sym,tf,o,closed){
  if(sym!==S.sym||sym!==RT.sym) return;
  const key=sym+'|'+tf,ent=S.cache.get(key);
  RT.lastMsg=Date.now();RT.dirty=true;
  if(!ent||ent.demo){if(!closed) S.live[key]=o;return;}
  const C=ent.C,last=C[C.length-1],step=TFS[tf];
  if(o.t-last.t>step*1.5){rtResync(tf);return;}
  if(!closed){if(o.t>last.t) S.live[key]=o;return;}
  if(o.t<=last.t) return;                 // nến này đã có
  delete S.live[key];
  const nOld=C.length,C2=C.concat([o]).slice(-1000);
  const ent2={sym,tf,C:C2,A:analyze(C2),t:Date.now(),demo:false,err:'',ws:true};
  S.cache.set(key,ent2);
  if(tf===S.tf&&S.cur&&S.cur.sym===sym){
    const follow=V.end>=nOld-1;
    S.cur=ent2;if(follow) V.end+=1;
    const sg=ent2.A.signals,latest=sg.length?sg[sg.length-1]:null,keep=S.selSig&&sg.find(x=>x.i===S.selSig.i);
    S.selSig=(latest&&latest.i===C2.length-1)?latest:(keep||latest);
    if(latest&&latest.i===C2.length-1) toast(`${sym.replace('USDT','')} ${tf}: tín hiệu ${lw(latest.side).toUpperCase()} mới (điểm ${latest.strength})`,latest.side);
    stamp();renderAside();draw();
  }else if(S.tab==='chart'){renderMTF();}
}
function rtStop(){
  clearTimeout(RT.timer);clearInterval(RT.poll);clearInterval(RT.hb);RT.poll=null;RT.ok=false;
  if(RT.ws){const w=RT.ws;RT.ws=null;w.onopen=w.onmessage=w.onclose=w.onerror=null;try{w.close();}catch(e){}}
}
async function rtPoll(){
  const sym=RT.sym;if(!sym||RT.ok||document.hidden) return;
  for(const tf of mtfOf(RT.mk)){
    try{
      const raw=await getJSON(klPath(RT.mk,sym,tf,2),RT.mk),now=Date.now();
      for(const o of klParse(RT.mk,raw,tf)) rtCandle(sym,tf,o,o.ct<=now);
    }catch(e){}
  }
}
function rtConnect(){
  const sym=RT.sym;if(!sym||typeof WebSocket==='undefined'){if(sym&&!RT.poll){RT.poll=setInterval(rtPoll,4000);updateSrc();}return;}
  const M=MKT[RT.mk],ord=mtfOf(RT.mk),streams=ord.map(tf=>sym.toLowerCase()+'@kline_'+tf).join('/');
  let ws,opened=false;
  const urls=M.bybit?M.wsUrls:M.ws(streams);
  try{ws=new WebSocket(urls[RT.hostIdx%urls.length]);}catch(e){RT.hostIdx++;RT.timer=setTimeout(rtConnect,3000);return;}
  RT.ws=ws;
  const guard=setTimeout(()=>{if(!opened){try{ws.close();}catch(e){}}},6000);
  ws.onopen=()=>{opened=true;clearTimeout(guard);RT.ok=true;RT.retry=0;clearInterval(RT.poll);RT.poll=null;
    if(M.bybit){
      try{ws.send(JSON.stringify({op:'subscribe',args:ord.map(tf=>'kline.'+IVB[tf]+'.'+sym)}));}catch(e){}
      clearInterval(RT.hb);RT.hb=setInterval(()=>{try{ws.send('{"op":"ping"}');}catch(e){}},20000);
    }
    for(const [k,e] of S.cache) if(k.startsWith(sym+'|')&&!e.demo) e.ws=true;updateSrc();};
  ws.onmessage=ev=>{try{
    const j=JSON.parse(ev.data);
    if(M.bybit){
      if(j.op==='subscribe'&&j.success===false){try{ws.close();}catch(e){}return;}
      if(j.topic&&j.data&&j.topic.startsWith('kline.')){
        const tf=IVB_REV[j.topic.split('.')[1]];
        if(tf) for(const k of j.data) rtCandle(sym,tf,{t:+k.start,o:+k.open,h:+k.high,l:+k.low,c:+k.close,v:+k.volume,ct:+k.start+TFS[tf]-1},!!k.confirm);
      }
    }else{const d=j.data;if(d&&d.k){const k=d.k;rtCandle(d.s,k.i,{t:k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,v:+k.v,ct:k.T},k.x);}}
  }catch(e){}};
  ws.onerror=()=>{try{ws.close();}catch(e){}};
  ws.onclose=()=>{
    clearTimeout(guard);clearInterval(RT.hb);if(RT.ws!==ws) return;
    RT.ok=false;RT.hostIdx++;
    if(!RT.poll) RT.poll=setInterval(rtPoll,4000);
    updateSrc();RT.timer=setTimeout(rtConnect,Math.min(15000,1500*(++RT.retry)));
  };
}
function rtStart(sym){
  if(RT.sym===sym&&RT.mk===S.mkt&&(RT.ws||RT.poll)) return;
  rtStop();RT.sym=sym;RT.mk=S.mkt;S.live={};S.mtfLive=null;RT.retry=0;rtConnect();
}

function renderAside(){
  const E=S.cur,el=$('aside');
  if(!E){el.innerHTML='';return;}
  const A=E.A,C=E.C,n=C.length,now=A.now,vd=verdict(now);
  const sel=S.selSig||A.signals[A.signals.length-1]||null;
  let h='<div id="mtf"></div><div id="calc"></div>';

  // dự báo cho các nến sắp tới
  const fc=A.fc,fcCls=fc.dir==='wait'?'wait':fc.dir,hrs=fc.horizon*TFS[S.tf]/3600000,hz=hrs<48?Math.round(hrs)+' giờ':Math.round(hrs/24)+' ngày';
  h+=`<div class="card ticket ${fc.dir==='wait'?'':fc.dir}">
    <div class="tk-head"><b class="${fc.dir==='buy'?'up':fc.dir==='sell'?'dn':''}">Dự báo: ${fc.dir==='buy'?'nghiêng TĂNG':fc.dir==='sell'?'nghiêng GIẢM':'chưa rõ hướng'}${fc.strong?' (mạnh)':''}</b><span class="mut">sau nến ${fdate(C[n-1].t,true)}</span></div>
    <div style="margin-top:4px"><span class="meter ${fcCls}"><i style="width:${fc.pct}%"></i></span> <b>${fc.pct}/100</b> <span class="mut">độ nghiêng của chỉ báo</span></div>
    ${fc.dir!=='wait'?`<div class="lv">
      <span>Vùng vào dự kiến</span><span>${fmt(fc.zoneLo)}–${fmt(fc.zoneHi)}</span><span></span>
      <span>Mục tiêu 1</span><span class="up">${fmt(fc.tp1)}</span><span>R:R 1:${fc.rr}</span>
      <span>Mục tiêu 2</span><span class="up">${fmt(fc.tp2)}</span><span>${fc.tp2Src}</span>
      <span>Cắt lỗ nếu sai</span><span class="dn">${fmt(fc.sl)}</span><span>${fc.slPct.toFixed(2)}%</span></div>`:''}
    <p class="note">Kịch bản cho khoảng ${fc.horizon} nến tới (~${hz}). Đây là ước tính từ trạng thái hiện tại của các chỉ báo, chưa phải kết quả đã xảy ra; giá có thể đi ngược dự báo nên luôn cần cắt lỗ.${fc.confirmed?' Các nến gần nhất còn có điểm vào đồng thuận cùng hướng.':''}</p>
    ${frNote(A)}
    <b>Các chỉ báo đang nghiêng thế nào</b>
    <ul class="why">${fc.votes.map(v=>`<li><span class="pts ${v.v<0?'m':'p'}">${v.v>0?'+':''}${v.v.toFixed(1)}</span><span><span class="tg">${TYPE_LABEL[v.type]}</span>${v.txt}</span></li>`).join('')}</ul>
    <div class="total"><span>Tổng độ nghiêng</span><span>${fc.bias>0?'+':''}${fc.bias.toFixed(1)} / ${fc.max.toFixed(1)}</span></div>
  </div>`;

  // thẻ lý do
  if(sel){
    const buy=sel.side==='buy',r=sel.res,age=n-1-sel.i;
    const resHtml=r.status==='tp'?`<div class="res win">Đối chiếu sau đó: chạm chốt lời sau ${r.bars} nến, ${R2(r.R)}</div>`:
      r.status==='sl'?`<div class="res loss">Đối chiếu sau đó: chạm cắt lỗ sau ${r.bars} nến, ${R2(r.R)}</div>`:
      r.status==='time'?`<div class="res ${r.R>0?'win':'loss'}">Đối chiếu sau đó: hết ${r.bars} nến chưa chạm mốc nào, đóng lệnh ${R2(r.R)}</div>`:
      `<div class="res flat">Chưa có kết quả, đang chờ diễn biến</div>`;
    h+=`<div class="card ticket ${sel.side}">
      <div class="tk-head"><b class="${buy?'up':'dn'}">Tín hiệu ${lw(sel.side)} (${age===0?'vừa xuất hiện':'trong quá khứ'})</b><span class="mut">${fdate(sel.t,true)}${age===0?', nến vừa đóng':`, cách ${age} nến`}</span></div>
      <div style="margin-top:4px"><span class="meter ${sel.side}"><i style="width:${sel.strength}%"></i></span> <b>${sel.strength}/100</b> <span class="mut">độ đồng thuận</span></div>
      <div class="lv">
        <span>Vào lệnh</span><span>${fmt(sel.entry)}</span><span></span>
        <span>Cắt lỗ</span><span class="dn">${fmt(sel.sl)}</span><span>${(sel.risk/sel.entry*100).toFixed(2)}%</span>
        <span>Chốt lời</span><span class="up">${fmt(sel.tp)}</span><span>R:R 1:${sel.rr}</span>
      </div>
      <b>Vì sao có điểm ${lw(sel.side)} này</b>
      <ul class="why">${sel.items.map(it=>`<li><span class="pts ${it.pts<0?'m':'p'}">${it.pts>0?'+':''}${it.pts.toFixed(1)}</span>
        <span><span class="tg">${TYPE_LABEL[it.type]}${it.j<sel.i?` <span class="mut" style="font-weight:400">(trước ${sel.i-it.j} nến)</span>`:''}</span>${it.txt}</span></li>`).join('')}</ul>
      <div class="total"><span>Tổng điểm</span><span>${sel.score.toFixed(1)}</span></div>
      ${resHtml}
      <p class="note">Mũi tên là các lần chỉ báo đồng thuận trong quá khứ; phần đối chiếu chỉ để kiểm chứng độ chính xác. Chạm vào mũi tên để xem lý do.</p>
    </div>`;
  }else h+=`<div class="card"><h3>Chưa có điểm mua bán</h3><p class="note">Trong dữ liệu này chưa có thời điểm nào đủ đồng thuận.</p></div>`;

  // backtest
  const st=A.stats,bd=btBadge(st.all,st.oos);
  const row=(a,b)=>`<span>${a}</span><b>${b}</b>`;
  h+=`<div class="card"><h3>Backtest ${E.sym.replace('USDT','')} khung ${S.tf}</h3>
    <span class="badge ${bd.cls}" style="margin:0 0 8px">${bd.txt}</span>
    <div class="kv">${row('Số lệnh',st.all.n+` (${lw('buy')} ${st.buy.n}, ${lw('sell')} ${st.sell.n})`)}
    ${row('Tỷ lệ thắng',(st.all.wr*100).toFixed(0)+'%')}
    ${row('Kỳ vọng mỗi lệnh',st.all.n?R2(st.all.exp):'–')}
    ${row('Profit factor',st.all.n?(isFinite(st.all.pf)?st.all.pf.toFixed(2):'∞'):'–')}
    ${row('Sụt giảm tối đa',st.all.dd.toFixed(1)+'R')}
    ${row('30% dữ liệu mới nhất',st.oos.n?`${st.oos.n} lệnh, ${R2(st.oos.exp)}`:'chưa có lệnh')}</div>
    <p class="note">Kỳ vọng = tỷ lệ thắng × lãi trung bình − tỷ lệ thua × lỗ trung bình, tính theo R (1R = mức rủi ro mỗi lệnh). Thắng nhiều chưa chắc có lãi. Cần từ 20 lệnh trở lên và kỳ vọng dương ở cả phần dữ liệu mới nhất mới đáng tin.</p></div>`;

  // vùng giá
  const last=C[n-1].c,zs=A.zonesNow.slice().sort((a,b)=>Math.abs(a.mid-last)-Math.abs(b.mid-last)).slice(0,5).sort((a,b)=>b.mid-a.mid);
  h+=`<div class="card"><h3>Vùng giá gần nhất</h3>`+(zs.length?`<div class="kv">${zs.map(z=>`<span class="${z.mid>last?'dn':'up'}">${z.mid>last?'Kháng cự':'Hỗ trợ'} (${z.touches} lần chạm)</span><b>${fmt(z.lo)}–${fmt(z.hi)}</b>`).join('')}</div>`:`<p class="note">Chưa xác định được vùng nào.</p>`)+`</div>`;

  // danh sách tín hiệu
  const rec=A.signals.slice(-12).reverse();
  h+=`<div class="card"><h3>Tín hiệu gần đây</h3><ul class="list">${rec.map(s=>`<li><button data-sig="${s.i}" ${sel&&sel.i===s.i?'aria-current="true"':''}>
    <span><b class="${s.side==='buy'?'up':'dn'}">${sideTxt(s.side)}</b> <span class="mut">${fdate(s.t,true)}</span></span>
    <span>${s.res.status==='open'?'đang mở':R2(s.res.R)}</span></button></li>`).join('')||'<li class="note">Chưa có.</li>'}</ul></div>`;
  el.innerHTML=h;renderMTF();
}

/* ---------- màn hình Bộ lọc ---------- */
const sideLbl=sd=>FUT()?(sd==='buy'?'LONG':'SHORT'):'MUA';
function evalOpp(t,ents,ord){
  const R={};ord.forEach((tf,i)=>{const fc=ents[i].A.fc;R[tf]={dir:fc.dir,pct:fc.pct,norm:fc.bias/fc.max};});
  const v=mv(R),ready=rdy(v),e15=ents[ord.indexOf('15m')]||ents[ents.length-1],C15=e15.C,P=C15[C15.length-1].c;
  const o={sym:t.sym,price:P,chg:t.chg,v,ready,demo:ents.some(e=>e.demo)};
  if(ready){try{const em={};ord.forEach((tf,i)=>{em[tf]=ents[i];});const a=mtfAnchor(ord,em,192,true,v.side,FUT());if(a){o.a=a;o.q=sigStatus(a,P);}}catch(e){}}
  return o;
}
function oppRow(r){
  const base=r.sym.replace('USDT',''),a=r.a,q=r.q,buy=r.v.side==='buy',cls=buy?'buy':'sell';
  const chg=r.chg==null||!isFinite(r.chg)?'':`<span class="${r.chg>=0?'up':'dn'}">${r.chg>=0?'+':''}${r.chg.toFixed(1)}%</span>`;
  const P=r.price,risk=Math.abs(a.E0-a.sl),slp=Math.abs(P-a.sl)/P*100,tpp=Math.abs(a.tp-P)/P*100;
  const mid=`<span class="pill ${cls}">${r.v.txt}</span> <span class="mut">điểm ${r.v.score>0?'+':''}${Math.round(r.v.score*100)}</span>
    <div class="kv" style="margin-top:6px"><span>Cắt lỗ</span><b class="dn">${fmt(a.sl)} (−${slp.toFixed(2)}%)</b><span>Chốt lời</span><b class="up">${fmt(a.tp)} (+${tpp.toFixed(2)}%)</b><span>R:R còn lại</span><b>1:${q.rrLeft.toFixed(2)}</b></div>`;
  const right=q.st==='ok'?`<b class="up">Vào được ngay</b><div class="mut">quanh ${fmt(P)}, không đuổi quá ${fmt(q.maxEntry)}</div>`
    :`<b style="color:#7A5300">Đặt lệnh chờ ${fmt(q.limitPx)}</b><div class="mut">giá đã chạy ${q.m.toFixed(2)}R, vào ngay chỉ còn 1:${q.rrLeft.toFixed(2)}</div>`;
  return `<button class="row" data-sym="${r.sym}"><div class="sym"><b>${base}</b><span class="mut">/USDT</span><div>${fmt(P)} ${chg}</div></div><div>${mid}</div><div>${right}</div></button>`;
}
function renderScan(){
  const rows=S.scan.slice(),info=$('scanInfo');
  const has=r=>r.ready&&r.a&&r.q;
  const good=rows.filter(r=>has(r)&&r.q.st==='ok').sort((a,b)=>Math.abs(b.v.score)-Math.abs(a.v.score));
  const late=rows.filter(r=>has(r)&&r.q.st==='late').sort((a,b)=>b.q.rrLeft-a.q.rrLeft);
  const dead=rows.filter(r=>has(r)&&!['ok','late'].includes(r.q.st)).length;
  const watch=rows.filter(r=>!r.ready&&r.v.side).sort((a,b)=>Math.abs(b.v.score)-Math.abs(a.v.score));
  if(info){const d=new Date(S.scanAt||Date.now());info.textContent=(S.scanning?'Đang quét… ':'')+`Quét ${rows.length} mã lúc ${pad(d.getHours())}:${pad(d.getMinutes())}, tự quét lại mỗi 3 phút khi để tab này mở`;}
  let h='';
  const sec=(t,n,body)=>`<div style="padding:10px 16px 4px;font-weight:700;background:#EEF2F5;border-bottom:1px solid var(--line)">${t} <span class="mut" style="font-weight:500">(${n})</span></div>${body}`;
  if(good.length) h+=sec(`Có điểm ${FUT()?'LONG/SHORT':'MUA'}, vào được ngay`,good.length,good.map(oppRow).join(''));
  if(late.length) h+=sec('Đã có tín hiệu nhưng giá chạy rồi, nên đặt lệnh chờ',late.length,late.map(oppRow).join(''));
  if(watch.length) h+=sec('Sắp có điểm vào (đã nghiêng hướng, chờ 15m hoặc MA xác nhận)',watch.length,watch.map(r=>`<button class="row" data-sym="${r.sym}" style="min-height:54px"><div class="sym"><b>${r.sym.replace('USDT','')}</b><span class="mut">/USDT</span></div><div><span class="pill ${r.v.side==='buy'?'buy':'sell'}">${r.v.txt}</span></div><div class="mut" style="font-size:13px">${r.v.why}</div></button>`).join(''));
  if(!h) h=`<div class="empty">${S.scanning?'Đang quét…':'Hiện chưa có mã nào đủ điều kiện.'}</div>`;
  if(dead&&!S.scanning) h+=`<div class="note" style="padding:10px 16px">Đã ẩn ${dead} mã có tín hiệu nhưng đã trễ hoặc hết hiệu lực (R:R còn lại dưới 1:1 hoặc đã chạm cắt lỗ/chốt lời).</div>`;
  $('rows').innerHTML=h;
}
async function runScan(){
  if(S.scanning) return;
  const mk=S.mkt,tok=++S.scanTok;
  S.scanning=true;S.scan=[];S.scannedTf=S.tf;S.scanAt=Date.now();
  const pg=$('prog');pg.hidden=false;pg.firstElementChild.style.width='2%';
  $('rows').innerHTML='<div class="empty">Đang quét các mã lớn nhất…</div>';
  const list=await loadTop(25,mk),ord=mtfOf(mk);let done=0;const q=list.slice();
  if(tok!==S.scanTok) return;
  const worker=async()=>{
    while(q.length){
      const t=q.shift();
      if(tok!==S.scanTok) return;
      try{
        const ents=await Promise.all(ord.map(tf=>load(t.sym,tf,mk)));
        if(tok!==S.scanTok) return;
        S.scan.push(evalOpp(t,ents,ord));
      }catch(err){}
      done++;pg.firstElementChild.style.width=Math.round(done/list.length*100)+'%';renderScan();
    }
  };
  await Promise.all(Array.from({length:4},worker));
  if(tok!==S.scanTok) return;
  S.scanning=false;pg.hidden=true;S.scanAt=Date.now();
  // báo khi có mã mới đủ điều kiện vào ngay
  const keys=S.scan.filter(r=>r.ready&&r.a&&r.q&&r.q.st==='ok').map(r=>r.sym+'|'+r.v.side),old=S.oppKeys[mk];
  if(old) for(const r of S.scan) if(r.ready&&r.a&&r.q&&r.q.st==='ok'&&!old.includes(r.sym+'|'+r.v.side)){
    const msg=r.sym.replace('USDT','')+': có điểm '+sideLbl(r.v.side)+' mới (R:R còn lại 1:'+r.q.rrLeft.toFixed(2)+')';
    toast(msg,r.v.side);
    try{if('Notification' in window&&Notification.permission==='granted') new Notification('Trạm tín hiệu coin',{body:msg});}catch(e){}
  }
  S.oppKeys[mk]=keys;
  renderScan();updateSrc();
}

/* ---------- điều khiển ---------- */
function updateSrc(){
  const e=S.cur,demo=e?e.demo:false,s=$('src');
  const nm=MKT[S.mkt].src;s.textContent=!e?'Đang tải…':demo?'Dữ liệu mô phỏng':RT.ok?nm+' · Realtime':RT.poll?nm+' · làm mới 4 giây':'Dữ liệu '+nm;
  s.className='src '+(!e?'':demo?'demo':'live');
  $('banner').hidden=!demo;
  $('errWhy').textContent=demo&&e.err?' ('+e.err+')':'';
}
function resetView(){
  const n=S.cur.C.length;V.barW=9;V.end=n-1+16;
}
function centerOn(i){
  const plotW=$('wrap').clientWidth-66;V.end=i+plotW/V.barW*0.35;
}
async function showChart(){
  const sym=S.sym;
  $('symIn').value=sym;S.cur=null;draw();updateSrc();
  try{
    const e=await load(sym,S.tf);
    if(sym!==S.sym) return;
    S.cur=e;S.selBar=null;S.selEw=null;
    S.selSig=e.A.signals.length?e.A.signals[e.A.signals.length-1]:null;
    resetView();
  }catch(err){
    const stk=S.mkt!=='coin';
    $('aside').innerHTML=err&&err.bad
      ?`<div class="card"><h3>Không tìm thấy ${stk?'hợp đồng':'cặp'} ${sym}</h3><p class="note">${stk?'Hãy nhập đúng mã hợp đồng cổ phiếu trên Binance Futures, ví dụ TSLAUSDT hoặc NVDAUSDT.':S.mkt==='bstock'?'Hãy nhập đúng mã hợp đồng trên Bybit TradFi, ví dụ TSLA, XAU (vàng) hoặc CL (dầu thô).':S.mkt==='fx'?'Hãy nhập đúng mã hợp đồng forex trên Bybit, ví dụ EURUSD, GBPUSD hoặc USDJPY.':'Hãy nhập đúng mã trên Binance, ví dụ BTCUSDT hoặc SOLUSDT.'}</p></div>`
      :`<div class="card"><h3>Không tải được dữ liệu ${MKT[S.mkt].src}</h3><p class="note">${(err&&err.message)||'lỗi mạng'}. Bấm Làm mới để thử lại. Nếu lỗi lặp lại, có thể mạng của bạn đang bị chặn tới ${MKT[S.mkt].hosts[0].replace('https://','')}.</p></div>`;
    S.cur=null;draw();return;
  }
  if(S.cur.demo) rtStop(); else rtStart(sym);
  stamp();updateSrc();renderAside();draw();
}
/* ---------- Chuyển thị trường: Coin (Binance Spot) và Cổ phiếu (Binance Futures) tách hoàn toàn dữ liệu, cache và kết nối ---------- */
const MK_KEYS=['sym','scan','scannedTf','hits','selSig','selBar','selEw','cur','mtfBt','mtfClosed','mtfLive','lastV'];
function applyMarket(m){
  const sv={};for(const k of MK_KEYS) sv[k]=S[k];
  S.saved[S.mkt]=sv;
  S.scanTok++;S.scanning=false;rtStop();RT.sym=null;S.live={};
  S.mkt=m;
  const nx=S.saved[m]||{sym:MKT[m].def,scan:[],scannedTf:null,hits:[],selSig:null,selBar:null,selEw:null,cur:null,mtfBt:null,mtfClosed:null,mtfLive:null,lastV:{}};
  for(const k of MK_KEYS) S[k]=nx[k];
  $('mkCoin').setAttribute('aria-selected',m==='coin');$('mkStock').setAttribute('aria-selected',m==='stock');$('mkFx').setAttribute('aria-selected',m==='fx');$('mkBstock').setAttribute('aria-selected',m==='bstock');
  $('symIn').setAttribute('aria-label',m==='stock'?'Mã hợp đồng cổ phiếu':m==='bstock'?'Mã hợp đồng Bybit TradFi':m==='fx'?'Cặp forex':'Cặp coin');
  globalThis.__fx=(m==='fx');globalThis.__fee=MKT[m].fee;
  const tl=MKT[m].tfs||Object.keys(TFS);if(!tl.includes(S.tf)) S.tf='4h';
  tfButtons($('tfChart'));tfButtons($('tfScan'));
  try{localStorage.setItem('mkt',m);}catch(e){}
}
function switchMarket(m){
  if(m===S.mkt) return;
  applyMarket(m);
  loadTop(25);
  if(S.tab==='chart') showChart();
  else if(S.tab==='fwd') renderFwd();
  else if(S.scan.length&&S.scannedTf===S.tf) renderScan();
  else runScan();
}
function stamp(){const d=new Date();$('upd').textContent='Cập nhật '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());}
/* Làm mới nhanh: chỉ tải ~10 nến mới nhất rồi ghép vào dữ liệu đã có, không tải lại 1000 nến */
async function refreshCur(){
  const e=S.cur;
  if(e&&!e.demo){
    try{
      const raw=await getJSON(klPath(S.mkt,e.sym,e.tf,10));
      const m=new Map(e.C.map(k=>[k.t,k]));
      for(const o of klParse(S.mkt,raw,e.tf)){if(o.ct<=Date.now()) m.set(o.t,o);}
      const C=[...m.values()].sort((a,b)=>a.t-b.t).slice(-1000);
      const ent={sym:e.sym,tf:e.tf,C,A:analyze(C),t:Date.now(),demo:false,err:''};
      S.cache.set(e.sym+'|'+e.tf,ent);S.cur=ent;for(const k of Object.keys(TFS)) if(k!==e.tf) S.cache.delete(e.sym+'|'+k);
      S.selSig=ent.A.signals.length?ent.A.signals[ent.A.signals.length-1]:null;
      stamp();updateSrc();renderAside();draw();return;
    }catch(err){}
  }
  S.cache.clear();await showChart();
}
async function refreshNow(){
  const b=$('refresh');if(b.classList.contains('busy')) return;
  b.classList.add('busy');b.textContent='Đang làm mới…';netReset();
  try{
    if(S.tab==='fwd'){await loadFwd();stamp();}
    else if(S.tab==='scan'){S.cache.clear();S.scan=[];S.top=null;await runScan();stamp();}
    else await refreshCur();
  }finally{b.classList.remove('busy');b.textContent='⟳ Làm mới';}
}
function setTab(t){
  S.tab=t;
  $('viewChart').hidden=t!=='chart';$('viewScan').hidden=t!=='scan';$('viewFwd').hidden=t!=='fwd';$('viewPos').hidden=t!=='pos';$('tabPos').setAttribute('aria-selected',t==='pos');$('viewSr').hidden=t!=='sr';$('tabSr').setAttribute('aria-selected',t==='sr');
  $('tabChart').setAttribute('aria-selected',t==='chart');$('tabScan').setAttribute('aria-selected',t==='scan');$('tabFwd').setAttribute('aria-selected',t==='fwd');
  if(t==='fwd') loadFwd();
  if(t==='pos'){renderPosForm();renderPos();posRefresh();}
  if(t==='sr'){if(S.srMk!==S.mkt){S.srTok++;S.srBusy=false;S.srRows=[];}renderSr();if(!S.srBusy&&(!S.srRows.length||Date.now()-S.srAt>180000)) runSr();}
  if(t==='chart') requestAnimationFrame(draw);
  if(t==='scan'&&(!S.scan.length||S.scannedTf!==S.tf||Date.now()-(S.scanAt||0)>180000)&&!S.scanning) runScan();
}
function tfButtons(host){
  host.innerHTML=(MKT[S.mkt].tfs||Object.keys(TFS)).map(k=>`<button class="chip" data-tf="${k}" aria-pressed="${k===S.tf}">${k}</button>`).join(' ');
}
function setTf(tf){
  if(tf===S.tf) return;
  S.tf=tf;tfButtons($('tfChart'));tfButtons($('tfScan'));
  if(S.tab==='chart') showChart(); else if(S.tab==='scan') runScan();
}
const FT_LIST=Indicators.toggles();   // lấy từ các file trong js/indicators/
function buildFt(){
  $('ftBar').innerHTML='<span class="mut" style="font-size:13px">Bổ trợ (bật/tắt, tính vào điểm):</span>'+FT_LIST.map(([k,t])=>`<button class="chip sm" data-ft="${k}" aria-pressed="${!!S.ft[k]}">${t}</button>`).join('');
}
function reAll(){
  for(const mk in S.caches) for(const ent of S.caches[mk].values()){try{ent.A=analyze(ent.C);}catch(e){}}
  S.selSig=null;S.lastV={};S.mtfLive=null;S.mtfBt=null;S.cmpBt=null;S.anchor=null;for(const m in S.saved) if(S.saved[m]) S.saved[m].mtfBt=null;
  S.scan=[];S.scannedTf=null;
  if(S.tab==='scan') runScan();
  if(S.cur){renderAside();draw();}
}
function toggleFt(k,b){
  S.ft[k]=S.ft[k]?0:1;b.setAttribute('aria-pressed',!!S.ft[k]);
  globalThis.__ft=S.ft;try{localStorage.setItem('ft',JSON.stringify(S.ft));}catch(e){}
  reAll();
}
const RRT=[1.5,2,3],RRM=[1.5,2];
function buildSet(){
  $('setBar').innerHTML='<span class="mut" style="font-size:13px">Chốt lời</span>'+RRT.map(v=>`<button class="chip sm" data-rrt="${v}" aria-pressed="${S.rrT===v}">1:${v}</button>`).join('')
   +'<span class="sep"></span><span class="mut" style="font-size:13px">R:R còn lại tối thiểu để vào lệnh</span>'+RRM.map(v=>`<button class="chip sm" data-minrr="${v}" aria-pressed="${S.minRR===v}">1:${v}</button>`).join('');
}
function setRR(kind,v){
  if(kind==='rrT') S.rrT=v; else S.minRR=v;
  globalThis.__rrT=S.rrT;globalThis.__minRR=S.minRR;
  try{localStorage.setItem('rr',JSON.stringify({rrT:S.rrT,minRR:S.minRR}));}catch(e){}
  buildSet();reAll();
}
function buildLayers(){
  $('layers').innerHTML=LAYERS.map(([k,t])=>`<button class="chip sm" data-layer="${k}" aria-pressed="${!!S.L[k]}">${t}</button>`).join('');
}

/* tương tác trên biểu đồ */
function bindChart(){
  const cv=$('cv'),ptrs=new Map();let drag=null,pinch=null,down=null;
  const pos=e=>{const r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  cv.addEventListener('pointerdown',e=>{
    cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,pos(e));
    if(ptrs.size===1){const p=pos(e);drag={x:p.x,end:V.end};down={x:p.x,y:p.y,t:Date.now(),moved:0};}
    else if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,bw:V.barW};drag=null;down=null;}
  });
  cv.addEventListener('pointermove',e=>{
    if(!ptrs.has(e.pointerId)) return;
    const p=pos(e);ptrs.set(e.pointerId,p);
    if(ptrs.size===2&&pinch){const [a,b]=[...ptrs.values()];V.barW=cl(pinch.bw*Math.hypot(a.x-b.x,a.y-b.y)/pinch.d,3,32);}
    else if(drag){V.end=drag.end-(p.x-drag.x)/V.barW;if(down)down.moved=Math.max(down.moved,Math.abs(p.x-down.x)+Math.abs(p.y-down.y));}
    draw();
  });
  const up=e=>{
    const had=ptrs.delete(e.pointerId);
    if(had&&down&&down.moved<8&&Date.now()-down.t<600) tap(down.x,down.y);
    if(ptrs.size<2) pinch=null;
    if(ptrs.size===0){drag=null;down=null;} else if(ptrs.size===1){const p=[...ptrs.values()][0];drag={x:p.x,end:V.end};down=null;}
  };
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',e=>{ptrs.delete(e.pointerId);pinch=null;drag=null;down=null;});
  cv.addEventListener('wheel',e=>{e.preventDefault();V.barW=cl(V.barW*(e.deltaY<0?1.12:0.89),3,32);draw();},{passive:false});
  cv.addEventListener('dblclick',()=>{if(S.cur){resetView();draw();}});
  $('zIn').onclick=()=>{V.barW=cl(V.barW*1.25,3,32);draw();};
  $('zOut').onclick=()=>{V.barW=cl(V.barW*0.8,3,32);draw();};
}
function tap(px,py_){
  if(!S.cur) return;
  let best=null,bd=30;
  for(const h of S.hits){const d=Math.hypot(h.x-px,h.y-py_);if(d<bd){bd=d;best=h;}}
  if(best){S.selSig=best.s;S.selBar=best.s.i;renderAside();draw();return;}
  const plotW=$('wrap').clientWidth-66;
  if(px>plotW) return;
  const n=S.cur.C.length;
  S.selBar=cl(Math.round(V.end+0.5-(plotW-px)/V.barW),0,n-1);
  draw();
}

function init(){
  posLoad();
  try{const f=JSON.parse(localStorage.getItem('ft')||'null');if(f) Object.assign(S.ft,f);}catch(e){}
  try{const q=JSON.parse(localStorage.getItem('rr')||'null');if(q){if(RRT.includes(q.rrT)) S.rrT=q.rrT;if(RRM.includes(q.minRR)) S.minRR=q.minRR;}}catch(e){}
  globalThis.__ft=S.ft;globalThis.__rrT=S.rrT;globalThis.__minRR=S.minRR;
  tfButtons($('tfChart'));tfButtons($('tfScan'));buildLayers();buildFt();buildSet();bindChart();
  $('tabChart').onclick=()=>setTab('chart');$('tabScan').onclick=()=>setTab('scan');
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b) return;
    if(b.dataset.tf){setTf(b.dataset.tf);}
    else if(b.dataset.layer){const k=b.dataset.layer;S.L[k]=S.L[k]?0:1;b.setAttribute('aria-pressed',!!S.L[k]);draw();}
    else if(b.dataset.ft){toggleFt(b.dataset.ft,b);}
    else if(b.dataset.rrt){setRR('rrT',+b.dataset.rrt);}
    else if(b.dataset.minrr){setRR('minRR',+b.dataset.minrr);}
    else if(b.dataset.sig){const s=S.cur.A.signals.find(x=>x.i===+b.dataset.sig);if(s){S.selSig=s;S.selBar=s.i;centerOn(s.i);renderAside();draw();}}
    else if(b.dataset.sym){S.sym=b.dataset.sym;setTab('chart');showChart();}
    else if(b.dataset.f){S.filter=b.dataset.f;document.querySelectorAll('[data-f]').forEach(x=>x.setAttribute('aria-pressed',x===b));renderScan();}
  });
  const setMode=m=>{
    if(m===S.mode) return;
    S.mode=m;try{localStorage.setItem('mode',m);}catch(e){}
    $('modeSpot').setAttribute('aria-selected',m==='spot');$('modeFut').setAttribute('aria-selected',m==='fut');
    S.lastV={};S.mtfLive=null;S.mtfBt=null;S.anchor=null;for(const k in S.saved) if(S.saved[k]) S.saved[k].mtfBt=null;
    const f1=document.querySelector('[data-f="buy"]'),f2=document.querySelector('[data-f="sell"]');
    if(f1) f1.textContent=m==='fut'?'Nghiêng LONG':'Dự báo tăng'; if(f2) f2.textContent=m==='fut'?'Nghiêng SHORT':'Dự báo giảm';
    if(S.tab==='scan') renderScan();
    if(S.cur){renderAside();draw();}
  };
  $('modeSpot').onclick=()=>setMode('spot');$('modeFut').onclick=()=>setMode('fut');
  try{if(localStorage.getItem('mode')==='fut') setMode('fut');}catch(e){}
  $('refresh').onclick=refreshNow;
  $('retry').onclick=()=>{netReset();S.cache.clear();S.scan=[];S.scannedTf=null;showChart();if(S.tab==='scan')runScan();};
  $('rescan').onclick=()=>{S.cache.clear();S.scan=[];runScan();};
  const go=()=>{let s=$('symIn').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!s)return;if(S.mkt!=='coin'){if(!/(USDT|USDC)$/.test(s))s+='USDT';}else if(!/.{2,}(USDT|USDC|BTC|ETH|FDUSD)$/.test(s))s+='USDT';S.sym=s;showChart();};
  $('symGo').onclick=go;$('symIn').addEventListener('keydown',e=>{if(e.key==='Enter')go();});
  window.addEventListener('resize',draw);
  if(window.ResizeObserver) new ResizeObserver(()=>draw()).observe($('wrap'));
  try{const c=JSON.parse(localStorage.getItem('calc')||'null');if(c&&c.cap>0) S.calc=Object.assign(S.calc,c);}catch(e){}
  $('tabFwd').onclick=()=>setTab('fwd');$('fwdReload').onclick=()=>loadFwd();
  $('tabPos').onclick=()=>setTab('pos');
  $('tabSr').onclick=()=>setTab('sr');$('srRescan').onclick=()=>{S.srCache={};S.srBusy=false;S.srTok++;runSr();};
  document.addEventListener('click',srClick);
  setInterval(()=>{if(S.tab==='sr'&&!document.hidden&&!S.srBusy&&Date.now()-S.srAt>180000) runSr();},30000);
  document.addEventListener('click',posClick);
  document.addEventListener('input',posInput);
  setInterval(()=>{if(document.hidden||!POS.some(p=>p.st==='open')) return;posRefresh();},60000);
  $('mkCoin').onclick=()=>switchMarket('coin');$('mkStock').onclick=()=>switchMarket('stock');$('mkFx').onclick=()=>switchMarket('fx');$('mkBstock').onclick=()=>switchMarket('bstock');
  {let m0='coin';try{const h=(typeof location!=='undefined'&&location.hash||'').slice(1);m0=MKT[h]?h:(MKT[localStorage.getItem('mkt')]?localStorage.getItem('mkt'):'coin');}catch(e){}
   if(m0!=='coin') applyMarket(m0); else {globalThis.__fx=false;globalThis.__fee=MKT.coin.fee;}}
  setInterval(()=>{
    if(document.hidden||!S.cur||S.cur.demo) return;
    if(RT.dirty&&S.tab==='chart'){RT.dirty=false;draw();stamp();paintValid();}
    if(Date.now()-RT.provAt>8000&&(RT.ok||RT.poll)){RT.provAt=Date.now();provMTF();}
  },500);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&S.cur&&!S.cur.demo&&Date.now()-RT.lastMsg>10000){const sy=S.sym;rtStop();RT.sym=null;rtStart(sy);}
  });
  setInterval(()=>{if(document.hidden||S.tab!=='scan'||S.scanning) return;if(Date.now()-(S.scanAt||0)>180000) runScan();},15000);
  loadTop(25);
  showChart();
  if(POS.some(p=>p.st==='open')) setTimeout(posRefresh,3000);
}
window.__app={btCmp,runCmp,posAdvise,posEval,POS:()=>POS,paintValid,S,V,draw,load,runScan,showChart,renderAside,renderScan,tap};
init();
})();
