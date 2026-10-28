const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {startSite}=require('./site-fixture.cjs');

let site;
before(async()=>{site=await startSite();});
after(()=>site?.stop());
const post=(p,body,cookie)=>fetch(site.base+p,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
const users=()=>{const f=path.join(site.dir,'data/users.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):[];};

test('email sign-up needs the consent box and keeps what was agreed to',async()=>{
    const no=await post('/api/auth/email-register.php',{email:'noconsent@example.com',password:'secret123'});
    assert.equal(no.status,400);assert.match((await no.json()).error,/Terms/);
    assert.ok(!users().some(u=>u.email==='noconsent@example.com'));
    const ok=await post('/api/auth/email-register.php',{consent:true,email:'consent@example.com',password:'secret123'});
    assert.equal(ok.status,200);
    const u=users().find(x=>x.email==='consent@example.com');
    assert.equal(u.consent.how,'checkbox');assert.equal(u.consent.version,'2026-10-29');assert.ok(Date.parse(u.consent.at));
});

test('delete account: typed DELETE, erases user, progress and avatar, signs out',async()=>{
    const reg=await post('/api/auth/email-register.php',{consent:true,email:'leaver@example.com',password:'secret123'});
    const cookie=reg.headers.getSetCookie().at(-1).split(';')[0];
    const id=(await reg.json()).user.id;
    assert.equal((await post('/api/progress.php',{progress:{v:2,riffs:{},days:{}}},cookie)).status,200);
    const prog=path.join(site.dir,'data/progress',crypto.createHash('sha256').update(id).digest('hex')+'.json');
    assert.ok(fs.existsSync(prog));
    const av=path.join(site.dir,'uploads/avatars');fs.mkdirSync(av,{recursive:true});fs.writeFileSync(path.join(av,'avatar_'+id+'_1.png'),'x');
    assert.equal((await post('/api/profile/delete.php',{confirm:'yes'},cookie)).status,400,'needs DELETE');
    assert.equal((await post('/api/profile/delete.php',{confirm:'DELETE'})).status,401,'needs a session');
    const r=await post('/api/profile/delete.php',{confirm:'DELETE'},cookie);
    assert.equal(r.status,200);assert.equal((await r.json()).success,true);
    assert.ok(!users().some(u=>u.id===id));assert.ok(!fs.existsSync(prog));assert.ok(!fs.existsSync(path.join(av,'avatar_'+id+'_1.png')));
    const me=await (await fetch(site.base+'/api/progress.php',{headers:{Cookie:cookie}})).json();
    assert.equal(me.authenticated,false,'the session is gone');
    // The same email can sign up again from scratch.
    assert.equal((await post('/api/auth/email-register.php',{consent:true,email:'leaver@example.com',password:'secret123'})).status,200);
});

test('legal pages exist in English and Russian and are linked from the footer; no Google Fonts anywhere',()=>{
    const root=path.join(__dirname,'..');
    for(const p of ['terms.html','privacy.html','consent.html']){
        const html=fs.readFileSync(path.join(root,p),'utf8');
        assert.match(html,/data-lang="en"/,p);assert.match(html,/data-lang="ru"/,p);assert.match(html,/support@riffkiller\.fun/,p);
    }
    assert.match(fs.readFileSync(path.join(root,'privacy.html'),'utf8'),/id="cookies"/);
    for(const p of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
        const html=fs.readFileSync(path.join(root,p),'utf8');
        assert.doesNotMatch(html,/fonts\.(googleapis|gstatic)\.com/,p);
        if(html.includes('class="footer-text"'))assert.match(html,/href="terms\.html"[^>]*>Terms<\/a> <a href="privacy\.html"/,p);
    }
    assert.ok(fs.statSync(path.join(root,'assets/fonts/inter-latin-opsz-normal.woff2')).size>10000);
});
