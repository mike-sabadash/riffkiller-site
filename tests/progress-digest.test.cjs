const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {startSite}=require('./site-fixture.cjs');

// Monday 2026-10-26; the week before runs Mon 19 – Sun 25 October.
const MONDAY_9_UTC=Date.UTC(2026,9,26,9,0,0)/1000;
const ms=s=>s*1000;
let site;
const users=[
    {id:'u_moscow',email:'moscow@example.com'},{id:'u_off',email:'off@example.com'},
    {id:'u_quiet',email:'quiet@example.com'},{id:'u_la',email:'la@example.com'},
];
const progressFile=id=>path.join(site.dir,'data/progress',crypto.createHash('sha256').update(id).digest('hex')+'.json');
const writeProgress=(id,p)=>{fs.mkdirSync(path.dirname(progressFile(id)),{recursive:true});fs.writeFileSync(progressFile(id),JSON.stringify({v:2,riffs:{},days:{},...p}));};
const readProgress=id=>JSON.parse(fs.readFileSync(progressFile(id),'utf8'));

// Runs digest_run at a given time with a sender that records mail instead of calling Resend.
function run(nowTs){
    const out=path.join(site.dir,'sent.json');
    const code=`require '${site.dir}/config/progress-digest.php';
        $sent=[];$lines=digest_run(${nowTs},function($to,$mail,$stop)use(&$sent){$sent[]=['to'=>$to,'mail'=>$mail,'stop'=>$stop];return null;});
        file_put_contents('${out}',json_encode(['sent'=>$sent,'lines'=>$lines],JSON_UNESCAPED_UNICODE));`;
    execFileSync(process.env.PHP_BIN||'php',['-r',code]);
    return JSON.parse(fs.readFileSync(out,'utf8'));
}

before(async()=>{
    site=await startSite({env:'SITE_URL=https://riffkiller.example\n'});
    fs.writeFileSync(path.join(site.dir,'data/users.json'),JSON.stringify(users));
    const riff=JSON.parse(fs.readFileSync(path.join(site.dir,'data/riffs.json'),'utf8')).find(r=>Array.isArray(r.segments)&&r.segments.length>=2);
    const parts=riff.segments.map((_,i)=>i===0?{tempoAt:ms(Date.UTC(2026,9,21)/1000),nextReview:ms(MONDAY_9_UTC-3600)}:{});
    const week={'2026-10-19':{sec:600},'2026-10-21':{sec:400},'2026-10-22':{sec:120}};
    writeProgress('u_moscow',{email:true,tz:'Europe/Moscow',lang:'ru',goal:3,days:week,riffs:{[riff.id]:{parts,lastAt:ms(Date.UTC(2026,9,22)/1000)}}});
    writeProgress('u_off',{email:false,tz:'UTC',goal:3,days:week});
    writeProgress('u_quiet',{email:true,tz:'UTC',lang:'en',goal:5,days:{'2026-09-01':{sec:900}}});
    writeProgress('u_la',{email:true,tz:'America/Los_Angeles',lang:'es',goal:3,days:week});
    site.riff=riff;
});
after(()=>site?.stop());

test('Monday summary goes out once, from 8:00 in each student’s zone, only to those who turned it on', ()=>{
    assert.equal(new Date(MONDAY_9_UTC*1000).getUTCDay(),1);
    const first=run(MONDAY_9_UTC);
    const to=first.sent.map(s=>s.to).sort();
    // 12:00 in Moscow, 9:00 UTC; Los Angeles is still at 2:00, the opted-out student gets nothing.
    assert.deepEqual(to,['moscow@example.com','quiet@example.com']);
    const ru=first.sent.find(s=>s.to==='moscow@example.com').mail;
    assert.equal(ru.subject,'Твоя неделя: 2 из 3 дней');
    assert.match(ru.text,/Прошлая неделя: 2 из 3 дней практики \(19 мин\)/);
    assert.match(ru.text,new RegExp(site.riff.song.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+': частей вышло на темп — 1'));
    assert.match(ru.text,/Частей ждут повтора: 1/);
    assert.match(ru.text,/https:\/\/riffkiller\.example\/profile\.html/);
    const quiet=first.sent.find(s=>s.to==='quiet@example.com').mail;
    assert.equal(quiet.subject,'Pausing your weekly summary');

    assert.equal(run(MONDAY_9_UTC+1800).sent.length,0,'same week is not sent twice');
    const la=run(MONDAY_9_UTC+8*3600).sent;
    assert.deepEqual(la.map(s=>s.to),['la@example.com']);
    assert.equal(la[0].mail.subject,'Tu semana: 2 de 3 días');
    // A week later the quiet student stays paused.
    assert.ok(!run(MONDAY_9_UTC+7*86400+3600).sent.some(s=>s.to==='quiet@example.com'));
});

test('the link in the email turns the summary off, a forged one does not', async()=>{
    const stop=run(MONDAY_9_UTC+14*86400).sent.find(s=>s.to==='moscow@example.com').stop;
    const local=site.base+new URL(stop).pathname+new URL(stop).search;
    const bad=await fetch(local.replace(/t=[0-9a-f]+/,'t='+'0'.repeat(64)));
    assert.equal(bad.status,400);
    assert.equal(readProgress('u_moscow').email,true);
    const ok=await fetch(local);
    assert.equal(ok.status,200);
    assert.match(await ok.text(),/Недельные итоги отключены/);
    const p=readProgress('u_moscow');
    assert.equal(p.email,false);assert.ok(p.emailAt>0);
    assert.equal(run(MONDAY_9_UTC+21*86400).sent.filter(s=>s.to==='moscow@example.com').length,0);
});

test('the cron entry point refuses to run over the web', async()=>{
    const r=await fetch(site.base+'/config/progress-digest-cli.php');
    assert.notEqual(r.status,200);
});
