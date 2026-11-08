const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {startSite}=require('./site-fixture.cjs');

// Wednesday 11 November 2026 … Friday 13 November 2026 (release day of the scheduled riff).
const at=(d,h,m=0)=>Date.UTC(2026,10,d,h,m)/1000;
let site,ready,notReady,freeRiff;
const users=[
    {id:'u_msk',email:'jimmy.page@example.com',name:'',created_at:'2026-10-20T10:00:00+00:00'},
    {id:'u_la',email:'la@example.com',name:'Angus',created_at:'2026-10-21T10:00:00+00:00'},
    {id:'u_none',email:'none@example.com',created_at:'2026-10-22T10:00:00+00:00'},
    {id:'u_new',email:'new@example.com',created_at:'2026-11-10T10:00:00+00:00'},
];
const file=n=>path.join(site.dir,'data',n);
const readJson=(n,d)=>fs.existsSync(file(n))?JSON.parse(fs.readFileSync(file(n),'utf8')):d;
const progressFile=id=>path.join(site.dir,'data/progress',crypto.createHash('sha256').update(id).digest('hex')+'.json');
const writeProgress=(id,p)=>{fs.mkdirSync(path.dirname(progressFile(id)),{recursive:true});fs.writeFileSync(progressFile(id),JSON.stringify({v:2,riffs:{},days:{},...p}));};
const php=code=>execFileSync(process.env.PHP_BIN||'php',['-r',`$GLOBALS['NL_NO_ALERT_MAIL']=1;require '${site.dir}/config/newsletter.php';${code}`]).toString();
const setPrefs=(id,topics)=>php(`nl_set_prefs('${id}',json_decode('${JSON.stringify(topics)}',true),'profile');`);
const token=id=>php(`echo nl_token('${id}');`);

// One cron pass at a given time; mail is recorded instead of sent.
function run(ts){
    const out=path.join(site.dir,'sent.json');
    php(`$sent=[];$lines=nl_run(${ts},function($to,$mail,$unsub,$key)use(&$sent){$sent[]=['to'=>$to,'mail'=>$mail,'unsub'=>$unsub,'key'=>$key];return null;});
        file_put_contents('${out}',json_encode(['sent'=>$sent,'lines'=>$lines],JSON_UNESCAPED_UNICODE));`);
    return JSON.parse(fs.readFileSync(out,'utf8'));
}

before(async()=>{
    site=await startSite({env:'SITE_URL=https://riffkiller.example\nADMIN_SECRET=fixture-secret\n'});
    fs.writeFileSync(file('users.json'),JSON.stringify(users));
    writeProgress('u_msk',{tz:'Europe/Moscow',lang:'ru',email:true});
    writeProgress('u_la',{tz:'America/Los_Angeles'});
    const riffs=JSON.parse(fs.readFileSync(file('riffs.json'),'utf8'));
    const withParts=riffs.filter(r=>Array.isArray(r.segments)&&r.segments.length>=2&&r.videoFile);
    [ready,notReady,freeRiff]=withParts;
    assert.ok(ready&&notReady&&freeRiff,'fixture has three riffs with parts');
    Object.assign(ready,{lock:'soon',releasedAt:'2026-11-13',thumbnail:'assets/img/ready.png',hidden:false,isFree:false,freeWithAccount:false});
    Object.assign(notReady,{lock:'soon',releasedAt:'2026-11-20',thumbnail:'assets/img/riff-1.png',hidden:false,isFree:false,freeWithAccount:false});
    Object.assign(freeRiff,{lock:'',releasedAt:'2026-10-16',hidden:false,isFree:false,freeWithAccount:false});
    for(const r of riffs)if(![ready,notReady,freeRiff].includes(r)&&r.releasedAt)delete r.releasedAt;
    fs.writeFileSync(file('riffs.json'),JSON.stringify(riffs));
});
after(()=>site?.stop());

test('nothing goes to anyone without the separate opt-in',()=>{
    const r=run(at(11,15,30));
    assert.equal(r.sent.length,0);
    assert.deepEqual(readJson('newsletter.json',{}),{});
});

test('heads-up two days before, from 18:00 in the reader’s zone, only to those who asked for it',()=>{
    setPrefs('u_msk',{drops:true,headsup:true,community:true,offers:true});
    setPrefs('u_la',{drops:true,headsup:true});
    setPrefs('u_none',{drops:true});
    const consent=readJson('newsletter.json',{}).u_msk.consent;
    assert.equal(consent.how,'profile');assert.equal(consent.version,'2026-11-09');
    assert.equal(run(at(11,14,30)).sent.length,0,'17:30 in Moscow is too early');
    const r=run(at(11,15,30));
    assert.deepEqual(r.sent.map(s=>s.to),['jimmy.page@example.com']);
    const m=r.sent[0];
    const song=ready.song.replace(/\s+/g,' ').trim();
    assert.equal(m.mail.subject,'Friday: '+song);
    assert.match(m.mail.text,/\n\nHey Jimmy,\n\n/);assert.match(m.mail.text,/^COMING FRIDAY, NOV 13/);
    assert.match(m.mail.html,/assets\/email\/header-2\.png\?v=/,'black header with the logo');assert.match(m.mail.html,/A new riff every Friday/,'footer says what Riff Killer gives');
    assert.match(m.mail.html,/display:none[^>]*>[^<]*lands on Riff Killer Friday, Nov 13/,'inbox preview line');
    assert.match(m.mail.text,new RegExp('lands on Riff Killer on Friday, Nov 13'));
    assert.match(m.mail.text,/opens for you for a week from Dec 11/);
    assert.match(m.unsub,/^https:\/\/riffkiller\.example\/api\/newsletter\/unsubscribe\.php\?u=u_msk&t=[0-9a-f]{64}&m=soon-/);
    assert.match(m.mail.html,/Unsubscribe from all/);assert.match(m.mail.html,/Choose what we send/);
    for(const src of m.mail.html.match(/<img[^>]+src="[^"]+"/g))assert.match(src,/src="https:\/\/riffkiller\.example\/assets\//,'pictures only from our own site, no tracking pixels');
    assert.doesNotMatch(m.mail.html,/width="1"|height="1"/,'no pixels');
    assert.equal(run(at(11,16,30)).sent.length,0,'once only');
    // Los Angeles reaches 18:00 later the same day.
    assert.deepEqual(run(at(12,2,30)).sent.map(s=>s.to),['la@example.com']);
});

test('a scheduled riff opens by itself at 10:00 Moscow time; one that is not ready stays closed and raises an alert',()=>{
    const lockOf=r=>JSON.parse(fs.readFileSync(file('riffs.json'),'utf8')).find(x=>x.id===r.id).lock;
    run(at(13,6,30));
    assert.equal(lockOf(ready),'soon','9:30 Moscow');
    run(at(13,7,30));
    assert.equal(lockOf(ready),'','10:30 Moscow');
    run(at(17,8,0));
    const alerts=readJson('newsletter-alerts.json',[]);
    assert.ok(alerts.some(a=>a.kind==='not_ready'&&a.text.includes('общая обложка')),'warned three days ahead');
    run(at(20,8,0));
    assert.equal(lockOf(notReady),'soon');
    assert.ok(readJson('newsletter-alerts.json',[]).some(a=>a.kind==='held'));
});

test('release day: one email with the new riff, the free riff of the week and the vote for community readers',async()=>{
    php(`nl_save('newsletter-polls.json',['polls'=>[['id'=>'poll01','question'=>'Which riff next?','options'=>['Enter Sandman','Back in Black'],'from'=>'2026-11-10','until'=>'2026-11-20']]]);`);
    const r=run(at(13,15,30));
    const m=r.sent.find(s=>s.to==='jimmy.page@example.com');
    assert.ok(m,'Moscow reader got it');
    const song=s=>s.replace(/\s+/g,' ').trim();
    assert.equal(m.mail.subject,'New: '+song(ready.song)+' · Free this week: '+song(freeRiff.song));
    assert.match(m.mail.text,/until Thursday, Nov 19/);
    assert.match(m.mail.text,/api\/newsletter\/go\.php\?m=drop-2026-11-13&to=%2Fpractice\.html%3Friff%3D/);
    assert.match(m.mail.text,/Which riff next\?/);
    assert.ok(!r.sent.some(s=>s.to==='none@example.com'&&/Which riff/.test(s.mail.text)),'no vote block without the community topic');
    const sent=readJson('newsletter-sent.json',{})['drop-2026-11-13'];
    assert.ok(sent.sent>=1);
    // A click is counted for the letter and only leads to our own pages.
    const go=await fetch(site.base+'/api/newsletter/go.php?m=drop-2026-11-13&to=%2Fpractice.html%3Friff%3D3',{redirect:'manual'});
    assert.equal(go.status,302);assert.equal(go.headers.get('location'),'/practice.html?riff=3');
    const evil=await fetch(site.base+'/api/newsletter/go.php?m=drop-2026-11-13&to=https%3A%2F%2Fevil.example%2F',{redirect:'manual'});
    assert.equal(evil.headers.get('location'),'/');
    assert.equal(readJson('newsletter-sent.json',{})['drop-2026-11-13'].clicks,2);
    const day=new Date().toISOString().slice(0,10);
    assert.equal(readJson('stats/'+day+'.json',{})['mail_click:drop-2026-11-13'],2);
    // One tap is a vote, changeable; a forged link counts nothing.
    const vote=m.mail.text.match(/→ Back in Black: (\S+)/)[1].replace('https://riffkiller.example',site.base);
    const v=await fetch(vote);assert.equal(v.status,200);assert.match(await v.text(),/thanks for voting/);
    assert.equal(Object.values(readJson('newsletter-polls.json',{}).votes.poll01)[0],1);
    assert.equal((await fetch(vote.replace(/t=[0-9a-f]+/,'t='+'0'.repeat(64)))).status,400);
});

test('at most one a day and two a week, only one of them besides the release-day email; offers once a month',()=>{
    php(`nl_save('newsletter-campaigns.json',[
        ['id'=>'offer001','topic'=>'offers','date'=>'2026-11-16','subject'=>'A year of riffs for $63','text'=>"Hey {name},\\n\\nQuick one.\\n\\n— Mike",'button'=>'Get the year','url'=>'/billing.html'],
        ['id'=>'chal0001','topic'=>'community','date'=>'2026-11-18','subject'=>'Challenge','text'=>'Play it.','button'=>'','url'=>''],
        ['id'=>'offer002','topic'=>'offers','date'=>'2026-11-24','subject'=>'Another offer','text'=>'Again.','button'=>'','url'=>'']]);`);
    const mon=run(at(16,15,30)).sent.filter(s=>s.to==='jimmy.page@example.com');
    assert.equal(mon.length,1);assert.equal(mon[0].mail.subject,'A year of riffs for $63');
    assert.match(mon[0].mail.text,/Hey Jimmy,/);assert.match(mon[0].mail.html,/>Quick one\.<\/p>[\s\S]*Get the year[\s\S]*— Mike/,'sign-off after the button');assert.match(mon[0].mail.text,/go\.php\?m=c-offer001&to=%2Fbilling\.html/);
    assert.equal(run(at(16,16,30)).sent.length,0,'one a day');
    const wed=run(at(18,15,30));
    assert.ok(!wed.sent.some(s=>s.to==='jimmy.page@example.com'),'the Monday offer already used this week’s extra email');
    assert.ok(wed.lines.some(l=>/c-chal0001 skipped for u_msk/.test(l)));
    assert.equal(readJson('newsletter-sent.json',{})['c-chal0001'].skipped,1);
    assert.ok(!run(at(24,15,30)).sent.some(s=>s.to==='jimmy.page@example.com'),'second offer within 30 days is dropped');
});

test('one-click unsubscribe: the mail app’s POST turns everything off; a visit only shows a button; forged links fail',async()=>{
    const t=token('u_msk');
    const url=site.base+'/api/newsletter/unsubscribe.php?u=u_msk&t='+t+'&m=drop-2026-11-13';
    const get=await fetch(url);
    assert.equal(get.status,200);assert.match(await get.text(),/Stop all Riff Killer emails\?/);
    assert.equal(readJson('newsletter.json',{}).u_msk.topics.drops,true,'GET changes nothing');
    assert.equal((await fetch(url.replace(/t=[0-9a-f]+/,'t='+'1'.repeat(64)),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'})).status,400);
    const post=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'});
    assert.equal(post.status,200);
    const row=readJson('newsletter.json',{}).u_msk;
    assert.ok(Object.values(row.topics).every(v=>v===false));assert.ok(row.withdrawnAt);
    assert.equal(JSON.parse(fs.readFileSync(progressFile('u_msk'),'utf8')).email,false,'the weekly summary stops too');
    assert.equal(readJson('newsletter-sent.json',{})['drop-2026-11-13'].unsub,1);
    assert.equal(run(at(27,15,30)).sent.filter(s=>s.to==='jimmy.page@example.com').length,0);
});

test('switches API: signed link or session; the card is offered only to accounts made before the newsletter',async()=>{
    assert.equal((await fetch(site.base+'/api/newsletter/prefs.php')).status,401);
    const t=token('u_none');
    const g=await (await fetch(site.base+'/api/newsletter/prefs.php?u=u_none&t='+t)).json();
    assert.equal(g.topics.drops,true);assert.equal(g.email,'n•••@example.com');
    assert.equal((await fetch(site.base+'/api/newsletter/prefs.php?u=u_none&t='+'2'.repeat(64))).status,403);
    const p=await (await fetch(site.base+'/api/newsletter/prefs.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({u:'u_none',t,topics:{offers:true,drops:false},how:'page'})})).json();
    assert.equal(p.topics.offers,true);assert.equal(p.topics.drops,false);
    // A real sign-up: the session decides; a cross-site text/plain post is refused.
    const reg=await fetch(site.base+'/api/auth/email-register.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true,email:'fresh@example.com',password:'secret123'})});
    const cookie=reg.headers.getSetCookie().at(-1).split(';')[0];
    const fresh=await (await fetch(site.base+'/api/newsletter/prefs.php',{headers:{Cookie:cookie}})).json();
    assert.equal(fresh.ask,false,'new accounts had the box at sign-up');
    assert.ok(Object.values(fresh.topics).every(v=>v===false),'agreeing to the Terms does not subscribe');
    assert.equal((await fetch(site.base+'/api/newsletter/prefs.php',{method:'POST',headers:{Cookie:cookie,'Content-Type':'text/plain'},body:JSON.stringify({topics:{drops:true}})})).status,415);
    const signed=await (await fetch(site.base+'/api/newsletter/prefs.php',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({topics:{drops:true},how:'signup',asked:'yes'})})).json();
    assert.equal(signed.topics.drops,true);
    assert.equal(readJson('newsletter.json',{})[(await reg.json()).user.id].consent.how,'signup');
    assert.equal(php(`echo json_encode(nl_should_ask(['consent'=>['version'=>'2026-10-29']],nl_prefs('u_la')));`),'false','already subscribed');
    assert.equal(php(`echo json_encode(nl_should_ask(['consent'=>['version'=>'2026-10-29']],nl_prefs('nobody')));`),'true');
    assert.equal(php(`echo json_encode(nl_should_ask(['consent'=>['version'=>'2026-11-09']],nl_prefs('nobody')));`),'false');
});

test('admin: the old send-to-everyone tool is retired; the newsletter page plans, previews and lists',async()=>{
    const cookie=await site.adminCookie();
    const old=await fetch(site.base+'/api/admin/send-campaign.php',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({subject:'x',text:'y'})});
    assert.equal(old.status,410);
    assert.equal((await fetch(site.base+'/api/admin/newsletter.php')).status,403);
    const st=await (await fetch(site.base+'/api/admin/newsletter.php',{headers:{Cookie:cookie}})).json();
    assert.equal(st.success,true);assert.ok(st.summary.any>=1);assert.ok(st.alerts.length>=1);
    const post=b=>fetch(site.base+'/api/admin/newsletter.php',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json());
    const bad=await post({action:'campaign_save',campaign:{topic:'offers',date:'2099-01-01',subject:'S',text:'T',button:'Go',url:'https://evil.example/'}});
    assert.equal(bad.success,false);
    const ok=await post({action:'campaign_save',campaign:{topic:'offers',date:'2099-01-01',subject:'Gift Premium',text:'Hey {name},\n\nGive a year.',button:'See plans',url:'https://riffkiller.fun/billing.html'}});
    assert.equal(ok.success,true);assert.ok(ok.campaigns.some(c=>c.subject==='Gift Premium'));
    const pv=await post({action:'preview',letter:{kind:'campaign',campaign:{topic:'offers',date:'2099-01-01',subject:'Gift Premium',text:'Hey {name},',button:'See plans',url:'/billing.html'}}});
    assert.equal(pv.letters[0].subject,'Gift Premium');assert.match(pv.letters[0].html,/Hey Jimmy,/);
    const day=await post({action:'preview',letter:{kind:'date',date:'2026-11-13'}});
    assert.ok(day.letters.some(l=>l.key==='drop-2026-11-13'));
});

test('deleting the account erases its newsletter switches, log and votes',()=>{
    php(`require_once '${site.dir}/config/legal.php';legal_delete_account('u_la');`);
    assert.ok(!('u_la' in readJson('newsletter.json',{})));
    assert.ok(!('u_la' in readJson('newsletter-log.json',{})));
});

test('Cyber Week: the yearly plan sells at $63 through its own lava.top offer only inside the window; offers skip paying readers',()=>{
    const at=t=>php(`putenv('BILLING_NOW=${t}');require_once '${site.dir}/config/billing.php';echo json_encode([lava_offer_id('yearly'),usdt_price('yearly'),lava_offer_id('monthly'),usdt_price('monthly'),billing_public_options()['sale']]);`);
    const before=JSON.parse(at(Date.parse('2026-11-27T07:59:00Z')/1000));
    assert.notEqual(before[0],'cd29f1c3-559c-46f4-97bb-7a67640e2afb');assert.equal(before[1],90);assert.deepEqual(before[4],{});
    const during=JSON.parse(at(Date.parse('2026-11-30T20:00:00Z')/1000));
    assert.equal(during[0],'cd29f1c3-559c-46f4-97bb-7a67640e2afb');assert.equal(during[1],63);
    assert.notEqual(during[2],'cd29f1c3-559c-46f4-97bb-7a67640e2afb','the monthly plan keeps its price');assert.equal(during[3],9);
    assert.deepEqual(during[4],{yearly:{price:63,was:90,label:'Cyber Week',untilLabel:'Dec 1'}});
    const after=JSON.parse(at(Date.parse('2026-12-02T08:00:00Z')/1000));
    assert.equal(after[1],90);assert.deepEqual(after[4],{});
    // The scheduled letter: the migration adds it once; a paying reader never gets it, a free one does.
    execFileSync(process.env.PHP_BIN||'php',[path.join(site.dir,'config/data-migrate-cli.php'),site.dir]);
    const c=readJson('newsletter-campaigns.json',[]).filter(x=>x.id==='cyber2026');
    assert.equal(c.length,1);assert.equal(c[0].date,'2026-11-30');
    fs.writeFileSync(file('newsletter-log.json'),'{}');
    setPrefs('u_none',{offers:true});setPrefs('u_new',{offers:true});
    fs.mkdirSync(path.join(site.dir,'data/subscriptions'),{recursive:true});
    fs.writeFileSync(path.join(site.dir,'data/subscriptions/u_new.json'),JSON.stringify({status:'active',source:'patreon',plan:'monthly',expires:Date.parse('2027-01-01')/1000}));
    const r=run(Date.UTC(2026,10,30,19,0)/1000);
    const got=r.sent.filter(s=>s.key==='c-cyber2026').map(s=>s.to);
    assert.ok(got.includes('none@example.com'));assert.ok(!got.includes('new@example.com'),'Patreon member is not sold to');
    const m=r.sent.find(s=>s.key==='c-cyber2026').mail;
    assert.equal(m.subject,'A year of riffs for $63 (ends Tuesday)');assert.match(m.html,/A year of riffs, 30% off/);assert.match(m.html,/Get the year for \$63/);
});
