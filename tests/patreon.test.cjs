const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {startSite}=require('./site-fixture.cjs');

const CAMPAIGN='c-riffkiller';
const future=new Date(Date.now()+20*86400e3).toISOString();
function member(campaign,{status='active_patron',cents=500,tiers=['t-paid'],user='p'}={}) {
    return {type:'member',id:'m-'+user,attributes:{patron_status:status,currently_entitled_amount_cents:cents,next_charge_date:future},
        relationships:{campaign:{data:{type:'campaign',id:campaign}},currently_entitled_tiers:{data:tiers.map(id=>({type:'tier',id}))},user:{data:{type:'user',id:user}}}};
}
function identity(id,email,verified,members) {
    return {data:{type:'user',id,attributes:{full_name:'Patron '+id,email,is_email_verified:verified,image_url:''}},included:members};
}
// Access tokens of the fake Patreon API are the fixture names below.
const identities={
    'our-paid':identity('p-paid','paid@example.com',true,[member('c-other',{status:'former_patron'}),member(CAMPAIGN,{user:'p-paid'})]),
    'other-campaign':identity('p-other','other@example.com',true,[member('c-other',{user:'p-other'})]),
    'our-free':identity('p-free','free@example.com',true,[member(CAMPAIGN,{cents:0,tiers:['t-free'],user:'p-free'})]),
    'unverified':identity('p-unverified','victim@example.com',false,[]),
};
let site,patreon,identityQueries=[];
before(async()=>{
    patreon=http.createServer((req,res)=>{
        const url=new URL(req.url,'http://patreon');let body='';req.on('data',c=>body+=c);req.on('end',()=>{
            res.setHeader('Content-Type','application/json');
            if(url.pathname==='/api/oauth2/token'){const form=new URLSearchParams(body);assert.equal(form.get('client_secret'),'fixture-secret');return res.end(JSON.stringify({access_token:form.get('code')}));}
            if(url.pathname==='/api/oauth2/v2/identity'){identityQueries.push(url.searchParams);const doc=identities[(req.headers.authorization||'').slice(7)];res.statusCode=doc?200:401;return res.end(JSON.stringify(doc||{errors:[{}]}));}
            res.statusCode=404;res.end('{}');
        });
    });
    await new Promise(r=>patreon.listen(0,'127.0.0.1',r));
    site=await startSite({env:`PATREON_CAMPAIGN_ID=${CAMPAIGN}\nPATREON_WEBHOOK_SECRET=hook-secret\nPATREON_CLIENT_ID=fixture-client\nPATREON_CLIENT_SECRET=fixture-secret\nPATREON_API_BASE=http://127.0.0.1:${patreon.address().port}\n`});
});
after(()=>{site?.stop();patreon?.close()});

const cookieOf=r=>r.headers.getSetCookie().at(-1)?.split(';')[0]||'';
async function exchange(code) {
    const r=await fetch(site.base+'/patreon-exchange.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,redirect_uri:'https://riffkiller.fun/patreon-callback.html'})});
    return {body:await r.json(),cookie:cookieOf(r)};
}
const subscriptionOf=id=>{const f=path.join(site.dir,'data/subscriptions',id+'.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null;};
function hook(event,payload,secret='hook-secret') {
    const raw=JSON.stringify(payload);
    return fetch(site.base+'/patreon-webhook.php',{method:'POST',headers:{'Content-Type':'application/json','X-Patreon-Event':event,'X-Patreon-Signature':crypto.createHmac('md5',secret).update(raw).digest('hex')},body:raw});
}

test('a paying member of our campaign gets premium until the next charge plus grace',async()=>{
    const {body,cookie}=await exchange('our-paid');
    assert.equal(body.success,true);assert.equal(body.subscription.status,'active');assert.ok(cookie);
    const sub=subscriptionOf(body.user.id);assert.equal(sub.status,'active');assert.equal(sub.source,'patreon');
    assert.ok(Math.abs(sub.expires-(Date.parse(future)/1000+3*86400))<5);
    assert.equal(identityQueries.at(-1).get('include'),'memberships,memberships.campaign,memberships.currently_entitled_tiers');
    const me=await (await fetch(site.base+'/api/me.php',{headers:{Cookie:cookie}})).json();assert.equal(me.user.id,body.user.id);
});
test('patrons of other creators and free members of our campaign do not get premium',async()=>{
    for(const code of ['other-campaign','our-free']) {
        const {body}=await exchange(code);assert.equal(body.success,true);assert.equal(body.subscription.status,'inactive',code);
        assert.equal(subscriptionOf(body.user.id).status,'inactive',code);
    }
});
test('an unverified Patreon email never signs in to an existing email account',async()=>{
    const reg=await fetch(site.base+'/api/auth/email-register.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true,email:'victim@example.com',password:'victim-password',name:'Victim'})});
    const victim=(await reg.json()).user;
    const {body}=await exchange('unverified');assert.equal(body.success,true);assert.notEqual(body.user.id,victim.id);
});
test('validation only refreshes the signed-in user linked to that Patreon account',async()=>{
    const reg=await fetch(site.base+'/api/auth/email-register.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true,email:'free-rider@example.com',password:'free-rider-password',name:'Free rider'})});
    const rider=(await reg.json()).user;const cookie=cookieOf(reg);
    const r=await fetch(site.base+'/patreon-validate.php',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({token:'our-paid',user_id:rider.id})});
    assert.equal((await r.json()).valid,true);assert.equal(subscriptionOf(rider.id),null);
});
test('webhooks need a valid signature and then follow the membership',async()=>{
    const {body}=await exchange('our-free');const id=body.user.id;assert.equal(subscriptionOf(id).status,'inactive');
    const upgraded={data:member(CAMPAIGN,{user:'p-free'}),included:[]};
    assert.equal((await hook('members:pledge:update',upgraded,'wrong-secret')).status,401);assert.equal(subscriptionOf(id).status,'inactive');
    assert.equal((await hook('members:pledge:update',upgraded)).status,200);assert.equal(subscriptionOf(id).status,'active');
    assert.equal((await hook('members:pledge:delete',{data:member(CAMPAIGN,{status:'former_patron',user:'p-free'}),included:[]})).status,200);
    assert.equal(subscriptionOf(id).status,'inactive');
});
test('tier allow-list and missing campaign configuration fail closed',()=>{
    // Isolated copy without the fixture .env, so only the given environment applies.
    const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'patreon-unit-'));fs.mkdirSync(path.join(dir,'config'));
    for(const f of ['patreon.php','load-env.php'])fs.copyFileSync(path.join(site.dir,'config',f),path.join(dir,'config',f));
    const run=(env,m)=>JSON.parse(execFileSync(process.env.PHP_BIN||'php',['-r',`require ${JSON.stringify(path.join(dir,'config/patreon.php'))}; echo json_encode(patreon_member_subscription(json_decode($argv[1], true)));`,JSON.stringify(m)],{env:{...process.env,...env},cwd:dir}));
    const paid=member(CAMPAIGN,{tiers:['t-basic']});
    assert.equal(run({PATREON_CAMPAIGN_ID:CAMPAIGN,PATREON_TIER_IDS:'t-pro, t-max'},paid).status,'inactive');
    assert.equal(run({PATREON_CAMPAIGN_ID:CAMPAIGN,PATREON_TIER_IDS:'t-pro,t-basic'},paid).status,'active');
    assert.equal(run({PATREON_CAMPAIGN_ID:''},paid).reason,'campaign_not_configured');
    fs.rmSync(dir,{recursive:true,force:true});
});
