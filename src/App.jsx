import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const C = {
  bg:"#F7F5F2", surface:"#FFFFFF", border:"#E8E3DC",
  ink:"#1C1A18", sub:"#6B6560", muted:"#A09890",
  mint:"#3D8B7A", mintLight:"#EAF4F1",
  rose:"#C45C7A", roseLight:"#FCEEF3",
  amber:"#D4852A", amberLight:"#FDF3E7",
  violet:"#7B5EA7", violetLight:"#F2EEF8",
  sky:"#3A78B5", skyLight:"#EAF2FA",
  brown:"#8B6914", brownLight:"#FDF6E3",
};

// ── helpers ────────────────────────────────────────────────
function today() {
  return new Date().toLocaleDateString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit"}).replace(/\//g,"-");
}
function timeNow() {
  return new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
}
function prevDay(d) {
  const dt=new Date(d); dt.setDate(dt.getDate()-1);
  return dt.toLocaleDateString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit"}).replace(/\//g,"-");
}
function calcStreak(records) {
  const days=[...new Set(records.map(r=>r.date))].sort().reverse();
  if(!days.length) return 0;
  const td=today();
  if(days[0]!==td && days[0]!==prevDay(td)) return 0;
  let streak=1,cur=days[0];
  for(let i=1;i<days.length;i++){
    if(days[i]===prevDay(cur)){streak++;cur=days[i];}else break;
  }
  return streak;
}
// score helpers
const COND_SCORE={"とても良い":5,"良い":4,"普通":3,"悪い":2,"つらい":1};
const SLEEP_SCORE={"ぐっすり":4,"まあまあ":3,"浅かった":2,"眠れなかった":1};
function condScore(v){return COND_SCORE[v]||null;}
function sleepScore(v){return SLEEP_SCORE[v]||null;}
function sleepHours(bedtime,wakeup){
  if(!bedtime||!wakeup) return null;
  const[bh,bm]=bedtime.split(":").map(Number);
  const[wh,wm]=wakeup.split(":").map(Number);
  let diff=(wh*60+wm)-(bh*60+bm);
  if(diff<0) diff+=1440;
  return Math.round(diff/60*10)/10;
}

// ── period cycle calculator ────────────────────────────────
function calcCycle(records){
  const starts=records.filter(r=>r.cat==="period"&&r.fields.periodType==="開始").map(r=>r.date).sort();
  if(!starts.length) return null;
  const lastStart=starts[starts.length-1];
  let avgCycle=28;
  if(starts.length>=2){
    const diffs=[];
    for(let i=1;i<starts.length;i++){
      const diff=(new Date(starts[i])-new Date(starts[i-1]))/86400000;
      if(diff>0&&diff<60) diffs.push(diff);
    }
    if(diffs.length>0) avgCycle=Math.round(diffs.reduce((a,b)=>a+b,0)/diffs.length);
  }
  const lastStartDate=new Date(lastStart);
  const nextPeriod=new Date(lastStartDate); nextPeriod.setDate(nextPeriod.getDate()+avgCycle);
  const ovulation=new Date(nextPeriod); ovulation.setDate(ovulation.getDate()-14);
  const fertileFrom=new Date(ovulation); fertileFrom.setDate(fertileFrom.getDate()-2);
  const fertileTo=new Date(ovulation); fertileTo.setDate(fertileTo.getDate()+2);
  const fmt=d=>d.toLocaleDateString("ja-JP",{month:"long",day:"numeric"});
  const daysUntil=d=>Math.round((d-new Date())/86400000);
  return{avgCycle,lastStart,nextPeriod,ovulation,fertileFrom,fertileTo,fmt,daysUntil,cycleCount:starts.length};
}

const DETAIL_CATS={
  weight:{label:"体重",icon:"⚖",color:C.sky,light:C.skyLight},
  meal:{label:"食事",icon:"🍽",color:C.amber,light:C.amberLight},
  exercise:{label:"運動",icon:"🏃",color:C.mint,light:C.mintLight},
  sleep:{label:"睡眠",icon:"🌙",color:C.violet,light:C.violetLight},
  condition:{label:"体調",icon:"❤",color:C.rose,light:C.roseLight},
  period:{label:"月経",icon:"🌸",color:C.rose,light:C.roseLight},
  bowel:{label:"お通じ",icon:"💩",color:C.brown,light:C.brownLight},
};

const QUICK=[
  {cat:"condition",label:"体調",icon:"❤",color:C.rose,light:C.roseLight,
   question:"今日の体調は？",
   options:[{value:"とても良い",emoji:"😄"},{value:"良い",emoji:"🙂"},{value:"普通",emoji:"😐"},{value:"悪い",emoji:"😔"},{value:"つらい",emoji:"🤒"}],
   toFields:v=>({overall:v})},
  {cat:"sleep",label:"睡眠の質",icon:"🌙",color:C.violet,light:C.violetLight,
   question:"昨夜の眠りは？",
   options:[{value:"ぐっすり",emoji:"😴"},{value:"まあまあ",emoji:"🙂"},{value:"浅かった",emoji:"😪"},{value:"眠れなかった",emoji:"😩"}],
   toFields:v=>({quality:v})},
  {cat:"bowel",label:"お通じ",icon:"💩",color:C.brown,light:C.brownLight,
   question:"今日のお通じは？",
   options:[{value:"出た",emoji:"✅"},{value:"少し出た",emoji:"🔸"},{value:"出なかった",emoji:"❌"}],
   toFields:v=>({bowelResult:v})},
  {cat:"exercise",label:"運動",icon:"🏃",color:C.mint,light:C.mintLight,
   question:"今日は動いた？",
   options:[{value:"しっかり運動",emoji:"💪"},{value:"少し歩いた",emoji:"🚶"},{value:"ほぼ動いてない",emoji:"🛋"}],
   toFields:v=>({exType:v,duration:v==="しっかり運動"?"30":v==="少し歩いた"?"15":"0"})},
];

// ── UI atoms ───────────────────────────────────────────────
function Card({children,style}){
  return (
    <div style={{background:C.surface,borderRadius:16,border:`1px solid ${C.border}`,padding:16,...style}}>{children}</div>
  );
}
function Inp({label,value,onChange,type="text",placeholder,unit}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      {label&&<label style={{fontSize:11,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</label>}
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          style={{flex:1,padding:"9px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,background:C.bg,fontSize:14,color:C.ink,outline:"none"}}/>
        {unit&&<span style={{fontSize:13,color:C.sub}}>{unit}</span>}
      </div>
    </div>
  );
}
function Sel({label,value,onChange,options}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      {label&&<label style={{fontSize:11,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{padding:"9px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,background:C.bg,fontSize:14,color:C.ink,outline:"none"}}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
function SectionTitle({children}){
  return (
    <p style={{margin:"0 0 10px",fontSize:12,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:"0.06em"}}>{children}</p>
  );
}

// ── Quick Record ───────────────────────────────────────────
function QuickRecord({records,onSave}){
  const todayRecs=records.filter(r=>r.date===today());
  const[expanded,setExpanded]=useState(null);
  function tap(q,v){onSave({id:Date.now(),cat:q.cat,fields:q.toFields(v),note:"",date:today(),time:timeNow(),quick:true});}
  function done(cat){return todayRecs.some(r=>r.cat===cat&&r.quick);}
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {QUICK.map(q=>{
        const isDone=done(q.cat),isOpen=expanded===q.cat;
        return(
          <Card key={q.cat} style={{padding:0,overflow:"hidden",border:isDone?`1.5px solid ${q.color}`:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:isDone?q.light:C.surface,cursor:isDone?"default":"pointer"}}
              onClick={()=>!isDone&&setExpanded(isOpen?null:q.cat)}>
              <span style={{fontSize:22}}>{q.icon}</span>
              <div style={{flex:1}}>
                <p style={{margin:0,fontSize:13,fontWeight:700,color:isDone?q.color:C.ink}}>{q.label}</p>
                <p style={{margin:0,fontSize:11,color:isDone?q.color:C.sub}}>{isDone?"✓ 記録済み":"タップして記録"}</p>
              </div>
              {!isDone&&<span style={{fontSize:18,color:C.muted}}>{isOpen?"▲":"▼"}</span>}
            </div>
            {isOpen&&!isDone&&(
              <div style={{padding:"0 16px 16px",display:"flex",flexDirection:"column",gap:10}}>
                <p style={{margin:"8px 0 4px",fontSize:13,color:C.sub}}>{q.question}</p>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {q.options.map(opt=>(
                    <button key={opt.value} onClick={()=>{tap(q,opt.value);setExpanded(null);}}
                      style={{flex:"1 0 auto",minWidth:80,padding:"12px 8px",borderRadius:12,border:`1.5px solid ${C.border}`,background:C.bg,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <span style={{fontSize:24}}>{opt.emoji}</span>
                      <span style={{fontSize:11,fontWeight:600,color:C.ink}}>{opt.value}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Detail Form ────────────────────────────────────────────
function DetailForm({onSave}){
  const[cat,setCat]=useState("weight");
  const[fields,setFields]=useState({});
  const[note,setNote]=useState("");
  const[saved,setSaved]=useState(false);
  const f=(k,v)=>setFields(p=>({...p,[k]:v}));
  const form = {
    weight: () => (
      <>
        <Inp label="体重" value={fields.weight||""} onChange={v=>f("weight",v)} type="number" placeholder="60.0" unit="kg"/>
        <Inp label="体脂肪率（任意）" value={fields.fat||""} onChange={v=>f("fat",v)} type="number" placeholder="25.0" unit="%"/>
        <Inp label="ウエスト（任意）" value={fields.waist||""} onChange={v=>f("waist",v)} type="number" placeholder="75" unit="cm"/>
      </>
    ),
    meal: () => (
      <>
        <Sel label="食事" value={fields.mealType||"朝食"} onChange={v=>f("mealType",v)} options={[{value:"朝食",label:"朝食"},{value:"昼食",label:"昼食"},{value:"夕食",label:"夕食"},{value:"間食",label:"間食"}]}/>
        <Inp label="カロリー（任意）" value={fields.calories||""} onChange={v=>f("calories",v)} type="number" placeholder="600" unit="kcal"/>
        <Inp label="食べたもの（任意）" value={fields.food||""} onChange={v=>f("food",v)} placeholder="ご飯、味噌汁…"/>
      </>
    ),
    exercise: () => (
      <>
        <Inp label="種類" value={fields.exType||""} onChange={v=>f("exType",v)} placeholder="ウォーキング…"/>
        <Inp label="時間" value={fields.duration||""} onChange={v=>f("duration",v)} type="number" placeholder="30" unit="分"/>
        <Inp label="消費カロリー（任意）" value={fields.burned||""} onChange={v=>f("burned",v)} type="number" placeholder="150" unit="kcal"/>
      </>
    ),
    sleep: () => (
      <>
        <Inp label="就寝" value={fields.bedtime||""} onChange={v=>f("bedtime",v)} type="time"/>
        <Inp label="起床" value={fields.wakeup||""} onChange={v=>f("wakeup",v)} type="time"/>
        <Sel label="睡眠の質" value={fields.quality||"普通"} onChange={v=>f("quality",v)} options={[{value:"ぐっすり",label:"😴 ぐっすり"},{value:"普通",label:"😶 普通"},{value:"浅かった",label:"😪 浅かった"},{value:"眠れなかった",label:"😩 眠れなかった"}]}/>
      </>
    ),
    condition: () => (
      <>
        <Sel label="体調" value={fields.overall||"普通"} onChange={v=>f("overall",v)} options={[{value:"とても良い",label:"😄 とても良い"},{value:"良い",label:"🙂 良い"},{value:"普通",label:"😐 普通"},{value:"悪い",label:"😔 悪い"},{value:"とても悪い",label:"🤒 とても悪い"}]}/>
        <Inp label="症状（任意）" value={fields.symptoms||""} onChange={v=>f("symptoms",v)} placeholder="頭痛、疲れ…"/>
        <Inp label="体温（任意）" value={fields.temp||""} onChange={v=>f("temp",v)} type="number" placeholder="36.5" unit="℃"/>
      </>
    ),
    period: () => (
      <>
        <Sel label="記録の種類" value={fields.periodType||"開始"} onChange={v=>f("periodType",v)} options={[{value:"開始",label:"🌸 開始"},{value:"終了",label:"✓ 終了"},{value:"経過中",label:"📍 経過中"}]}/>
        <Sel label="量" value={fields.flow||"普通"} onChange={v=>f("flow",v)} options={[{value:"多い",label:"多い"},{value:"普通",label:"普通"},{value:"少ない",label:"少ない"}]}/>
        <Inp label="症状（任意）" value={fields.pSymptoms||""} onChange={v=>f("pSymptoms",v)} placeholder="腹痛、腰痛…"/>
      </>
    ),
    bowel: () => (
      <>
        <Sel label="結果" value={fields.bowelResult||"出た"} onChange={v=>f("bowelResult",v)} options={[{value:"出た",label:"✅ 出た"},{value:"少し出た",label:"🔸 少し出た"},{value:"出なかった",label:"❌ 出なかった"}]}/>
        <Sel label="状態（任意）" value={fields.bowelType||""} onChange={v=>f("bowelType",v)} options={[{value:"",label:"— 選択しない —"},{value:"普通",label:"😊 普通"},{value:"やわらかい",label:"💧 やわらかい"},{value:"かたい",label:"🪨 かたい"},{value:"下痢気味",label:"⚡下痢気味"}]}/>
      </>
    ),
  };
  const canSave=()=>{
    if(cat==="weight") return!!fields.weight;
    if(cat==="exercise") return!!fields.exType;
    if(cat==="sleep") return!!(fields.bedtime||fields.wakeup);
    return true;
  };
  function handleSave(){
    onSave({id:Date.now(),cat,fields,note,date:today(),time:timeNow(),quick:false});
    setFields({});setNote("");setSaved(true);setTimeout(()=>setSaved(false),2000);
  }
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {Object.entries(DETAIL_CATS).map(([id,m])=>(
          <button key={id} onClick={()=>{setCat(id);setFields({});}} style={{padding:"7px 13px",borderRadius:99,border:`1.5px solid ${cat===id?m.color:C.border}`,background:cat===id?m.light:C.bg,color:cat===id?m.color:C.sub,fontWeight:cat===id?700:500,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>{m.icon} {m.label}</button>
        ))}
      </div>
      <Card><div style={{display:"flex",flexDirection:"column",gap:12}}>{form[cat]()}<Inp label="メモ（任意）" value={note} onChange={setNote} placeholder="自由記入…"/></div></Card>
      <button onClick={handleSave} disabled={!canSave()} style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:canSave()?C.mint:C.border,color:"#fff",fontSize:15,fontWeight:700,cursor:canSave()?"pointer":"not-allowed"}}>
        {saved?"✓ 保存しました！":"保存する"}
      </button>
    </div>
  );
}

// ── RecordRow ──────────────────────────────────────────────
function RecordRow({r}){
  const m=DETAIL_CATS[r.cat],f=r.fields;
  const summary = (()=>{
    if(r.cat==="weight") return `${f.weight}kg${f.fat?` / 体脂肪${f.fat}%`:""}`;
    if(r.cat==="meal") return `${f.mealType||""}${f.calories?` ${f.calories}kcal`:""}${f.food?` — ${f.food}`:""}`;
    if(r.cat==="exercise") return `${f.exType} ${f.duration?f.duration+"分":""}`;
    if(r.cat==="sleep") return `${f.bedtime||""}〜${f.wakeup||""} ${f.quality||""}`;
    if(r.cat==="condition") return `${f.overall||""}${f.symptoms?` / ${f.symptoms}`:""}${f.temp?` ${f.temp}℃`:""}`;
    if(r.cat==="period") return `${f.periodType||""} / ${f.flow||""}`;
    if(r.cat==="bowel") return `${f.bowelResult||""}${f.bowelType?` (${f.bowelType})`:""}`
    return "";
  })();
  return(
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <div style={{width:34,height:34,borderRadius:10,background:m.light,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{m.icon}</div>
      <div style={{flex:1}}>
        <p style={{margin:0,fontSize:13,fontWeight:600,color:C.ink}}>{summary}</p>
        <p style={{margin:0,fontSize:11,color:C.muted}}>{r.time}{r.note?` — ${r.note}`:""}</p>
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────
function Dashboard({records}){
  const streak=calcStreak(records);
  const todayRecs=records.filter(r=>r.date===today());
  const latestWeight=[...records].reverse().find(r=>r.cat==="weight"&&r.fields.weight);
  const todayCal=todayRecs.filter(r=>r.cat==="meal"&&r.fields.calories).reduce((s,r)=>s+Number(r.fields.calories),0);
  const todayCond=todayRecs.find(r=>r.cat==="condition");
  const latestSleep=[...records].reverse().find(r=>r.cat==="sleep"&&r.fields.quality);
  const encouragement=streak===0?"今日から始めよう 🌱":streak===1?"いいスタート！明日も記録しよう ✨":streak<7?`${streak}日連続！このまま続けよう 🔥`:`${streak}日連続、すごい！習慣になってきた 🏆`;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:streak>0?"linear-gradient(135deg, #3D8B7A, #2d6b5c)":C.border,borderRadius:16,padding:"18px 20px",display:"flex",alignItems:"center",gap:16}}>
        <div style={{fontSize:40,lineHeight:1}}>{streak>0?"🔥":"🌱"}</div>
        <div>
          <p style={{margin:0,fontSize:28,fontWeight:900,color:"#fff",lineHeight:1}}>{streak}<span style={{fontSize:14,fontWeight:600}}> 日連続</span></p>
          <p style={{margin:"4px 0 0",fontSize:12,color:"rgba(255,255,255,0.85)"}}>{encouragement}</p>
        </div>
      </div>
      <Card>
        <SectionTitle>今日のサマリー</SectionTitle>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[{label:"体重",value:latestWeight?`${latestWeight.fields.weight}kg`:"—",icon:"⚖",color:C.sky},{label:"カロリー",value:todayCal?`${todayCal}kcal`:"—",icon:"🔥",color:C.amber},{label:"体調",value:todayCond?todayCond.fields.overall:"—",icon:"❤",color:C.rose},{label:"昨夜の睡眠",value:latestSleep?latestSleep.fields.quality:"—",icon:"🌙",color:C.violet}].map(s=>(
            <div key={s.label} style={{background:C.bg,borderRadius:12,padding:"12px 14px"}}>
              <p style={{margin:"0 0 2px",fontSize:11,color:C.sub}}>{s.icon} {s.label}</p>
              <p style={{margin:0,fontSize:16,fontWeight:800,color:s.color}}>{s.value}</p>
            </div>
          ))}
        </div>
      </Card>
      {todayRecs.length>0&&(
        <Card>
          <SectionTitle>今日の記録</SectionTitle>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[...todayRecs].reverse().map(r=><RecordRow key={r.id} r={r}/>)}
          </div>
        </Card>
      )}
      {records.length===0&&<div style={{textAlign:"center",padding:"32px 20px",color:C.sub}}><p style={{fontSize:36}}>📋</p><p style={{fontSize:14}}>「記録する」タブからスタートしよう！</p></div>}
    </div>
  );
}

// ── Insights Tab (Graph + Calendar + Trends) ───────────────
function InsightsTab({records}){
  const[view,setView]=useState("graph");
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",background:C.bg,borderRadius:12,padding:4,border:`1px solid ${C.border}`}}>
        {[{id:"graph",label:"📈 グラフ"},{id:"calendar",label:"📅 カレンダー"},{id:"trends",label:"🔍 傾向"}].map(m=>(
          <button key={m.id} onClick={()=>setView(m.id)} style={{flex:1,padding:"9px 4px",borderRadius:9,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:view===m.id?C.surface:"transparent",color:view===m.id?C.ink:C.sub,boxShadow:view===m.id?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>{m.label}</button>
        ))}
      </div>
      {view==="graph"&&<GraphView records={records}/>}
      {view==="calendar"&&<CalendarView records={records}/>}
      {view==="trends"&&<TrendsView records={records}/>}
    </div>
  );
}

// ── Graph View ─────────────────────────────────────────────
function GraphView({records}){
  const[metric,setMetric]=useState("sleep_cond");

  // build daily data map
  const byDate=useMemo(()=>{
    const m={};
    records.forEach(r=>{
      if(!m[r.date]) m[r.date]={date:r.date};
      const f=r.fields;
      if(r.cat==="condition"&&f.overall) m[r.date].cond=condScore(f.overall);
      if(r.cat==="sleep"){
        if(f.quality) m[r.date].sleepQ=sleepScore(f.quality);
        if(f.bedtime&&f.wakeup) m[r.date].sleepH=sleepHours(f.bedtime,f.wakeup);
      }
      if(r.cat==="weight"&&f.weight) m[r.date].weight=Number(f.weight);
      if(r.cat==="meal"&&f.calories) m[r.date].cal=(m[r.date].cal||0)+Number(f.calories);
    });
    return m;
  },[records]);

  const days=Object.keys(byDate).sort().slice(-30);
  const data=days.map(d=>({...byDate[d],label:d.slice(5).replace("-","/")}));

  const noData=data.length===0;

  const metrics={
    sleep_cond:{label:"睡眠の質 & 体調",lines:[{key:"sleepQ",name:"睡眠の質",color:C.violet},{key:"cond",name:"体調",color:C.rose}],domain:[0,5]},
    sleepH:{label:"睡眠時間（時間）",lines:[{key:"sleepH",name:"睡眠時間",color:C.violet}],domain:[0,12]},
    weight:{label:"体重（kg）",lines:[{key:"weight",name:"体重",color:C.sky}],domain:["auto","auto"]},
    cal:{label:"カロリー（kcal）",lines:[{key:"cal",name:"カロリー",color:C.amber}],domain:[0,"auto"]},
  };
  const cur=metrics[metric];

  const scoreLabel={1:"😩",2:"😪",3:"😐",4:"😊",5:"😄"};
  const CustomTick=({x,y,payload})=>(
    <text x={x} y={y+12} textAnchor="middle" fontSize={9} fill={C.muted}>{payload.value}</text>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {Object.entries(metrics).map(([id,m])=>(
          <button key={id} onClick={()=>setMetric(id)} style={{padding:"6px 12px",borderRadius:99,fontSize:12,fontWeight:600,cursor:"pointer",background:metric===id?C.ink:C.bg,color:metric===id?"#fff":C.sub,border:`1px solid ${metric===id?C.ink:C.border}`}}>{m.label}</button>
        ))}
      </div>
      {noData?(
        <Card style={{textAlign:"center",padding:40,color:C.sub}}>
          <p style={{fontSize:28}}>📈</p><p>記録が増えるとグラフが表示されます</p>
        </Card>
      ):(
        <Card style={{padding:"16px 8px 8px"}}>
          <p style={{margin:"0 0 12px 8px",fontSize:12,fontWeight:700,color:C.sub}}>{cur.label}（直近30日）</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{top:4,right:16,left:-20,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="label" tick={<CustomTick/>} interval="preserveStartEnd"/>
              <YAxis domain={cur.domain} tick={{fontSize:9,fill:C.muted}}/>
              <Tooltip contentStyle={{fontSize:12,borderRadius:8,border:`1px solid ${C.border}`}}
                formatter={(v,name)=>[metric==="sleep_cond"?`${v} (${scoreLabel[v]||v})`:v,name]}/>
              {cur.lines.length>1&&<Legend iconSize={10} wrapperStyle={{fontSize:11}}/>}
              {cur.lines.map(l=>(
                <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color}
                  strokeWidth={2} dot={{r:3,fill:l.color}} connectNulls activeDot={{r:5}}/>
              ))}
            </LineChart>
          </ResponsiveContainer>
          {metric==="sleep_cond"&&(
            <p style={{margin:"8px 8px 0",fontSize:10,color:C.muted}}>5=とても良い / 4=良い / 3=普通 / 2=悪い / 1=つらい・眠れなかった</p>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Calendar View ──────────────────────────────────────────
function CalendarView({records}){
  const now=new Date();
  const[year,setYear]=useState(now.getFullYear());
  const[month,setMonth]=useState(now.getMonth());

  const byDate=useMemo(()=>{
    const m={};
    records.forEach(r=>{
      if(!m[r.date]) m[r.date]={cats:new Set(),cond:null,sleepQ:null,period:false,bowel:null};
      m[r.date].cats.add(r.cat);
      if(r.cat==="condition"&&r.fields.overall) m[r.date].cond=r.fields.overall;
      if(r.cat==="sleep"&&r.fields.quality) m[r.date].sleepQ=r.fields.quality;
      if(r.cat==="period") m[r.date].period=true;
      if(r.cat==="bowel"&&r.fields.bowelResult) m[r.date].bowel=r.fields.bowelResult;
    });
    return m;
  },[records]);

  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const prevMonth=()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);};
  const nextMonth=()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);};

  const condColor=(c)=>({
    "とても良い":"#3D8B7A","良い":"#6aad9c","普通":"#A09890","悪い":"#c45c7a","つらい":"#9b2a49"
  }[c]||C.muted);

  const[selected,setSelected]=useState(null);

  function fmtDate(y,m,d){
    return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <Card style={{padding:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <button onClick={prevMonth} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:C.sub}}>‹</button>
          <p style={{margin:0,fontSize:15,fontWeight:800,color:C.ink}}>{year}年 {month+1}月</p>
          <button onClick={nextMonth} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:C.sub}}>›</button>
        </div>
        {/* weekday headers */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
          {["日","月","火","水","木","金","土"].map((d,i)=>(
            <div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:i===0?C.rose:i===6?C.sky:C.muted,padding:"2px 0"}}>{d}</div>
          ))}
        </div>
        {/* days grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {Array(firstDay).fill(null).map((_,i)=><div key={`e${i}`}/>)}
          {Array(daysInMonth).fill(null).map((_,i)=>{
            const d=i+1;
            const dateStr=fmtDate(year,month,d);
            const info=byDate[dateStr];
            const isToday=dateStr===today();
            const isSelected=selected===dateStr;
            const condC=info?.cond?condColor(info.cond):null;
            return(
              <div key={d} onClick={()=>setSelected(isSelected?null:dateStr)} style={{
                aspectRatio:"1",borderRadius:10,cursor:"pointer",
                background:isSelected?C.ink:isToday?C.mintLight:info?`${condC}18`:C.bg,
                border:`1.5px solid ${isSelected?C.ink:isToday?C.mint:info?condC:C.border}`,
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,
                padding:2,
              }}>
                <span style={{fontSize:11,fontWeight:isToday?800:600,color:isSelected?"#fff":isToday?C.mint:C.ink,lineHeight:1}}>{d}</span>
                {info&&(
                  <div style={{display:"flex",gap:1,flexWrap:"wrap",justifyContent:"center"}}>
                    {info.period&&<span style={{fontSize:7}}>🌸</span>}
                    {info.cats.has("sleep")&&<span style={{fontSize:7}}>🌙</span>}
                    {info.cats.has("exercise")&&<span style={{fontSize:7}}>🏃</span>}
                    {info.bowel==="出た"&&<span style={{fontSize:7}}>✅</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* legend */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
          {[["#3D8B7A","体調良好"],["#A09890","普通"],["#c45c7a","体調不良"]].map(([c,l])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:10,height:10,borderRadius:3,background:`${c}30`,border:`1.5px solid ${c}`}}/>
              <span style={{fontSize:10,color:C.sub}}>{l}</span>
            </div>
          ))}
        </div>
      </Card>
      {/* selected day detail */}
      {selected&&byDate[selected]&&(
        <Card style={{borderColor:C.mint}}>
          <p style={{margin:"0 0 10px",fontSize:13,fontWeight:700,color:C.ink}}>{selected} の記録</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {records.filter(r=>r.date===selected).map(r=><RecordRow key={r.id} r={r}/>)}
          </div>
        </Card>
      )}
      {selected&&!byDate[selected]&&(
        <Card><p style={{margin:0,fontSize:13,color:C.muted,textAlign:"center"}}>この日の記録はありません</p></Card>
      )}
    </div>
  );
}

// ── Trends View ────────────────────────────────────────────
function TrendsView({records}){
  const insights=useMemo(()=>{
    const results=[];
    const byDate={};
    records.forEach(r=>{
      if(!byDate[r.date]) byDate[r.date]={};
      const f=r.fields;
      if(r.cat==="condition"&&f.overall) byDate[r.date].cond=condScore(f.overall);
      if(r.cat==="sleep"){
        if(f.quality) byDate[r.date].sleepQ=sleepScore(f.quality);
        if(f.bedtime&&f.wakeup) byDate[r.date].sleepH=sleepHours(f.bedtime,f.wakeup);
      }
      if(r.cat==="bowel"&&f.bowelResult) byDate[r.date].bowel=f.bowelResult;
      if(r.cat==="exercise"&&f.exType) byDate[r.date].exercised=true;
      if(r.cat==="condition"&&f.symptoms) byDate[r.date].symptoms=(byDate[r.date].symptoms||[]).concat(f.symptoms.split(/[、,，]/));
    });

    const dates=Object.keys(byDate).sort();
    const avg=arr=>arr.length?Math.round(arr.reduce((a,b)=>a+b,0)/arr.length*10)/10:null;
    const scoreToLabel=s=>s>=4.5?"とても良い":s>=3.5?"良い":s>=2.5?"普通":s>=1.5?"悪い":"つらい";

    // ① 睡眠時間と体調の相関
    const shortSleep=[], goodSleep=[];
    dates.forEach(d=>{
      const h=byDate[d].sleepH, c=byDate[d].cond;
      if(h!=null&&c!=null){ if(h<6) shortSleep.push(c); else goodSleep.push(c); }
    });
    if(shortSleep.length>=2&&goodSleep.length>=2){
      const as=avg(shortSleep), ag=avg(goodSleep);
      if(ag-as>=0.5){
        results.push({icon:"🌙",color:C.violet,bg:C.violetLight,
          title:"睡眠時間と体調の関係",
          body:`睡眠6時間未満の日は体調スコアが平均 ${as}（${scoreToLabel(as)}）なのに対し、6時間以上の日は ${ag}（${scoreToLabel(ag)}）。睡眠が体調に影響している可能性があります。`,
          tip:"就寝時間を30分早めるだけで変わるかも！"});
      }
    }

    // ② 睡眠の質と翌日体調
    const afterBad=[], afterGood=[];
    for(let i=0;i<dates.length-1;i++){
      const cur=byDate[dates[i]], next=byDate[dates[i+1]];
      if(cur.sleepQ!=null&&next.cond!=null){
        if(cur.sleepQ<=2) afterBad.push(next.cond);
        else afterGood.push(next.cond);
      }
    }
    if(afterBad.length>=2&&afterGood.length>=2){
      const ab=avg(afterBad), ag=avg(afterGood);
      if(ag-ab>=0.5){
        results.push({icon:"😴",color:C.violet,bg:C.violetLight,
          title:"睡眠の質と翌日体調",
          body:`睡眠が浅かった・眠れなかった翌日の体調スコアは平均 ${ab}（${scoreToLabel(ab)}）、よく眠れた翌日は ${ag}（${scoreToLabel(ag)}）。`,
          tip:"睡眠の質を上げると翌日のパフォーマンスが変わりそうです。"});
      }
    }

    // ③ 便秘と体調（3日以上出ていない日の後）
    const noBowelDays=[], afterConstipation=[];
    let noCount=0;
    dates.forEach((d,i)=>{
      const b=byDate[d].bowel;
      if(b==="出なかった") noCount++;
      else noCount=0;
      if(noCount>=3&&byDate[d].cond!=null) afterConstipation.push(byDate[d].cond);
      else if(noCount===0&&byDate[d].cond!=null) noBowelDays.push(byDate[d].cond);
    });
    if(afterConstipation.length>=2){
      const ac=avg(afterConstipation), an=avg(noBowelDays);
      results.push({icon:"💩",color:C.brown,bg:C.brownLight,
        title:"お通じと体調の関係",
        body:`便秘が3日以上続いた日の体調スコアは平均 ${ac}（${scoreToLabel(ac)}）${an?`、出た日は ${an}（${scoreToLabel(an)}）`:""}。腸内環境が体調に影響しているかもしれません。`,
        tip:"水分・食物繊維を意識してみてください。"});
    }

    // ④ 運動と体調
    const withEx=[], withoutEx=[];
    dates.forEach(d=>{
      if(byDate[d].cond!=null){
        if(byDate[d].exercised) withEx.push(byDate[d].cond);
        else withoutEx.push(byDate[d].cond);
      }
    });
    if(withEx.length>=2&&withoutEx.length>=2){
      const aw=avg(withEx), an=avg(withoutEx);
      if(Math.abs(aw-an)>=0.4){
        results.push({icon:"🏃",color:C.mint,bg:C.mintLight,
          title:"運動と体調の関係",
          body:`運動した日の体調スコアは平均 ${aw}（${scoreToLabel(aw)}）、しなかった日は ${an}（${scoreToLabel(an)}）。${aw>an?"運動が体調改善に効いているようです。":"運動のタイミングや強度を見直すといいかも。"}`,
          tip:aw>an?"週3回以上を目指してみましょう！":"無理なく続けられる運動量を探してみて。"});
      }
    }

    // ⑤ よく出る症状
    const allSymptoms=[];
    dates.forEach(d=>{if(byDate[d].symptoms) allSymptoms.push(...byDate[d].symptoms);});
    const symCount={};
    allSymptoms.forEach(s=>{const k=s.trim();if(k) symCount[k]=(symCount[k]||0)+1;});
    const topSym=Object.entries(symCount).filter(([,c])=>c>=2).sort((a,b)=>b[1]-a[1]).slice(0,3);
    if(topSym.length>0){
      results.push({icon:"🩺",color:C.rose,bg:C.roseLight,
        title:"よく出る症状",
        body:`繰り返し記録された症状：${topSym.map(([s,c])=>`「${s}」(${c}回)`).join("、")}。パターンがあるか振り返ってみましょう。`,
        tip:"症状が続く場合は医療機関への相談も検討を。"});
    }

    return results;
  },[records]);

  if(records.length<5){
    return(
      <Card style={{textAlign:"center",padding:40,color:C.sub}}>
        <p style={{fontSize:28}}>🔍</p>
        <p style={{fontSize:14,fontWeight:700,color:C.ink}}>記録が増えると傾向が見えてきます</p>
        <p style={{fontSize:12}}>あと{Math.max(0,5-records.length)}件記録するとパターン分析がはじまります</p>
      </Card>
    );
  }
  if(insights.length===0){
    return(
      <Card style={{textAlign:"center",padding:40,color:C.sub}}>
        <p style={{fontSize:28}}>🔍</p>
        <p style={{fontSize:13}}>まだ明確なパターンは見つかっていません。記録を続けると傾向が出てきます。</p>
      </Card>
    );
  }
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <Card style={{background:C.mintLight,borderColor:C.mint,padding:12}}>
        <p style={{margin:0,fontSize:12,color:C.mint}}>✦ あなたの記録から見えてきたパターンです。あくまで傾向の参考としてご活用ください。</p>
      </Card>
      {insights.map((ins,i)=>(
        <Card key={i} style={{borderColor:ins.color,background:ins.bg}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
            <div style={{width:40,height:40,borderRadius:12,background:C.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{ins.icon}</div>
            <div style={{flex:1}}>
              <p style={{margin:"0 0 6px",fontSize:13,fontWeight:800,color:ins.color}}>{ins.title}</p>
              <p style={{margin:"0 0 8px",fontSize:12,color:C.ink,lineHeight:1.7}}>{ins.body}</p>
              <div style={{background:C.surface,borderRadius:8,padding:"7px 10px"}}>
                <p style={{margin:0,fontSize:11,color:ins.color,fontWeight:600}}>💡 {ins.tip}</p>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Period Tab ─────────────────────────────────────────────
function PeriodTab({records,onSave}){
  const cycle=calcCycle(records);
  const periodRecs=records.filter(r=>r.cat==="period").sort((a,b)=>b.date.localeCompare(a.date));
  const[fields,setFields]=useState({});
  const[note,setNote]=useState("");
  const[saved,setSaved]=useState(false);
  const f=(k,v)=>setFields(p=>({...p,[k]:v}));
  function handleSave(){
    onSave({id:Date.now(),cat:"period",fields,note,date:today(),time:timeNow(),quick:false});
    setFields({});setNote("");setSaved(true);setTimeout(()=>setSaved(false),2000);
  }
  const phaseInfo=cycle?(()=>{
    const now=new Date();
    const{nextPeriod,ovulation,fertileFrom,fertileTo}=cycle;
    if(now>=fertileFrom&&now<=fertileTo) return{label:"🌸 妊娠しやすい時期",color:C.rose,bg:C.roseLight};
    if(now>=ovulation&&now<=nextPeriod)  return{label:"🌙 黄体期（後半）",color:C.violet,bg:C.violetLight};
    return{label:"💧 卵胞期（前半）",color:C.sky,bg:C.skyLight};
  })():null;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {cycle?(
        <Card style={{background:C.roseLight,borderColor:C.rose}}>
          <p style={{margin:"0 0 12px",fontSize:13,fontWeight:700,color:C.rose}}>🌸 周期予測（平均{cycle.avgCycle}日周期）</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            {[{label:"次回月経予定",date:cycle.nextPeriod,color:C.rose},{label:"排卵予定日",date:cycle.ovulation,color:C.violet}].map(item=>{
              const days=cycle.daysUntil(item.date);
              return(
                <div key={item.label} style={{background:C.surface,borderRadius:12,padding:"12px 14px"}}>
                  <p style={{margin:"0 0 2px",fontSize:11,color:C.sub}}>{item.label}</p>
                  <p style={{margin:"0 0 2px",fontSize:16,fontWeight:800,color:item.color}}>{cycle.fmt(item.date)}</p>
                  <p style={{margin:0,fontSize:11,color:C.muted}}>{days===0?"今日":days>0?`あと${days}日`:`${Math.abs(days)}日前`}</p>
                </div>
              );
            })}
          </div>
          <div style={{background:C.surface,borderRadius:12,padding:"10px 14px",marginBottom:8}}>
            <p style={{margin:"0 0 2px",fontSize:11,color:C.sub}}>妊娠しやすい時期</p>
            <p style={{margin:0,fontSize:13,fontWeight:700,color:C.rose}}>{cycle.fmt(cycle.fertileFrom)} 〜 {cycle.fmt(cycle.fertileTo)}</p>
          </div>
          {phaseInfo&&<div style={{background:phaseInfo.bg,borderRadius:10,padding:"8px 12px"}}><p style={{margin:0,fontSize:12,fontWeight:700,color:phaseInfo.color}}>{phaseInfo.label}</p></div>}
          {cycle.cycleCount<2&&<p style={{margin:"8px 0 0",fontSize:11,color:C.muted}}>※ 記録が1回のみのため28日周期で計算中。記録が増えると精度が上がります。</p>}
        </Card>
      ):(
        <Card style={{background:C.roseLight,borderColor:C.rose,textAlign:"center",padding:24}}>
          <p style={{fontSize:24,margin:"0 0 8px"}}>🌸</p>
          <p style={{fontSize:14,fontWeight:700,color:C.rose,margin:"0 0 4px"}}>月経を記録すると予測が表示されます</p>
          <p style={{fontSize:12,color:C.sub,margin:0}}>開始日を記録してみましょう</p>
        </Card>
      )}
      <Card>
        <p style={{margin:"0 0 12px",fontSize:13,fontWeight:700,color:C.ink}}>月経を記録する</p>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Sel label="記録の種類" value={fields.periodType||"開始"} onChange={v=>f("periodType",v)} options={[{value:"開始",label:"🌸 開始"},{value:"終了",label:"✓ 終了"},{value:"経過中",label:"📍 経過中"}]}/>
          <Sel label="量" value={fields.flow||"普通"} onChange={v=>f("flow",v)} options={[{value:"多い",label:"多い"},{value:"普通",label:"普通"},{value:"少ない",label:"少ない"}]}/>
          <Inp label="症状（任意）" value={fields.pSymptoms||""} onChange={v=>f("pSymptoms",v)} placeholder="腹痛、腰痛、頭痛…"/>
          <Inp label="メモ（任意）" value={note} onChange={setNote} placeholder="自由記入…"/>
          <button onClick={handleSave} style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:C.rose,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer"}}>{saved?"✓ 保存しました！":"保存する"}</button>
        </div>
      </Card>
      {periodRecs.length>0&&(
        <Card>
          <SectionTitle>記録履歴</SectionTitle>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {periodRecs.slice(0,10).map(r=>(
              <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:18}}>🌸</span>
                <div><p style={{margin:0,fontSize:13,fontWeight:600,color:C.ink}}>{r.fields.periodType} / {r.fields.flow}</p><p style={{margin:0,fontSize:11,color:C.muted}}>{r.date} {r.time}</p></div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── History ────────────────────────────────────────────────
function History({records,onDelete,onEdit}){
  const[filter,setFilter]=useState("all");
  const filtered=filter==="all"?records:records.filter(r=>r.cat===filter);
  const grouped=useMemo(()=>{
    const g={};
    [...filtered].reverse().forEach(r=>{if(!g[r.date]) g[r.date]=[];g[r.date].push(r);});
    return g;
  },[filtered]);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <button onClick={()=>setFilter("all")} style={{padding:"6px 12px",borderRadius:99,fontSize:12,fontWeight:600,cursor:"pointer",background:filter==="all"?C.ink:C.bg,color:filter==="all"?"#fff":C.sub,border:`1px solid ${filter==="all"?C.ink:C.border}`}}>すべて</button>
        {Object.entries(DETAIL_CATS).map(([id,m])=>(
          <button key={id} onClick={()=>setFilter(id)} style={{padding:"6px 12px",borderRadius:99,fontSize:12,fontWeight:600,cursor:"pointer",background:filter===id?m.light:C.bg,color:filter===id?m.color:C.sub,border:`1px solid ${filter===id?m.color:C.border}`}}>{m.icon}</button>
        ))}
      </div>
      {Object.keys(grouped).length===0&&<div style={{textAlign:"center",padding:40,color:C.sub}}><p>記録がありません</p></div>}
      {Object.entries(grouped).map(([date,recs])=>(
        <div key={date}>
          <p style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:6,paddingLeft:4}}>{date}</p>
          <Card style={{padding:12}}>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {recs.map(r=>(
                <div key={r.id} style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{flex:1}}><RecordRow r={r}/></div>
                  <button onClick={()=>onEdit(r)} style={{background:"none",border:`1px solid ${C.border}`,color:C.sub,cursor:"pointer",fontSize:12,padding:"4px 8px",borderRadius:6,fontWeight:600}}>編集</button>
                  <button onClick={()=>onDelete(r.id)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,padding:"4px 8px",borderRadius:6}}>×</button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}

// ── Edit Form ───────────────────────────────────────────────
function EditForm({record,onSave,onCancel}){
  const[fields,setFields]=useState({...record.fields});
  const[note,setNote]=useState(record.note||"");
  const f=(k,v)=>setFields(p=>({...p,[k]:v}));
  const m=DETAIL_CATS[record.cat];

  const form={
    weight:()=>(
      <>
        <Inp label="体重" value={fields.weight||""} onChange={v=>f("weight",v)} type="number" placeholder="60.0" unit="kg"/>
        <Inp label="体脂肪率（任意）" value={fields.fat||""} onChange={v=>f("fat",v)} type="number" placeholder="25.0" unit="%"/>
        <Inp label="ウエスト（任意）" value={fields.waist||""} onChange={v=>f("waist",v)} type="number" placeholder="75" unit="cm"/>
      </>
    ),
    meal:()=>(
      <>
        <Sel label="食事" value={fields.mealType||"朝食"} onChange={v=>f("mealType",v)} options={[{value:"朝食",label:"朝食"},{value:"昼食",label:"昼食"},{value:"夕食",label:"夕食"},{value:"間食",label:"間食"}]}/>
        <Inp label="カロリー（任意）" value={fields.calories||""} onChange={v=>f("calories",v)} type="number" placeholder="600" unit="kcal"/>
        <Inp label="食べたもの（任意）" value={fields.food||""} onChange={v=>f("food",v)} placeholder="ご飯、味噌汁…"/>
      </>
    ),
    exercise:()=>(
      <>
        <Inp label="種類" value={fields.exType||""} onChange={v=>f("exType",v)} placeholder="ウォーキング…"/>
        <Inp label="時間" value={fields.duration||""} onChange={v=>f("duration",v)} type="number" placeholder="30" unit="分"/>
        <Inp label="消費カロリー（任意）" value={fields.burned||""} onChange={v=>f("burned",v)} type="number" placeholder="150" unit="kcal"/>
      </>
    ),
    sleep:()=>(
      <>
        <Inp label="就寝" value={fields.bedtime||""} onChange={v=>f("bedtime",v)} type="time"/>
        <Inp label="起床" value={fields.wakeup||""} onChange={v=>f("wakeup",v)} type="time"/>
        <Sel label="睡眠の質" value={fields.quality||"普通"} onChange={v=>f("quality",v)} options={[{value:"ぐっすり",label:"😴 ぐっすり"},{value:"普通",label:"😶 普通"},{value:"浅かった",label:"😪 浅かった"},{value:"眠れなかった",label:"😩 眠れなかった"}]}/>
      </>
    ),
    condition:()=>(
      <>
        <Sel label="体調" value={fields.overall||"普通"} onChange={v=>f("overall",v)} options={[{value:"とても良い",label:"😄 とても良い"},{value:"良い",label:"🙂 良い"},{value:"普通",label:"😐 普通"},{value:"悪い",label:"😔 悪い"},{value:"とても悪い",label:"🤒 とても悪い"}]}/>
        <Inp label="症状（任意）" value={fields.symptoms||""} onChange={v=>f("symptoms",v)} placeholder="頭痛、疲れ…"/>
        <Inp label="体温（任意）" value={fields.temp||""} onChange={v=>f("temp",v)} type="number" placeholder="36.5" unit="℃"/>
      </>
    ),
    period:()=>(
      <>
        <Sel label="記録の種類" value={fields.periodType||"開始"} onChange={v=>f("periodType",v)} options={[{value:"開始",label:"🌸 開始"},{value:"終了",label:"✓ 終了"},{value:"経過中",label:"📍 経過中"}]}/>
        <Sel label="量" value={fields.flow||"普通"} onChange={v=>f("flow",v)} options={[{value:"多い",label:"多い"},{value:"普通",label:"普通"},{value:"少ない",label:"少ない"}]}/>
        <Inp label="症状（任意）" value={fields.pSymptoms||""} onChange={v=>f("pSymptoms",v)} placeholder="腹痛、腰痛…"/>
      </>
    ),
    bowel:()=>(
      <>
        <Sel label="結果" value={fields.bowelResult||"出た"} onChange={v=>f("bowelResult",v)} options={[{value:"出た",label:"✅ 出た"},{value:"少し出た",label:"🔸 少し出た"},{value:"出なかった",label:"❌ 出なかった"}]}/>
        <Sel label="状態（任意）" value={fields.bowelType||""} onChange={v=>f("bowelType",v)} options={[{value:"",label:"— 選択しない —"},{value:"普通",label:"😊 普通"},{value:"やわらかい",label:"💧 やわらかい"},{value:"かたい",label:"🪨 かたい"},{value:"下痢気味",label:"⚡下痢気味"}]}/>
      </>
    ),
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"4px 0"}}>
        <button onClick={onCancel} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:C.sub}}>←</button>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:32,height:32,borderRadius:10,background:m.light,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{m.icon}</div>
          <p style={{margin:0,fontSize:15,fontWeight:800,color:C.ink}}>{m.label}を編集</p>
        </div>
      </div>
      <p style={{margin:0,fontSize:11,color:C.muted}}>{record.date} {record.time}</p>
      <Card>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {form[record.cat]&&form[record.cat]()}
          <Inp label="メモ（任意）" value={note} onChange={setNote} placeholder="自由記入…"/>
        </div>
      </Card>
      <button onClick={()=>onSave({...record,fields,note})} style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:C.mint,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer"}}>
        保存する
      </button>
      <button onClick={onCancel} style={{width:"100%",padding:"11px",borderRadius:12,border:`1px solid ${C.border}`,background:"transparent",color:C.sub,fontSize:14,fontWeight:600,cursor:"pointer"}}>
        キャンセル
      </button>
    </div>
  );
}
function RecordTab({records,onSave}){
  const[mode,setMode]=useState("quick");
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",background:C.bg,borderRadius:12,padding:4,border:`1px solid ${C.border}`}}>
        {[{id:"quick",label:"⚡ かんたん記録"},{id:"detail",label:"📝 くわしく記録"}].map(m=>(
          <button key={m.id} onClick={()=>setMode(m.id)} style={{flex:1,padding:"9px",borderRadius:9,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:mode===m.id?C.surface:"transparent",color:mode===m.id?C.ink:C.sub,boxShadow:mode===m.id?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>{m.label}</button>
        ))}
      </div>
      {mode==="quick"?<QuickRecord records={records} onSave={onSave}/>:<DetailForm onSave={onSave}/>}
    </div>
  );
}

// ── App root ───────────────────────────────────────────────
const TABS=[
  {id:"dashboard",label:"ホーム",icon:"🏠"},
  {id:"record",label:"記録",icon:"＋"},
  {id:"insights",label:"分析",icon:"📊"},
  {id:"period",label:"月経",icon:"🌸"},
  {id:"history",label:"履歴",icon:"📋"},
];

export default function HealthApp(){
  const[tab,setTab]=useState("dashboard");
  const[records,setRecords]=useState(()=>{
    try {
      const saved = localStorage.getItem("health-records");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const[toast,setToast]=useState("");
  const[editTarget,setEditTarget]=useState(null);

  function saveRecords(newRecords){
    setRecords(newRecords);
    try { localStorage.setItem("health-records", JSON.stringify(newRecords)); } catch {}
  }

  function handleSave(r){saveRecords([...records,r]);setToast("✓ 記録しました！");setTimeout(()=>setToast(""),1800);}
  function handleDelete(id){saveRecords(records.filter(r=>r.id!==id));}
  function handleEdit(r){setEditTarget(r);setTab("edit");}
  function handleUpdate(updated){
    saveRecords(records.map(r=>r.id===updated.id?updated:r));
    setEditTarget(null);
    setToast("✓ 編集しました！");
    setTimeout(()=>setToast(""),1800);
    setTab("history");
  }

  const pages={
    dashboard:<Dashboard records={records}/>,
    record:<RecordTab records={records} onSave={handleSave}/>,
    insights:<InsightsTab records={records}/>,
    period:<PeriodTab records={records} onSave={handleSave}/>,
    history:<History records={records} onDelete={handleDelete} onEdit={handleEdit}/>,
    edit: editTarget ? <EditForm record={editTarget} onSave={handleUpdate} onCancel={()=>setTab("history")}/> : null,
  };
  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Hiragino Sans','Yu Gothic UI',sans-serif"}}>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"14px 20px"}}>
        <div style={{maxWidth:480,margin:"0 auto",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>🌿</span>
          <div>
            <h1 style={{margin:0,fontSize:15,fontWeight:800,color:C.ink}}>わたしの健康ノート</h1>
            <p style={{margin:0,fontSize:11,color:C.muted}}>{today()}</p>
          </div>
          <div style={{marginLeft:"auto",background:C.mintLight,padding:"4px 12px",borderRadius:99}}>
            <span style={{fontSize:12,fontWeight:700,color:C.mint}}>🔥 {calcStreak(records)}日連続</span>
          </div>
        </div>
      </div>
      {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:C.mint,color:"#fff",padding:"10px 24px",borderRadius:99,fontWeight:600,fontSize:13,zIndex:999,boxShadow:"0 4px 16px rgba(0,0,0,0.15)"}}>{toast}</div>}
      <div style={{maxWidth:480,margin:"0 auto",padding:"18px 14px 90px"}}>{pages[tab]}</div>
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"center"}}>
        <div style={{display:"flex",width:"100%",maxWidth:480}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"11px 0 9px",border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:tab===t.id?C.mint:C.sub,borderTop:`2px solid ${tab===t.id?C.mint:"transparent"}`}}>
              <span style={{fontSize:t.id==="record"?22:17}}>{t.icon}</span>
              <span style={{fontSize:10,fontWeight:600}}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
