const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {startSite}=require('./site-fixture.cjs');
let site,admin;
before(async()=>{site=await startSite();admin=await site.adminCookie()});after(()=>site?.stop());
async function post(url,data,cookie='') {return fetch(site.base+url,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});}
test('ordinary email sign-up, reload, logout and login use the server session',async()=>{
    const reg=await post('/api/auth/email-register.php',{consent:true,email:'practice-test@example.com',password:'riffkiller-test-password',name:'Practice Test'});
    assert.equal(reg.status,200);const user=(await reg.json()).user;assert.ok(user.id);
    const cookie=reg.headers.getSetCookie().at(-1).split(';')[0];
    let me=await (await fetch(site.base+'/api/me.php',{headers:{Cookie:cookie}})).json();assert.equal(me.authenticated,true);assert.equal(me.user.id,user.id);
    await post('/api/logout.php',{},cookie);
    me=await (await fetch(site.base+'/api/me.php',{headers:{Cookie:cookie}})).json();assert.equal(me.authenticated,false);
    const wrong=await post('/api/auth/email-login.php',{email:'practice-test@example.com',password:'wrong'});assert.equal(wrong.status,401);
    const login=await post('/api/auth/email-login.php',{email:'practice-test@example.com',password:'riffkiller-test-password'});assert.equal(login.status,200);assert.equal((await login.json()).user.id,user.id);
});
test('invalid or overlapping segment saves leave the store unchanged',async()=>{
    const original=fs.readFileSync(path.join(site.dir,'data/riffs.json'),'utf8');const riff=JSON.parse(original)[0];
    for(const segments of [[{start:2,end:1}],[{start:0,end:2},{start:1,end:3}],[{start:-1,end:1}]]) {
        const response=await post('/api/riffs/save.php',{riff:{...riff,segments}},admin);assert.equal(response.status,400);
        assert.equal(fs.readFileSync(path.join(site.dir,'data/riffs.json'),'utf8'),original);
    }
});
test('save and reload preserve DNA, segment metadata and unknown fields; stale saves conflict',async()=>{
    const list=await (await fetch(site.base+'/api/riffs/list.php')).json();const original=list[0];
    const edited={...original,privateLessonNote:'preserve me',segments:original.segments.map((s,i)=>({...s,name:i===0?'Edited segment':s.name,customTag:'keep'}))};
    let response=await post('/api/riffs/save.php',{riff:edited,expectedRiff:original},admin);assert.equal(response.status,200);
    const saved=(await response.json()).riff;assert.equal(saved.dna.atoms.length,4);assert.equal(saved.segments[0].customTag,'keep');
    const {privateLessonNote,...partial}=saved;
    response=await post('/api/riffs/save.php',{riff:partial,expectedRiff:saved},admin);assert.equal(response.status,200);assert.equal((await response.json()).riff.privateLessonNote,'preserve me');
    response=await post('/api/riffs/save.php',{riff:original,expectedRiff:original},admin);assert.equal(response.status,409);
    const reloaded=(await (await fetch(site.base+'/api/riffs/list.php')).json())[0];assert.equal(reloaded.segments[0].name,'Edited segment');assert.equal(reloaded.segments[0].tabImage,original.segments[0].tabImage);
});
test('a draft without video and a hidden riff stay in the admin list only and do not fill collections',async()=>{
    const store=path.join(site.dir,'data/riffs.json'),original=fs.readFileSync(store);
    try {
        const before=await (await fetch(site.base+'/api/collections/list.php')).json();
        let response=await post('/api/riffs/save.php',{riff:{song:'Paranoid',artist:'Black Sabbath',difficulty:'intermediate',genre:'metal',isFree:false,hidden:true,videoFile:'',videoFileRight:'',thumbnail:'assets/img/riff-1.png',segments:[],collectionIds:[3]}},admin);
        assert.equal(response.status,200);const draft=(await response.json()).riff;assert.equal(draft.duration,0);
        const hidden={...JSON.parse(original)[0]};hidden.hidden=true;
        response=await post('/api/riffs/save.php',{riff:hidden,expectedRiff:JSON.parse(original)[0]},admin);assert.equal(response.status,200);
        const ids=list=>list.map(r=>r.id);
        const pub=await (await fetch(site.base+'/api/riffs/list.php')).json();
        assert.ok(!ids(pub).includes(draft.id)&&!ids(pub).includes(hidden.id),'public list has no draft and no hidden riff');
        assert.ok(!ids(await (await fetch(site.base+'/api/riffs/list.php?raw=1')).json()).includes(draft.id),'raw list without admin sign-in has no draft');
        const raw=await (await fetch(site.base+'/api/riffs/list.php?raw=1',{headers:{Cookie:admin}})).json();
        assert.ok(ids(raw).includes(draft.id)&&ids(raw).includes(hidden.id),'the admin sees both');
        const after=await (await fetch(site.base+'/api/collections/list.php')).json();
        assert.equal(after.find(c=>c.id===3).videoCount,before.find(c=>c.id===3).videoCount,'a draft does not fill its collection');
        for(const c of after)assert.ok(!c.riffs.includes(draft.id)&&!c.riffs.includes(hidden.id));
    } finally { fs.writeFileSync(store,original); }
});
test('the range endpoint returns bytes for seeking and rejects out-of-range requests',async()=>{
    const riff=(await (await fetch(site.base+'/api/riffs/list.php')).json())[0];
    const response=await fetch(site.base+'/video.php?file='+encodeURIComponent(riff.videoFile),{headers:{Range:'bytes=10-29'}});
    assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,20);assert.match(response.headers.get('content-range'),/^bytes 10-29\//);
    const bad=await fetch(site.base+'/video.php?file='+encodeURIComponent(riff.videoFile),{headers:{Range:'bytes=999999999-'}});assert.equal(bad.status,416);
});
test('practice progress is saved per account and refused without a session',async()=>{
    const P=require('../js/rk-progress.js');
    assert.deepEqual(await (await fetch(site.base+'/api/progress.php')).json(),{success:true,authenticated:false});
    const state=P.empty();P.markClean(state,1,[{start:0,end:2}],0,1,Date.now());P.addPlayTime(state,1,320,Date.now());
    assert.equal((await post('/api/progress.php',{progress:state})).status,401);
    const reg=async email=>{const r=await post('/api/auth/email-register.php',{consent:true,email,password:'riffkiller-test-password',name:'P'});return r.headers.getSetCookie().at(-1).split(';')[0];};
    const a=await reg('progress-a@example.com'),b=await reg('progress-b@example.com');
    assert.deepEqual((await (await fetch(site.base+'/api/progress.php',{headers:{Cookie:a}})).json()).progress,null);
    assert.equal((await post('/api/progress.php',{progress:{v:1}},a)).status,400);
    assert.equal((await post('/api/progress.php',{progress:state},a)).status,200);
    const got=(await (await fetch(site.base+'/api/progress.php',{headers:{Cookie:a}})).json()).progress;
    assert.deepEqual(P.normalize(got),P.normalize(state));
    assert.equal((await (await fetch(site.base+'/api/progress.php',{headers:{Cookie:b}})).json()).progress,null,'another account sees nothing');
    const big='x'.repeat(600*1024);
    assert.equal((await post('/api/progress.php',{progress:{...state,pad:big}},a)).status,413);
});
test('locked riffs, teaser links and the one-time data migration',async()=>{
    const file=path.join(site.dir,'data/riffs.json');const original=fs.readFileSync(file,'utf8');
    try {
        const raw=await (await fetch(site.base+'/api/riffs/list.php?raw=1',{headers:{Cookie:admin}})).json();
        const riff=raw.find(r=>r.id===2);
        let response=await post('/api/riffs/save.php',{riff:{...riff,lock:'later'}},admin);assert.equal(response.status,400,'unknown lock reason');
        response=await post('/api/riffs/save.php',{riff:{...riff,dropKey:'Bad key!'}},admin);assert.equal(response.status,400,'bad link');
        response=await post('/api/riffs/save.php',{riff:{...riff,lock:'soon',dropKey:'Satisfaction'},expectedRiff:riff},admin);assert.equal(response.status,200);
        const other=raw.find(r=>r.id===6);
        response=await post('/api/riffs/save.php',{riff:{...other,dropKey:'satisfaction'}},admin);assert.equal(response.status,400,'link used twice');
        const pub=await (await fetch(site.base+'/api/riffs/list.php')).json();const saved=pub.find(r=>r.id===2);
        assert.equal(saved.lock,'soon');assert.equal(saved.dropKey,undefined,'visitors never see the links');assert.equal(saved.adminView,undefined);
        const asAdmin=(await (await fetch(site.base+'/api/riffs/list.php',{headers:{Cookie:admin}})).json()).find(r=>r.id===2);
        assert.equal(asAdmin.adminView,true);assert.equal(asAdmin.dropKey,'satisfaction');
        const ok=await (await fetch(site.base+'/api/riffs/drop.php?k=satisfaction')).json();assert.equal(ok.riffId,2);
        assert.equal((await fetch(site.base+'/api/riffs/drop.php?k=nope')).status,404);
        const go=await fetch(site.base+'/drop/?r=satisfaction',{redirect:'manual'});assert.equal(go.status,302);
        assert.equal(go.headers.get('location'),'/practice.html?riff=2&drop=satisfaction');
        assert.equal((await fetch(site.base+'/drop/?r=nope',{redirect:'manual'})).headers.get('location'),'/index.html');
        assert.equal((await post('/api/riffs/drop.php',{k:'satisfaction',event:'signup'})).status,200);
        assert.equal((await fetch(site.base+'/api/riffs/drop.php?stats=1')).status,403,'stats are for the admin');
        const stats=(await (await fetch(site.base+'/api/riffs/drop.php?stats=1',{headers:{Cookie:admin}})).json()).stats;
        assert.deepEqual([stats.satisfaction.opens,stats.satisfaction.signups],[1,1]);
    } finally {fs.writeFileSync(file,original);}
    const {execFileSync}=require('node:child_process');
    const out=execFileSync('php',[path.join(site.dir,'config/data-migrate-cli.php'),site.dir]).toString();
    assert.match(out,/2026-10-30-lock-soon/);
    const after=JSON.parse(fs.readFileSync(file,'utf8'));
    for(const r of after) assert.deepEqual([r.lock,r.isFree],r.song==='Black Dog'?['',r.isFree]:['soon',false],r.song);
    assert.equal(execFileSync('php',[path.join(site.dir,'config/data-migrate-cli.php'),site.dir]).toString(),'','runs once');
    fs.writeFileSync(file,original);fs.rmSync(path.join(site.dir,'data/migrations.json'));
});
