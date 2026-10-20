const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {startSite}=require('./site-fixture.cjs');
let site;
before(async()=>{site=await startSite({google:true})});after(()=>site?.stop());
function cookie(response){return response.headers.getSetCookie().at(-1)?.split(';')[0]||''}
async function begin(){const response=await fetch(site.base+'/api/auth/google-login.php?state=attacker',{redirect:'manual'});assert.equal(response.status,302);return {response,url:new URL(response.headers.get('location')),cookie:cookie(response)}}
async function finish(attempt,code='valid',state=attempt.url.searchParams.get('state')){return fetch(site.base+'/api/auth/google-callback.php?'+new URLSearchParams({code,state}),{headers:{Cookie:attempt.cookie},redirect:'manual'})}
test('Google uses a server session, a unique state and PKCE; rejected callbacks never reach the provider',async()=>{
 const a=await begin();assert.equal(a.url.origin,'https://accounts.google.com');assert.notEqual(a.url.searchParams.get('state'),'attacker');assert.equal(a.url.searchParams.get('state').length,64);assert.equal(a.url.searchParams.get('redirect_uri'),site.base+'/api/auth/google-callback.php');assert.equal(a.url.searchParams.get('code_challenge_method'),'S256');assert.equal(a.url.searchParams.has('client_secret'),false);
 const bad=await finish(a,'valid','wrong-state');assert.match(bad.headers.get('location'),/reason=state/);assert.equal(fs.existsSync(path.join(site.dir,'google-requests.jsonl')),false);
 const replay=await finish(a);assert.match(replay.headers.get('location'),/reason=state/);
});
test('verified Google sign-in links the existing Patreon/email user and preserves password, identity and subscription',async()=>{
 const registered=await fetch(site.base+'/api/auth/email-register.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'linked@example.com',password:'test-password',name:'Existing'})});assert.equal(registered.status,200);const existing=(await registered.json()).user;
 execFileSync(process.env.PHP_BIN||'php',['-r',`require ${JSON.stringify(path.join(site.dir,'config/user-store.php'))}; user_update(${JSON.stringify(existing.id)}, ['provider'=>'patreon','provider_id'=>'patreon-fixture-id']);`]);
 fs.mkdirSync(path.join(site.dir,'data/subscriptions'),{recursive:true});fs.writeFileSync(path.join(site.dir,'data/subscriptions',existing.id+'.json'),JSON.stringify({status:'active',source:'patreon',plan:'monthly',expires:Math.floor(Date.now()/1000)+3600}));
 const a=await begin();const done=await finish(a);assert.equal(done.headers.get('location'),site.base+'/app.html');assert.ok(cookie(done));assert.notEqual(cookie(done),a.cookie);
 const me=await (await fetch(site.base+'/api/me.php',{headers:{Cookie:cookie(done)}})).json();assert.equal(me.authenticated,true);assert.equal(me.user.id,existing.id);
 const users=JSON.parse(fs.readFileSync(path.join(site.dir,'data/users.json')));assert.equal(users.length,1);assert.deepEqual(users[0].identities,{patreon:'patreon-fixture-id',google:'google-fixture-user'});assert.ok(users[0].password_hash);
 const sub=await (await fetch(site.base+'/api/subscription/get.php?user_id='+existing.id,{headers:{Cookie:cookie(done)}})).json();assert.equal(sub.subscription.source,'patreon');assert.equal(sub.subscription.status,'active');
 const password=await fetch(site.base+'/api/auth/email-login.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'linked@example.com',password:'test-password'})});assert.equal(password.status,200);assert.equal((await password.json()).user.id,existing.id);
 const audit=fs.readFileSync(path.join(site.dir,'google-requests.jsonl'),'utf8').trim().split('\n').map(JSON.parse);const form=new URLSearchParams(audit[0].request.content);assert.equal(form.get('client_secret'),'fixture-secret');assert.equal(form.get('redirect_uri'),a.url.searchParams.get('redirect_uri'));assert.equal(crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url'),a.url.searchParams.get('code_challenge'));assert.match(audit[1].request.header,/Authorization: Bearer valid/);assert.equal(audit[1].url.includes('access_token'),false);
});
test('Google cancellation, failed exchange, unverified email and expired attempts leave users unchanged',async()=>{
 const original=fs.readFileSync(path.join(site.dir,'data/users.json'),'utf8');
 let a=await begin();const cancelled=await fetch(site.base+'/api/auth/google-callback.php?'+new URLSearchParams({error:'access_denied',state:a.url.searchParams.get('state')}),{headers:{Cookie:a.cookie},redirect:'manual'});assert.match(cancelled.headers.get('location'),/reason=cancelled/);
 a=await begin();let response=await finish(a,'invalid');assert.match(response.headers.get('location'),/reason=token/);
 a=await begin();response=await finish(a,'unverified');assert.match(response.headers.get('location'),/reason=identity/);
 a=await begin();const session=path.join(site.dir,'sessions/sess_'+a.cookie.split('=')[1]);let saved=fs.readFileSync(session,'utf8');saved=saved.replace(/s:7:"started";i:\d+;/,'s:7:"started";i:1;');fs.writeFileSync(session,saved);response=await finish(a);assert.match(response.headers.get('location'),/reason=state/);
 assert.equal(fs.readFileSync(path.join(site.dir,'data/users.json'),'utf8'),original);
});
