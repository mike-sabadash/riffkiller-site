const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {startSite}=require('./site-fixture.cjs');
let site,admin;
before(async()=>{site=await startSite();admin=await site.adminCookie()});after(()=>site?.stop());
async function post(url,data,cookie='') {return fetch(site.base+url,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});}
test('ordinary email sign-up, reload, logout and login use the server session',async()=>{
    const reg=await post('/api/auth/email-register.php',{email:'practice-test@example.com',password:'riffkiller-test-password',name:'Practice Test'});
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
test('the range endpoint returns bytes for seeking and rejects out-of-range requests',async()=>{
    const riff=(await (await fetch(site.base+'/api/riffs/list.php')).json())[0];
    const response=await fetch(site.base+'/video.php?file='+encodeURIComponent(riff.videoFile),{headers:{Range:'bytes=10-29'}});
    assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,20);assert.match(response.headers.get('content-range'),/^bytes 10-29\//);
    const bad=await fetch(site.base+'/video.php?file='+encodeURIComponent(riff.videoFile),{headers:{Range:'bytes=999999999-'}});assert.equal(bad.status,416);
});
