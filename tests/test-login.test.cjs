const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {startSite}=require('./site-fixture.cjs');
let site;
before(async()=>{site=await startSite()});after(()=>site?.stop());
async function createLink(){
    const r=await fetch(site.base+'/admin/index.php',{method:'POST',headers:{Cookie:await site.adminCookie()},body:new URLSearchParams({action:'create_test'})});
    const data=await r.json();assert.equal(data.success,true);
    return new URL(data.login_url);
}
const login=(token,cookie='')=>fetch(site.base+'/api/test-login.php?token='+encodeURIComponent(token),{headers:{Cookie:cookie}});

test('an admin test link signs in once with premium, then stops working',async()=>{
    const url=await createLink();
    assert.equal(url.pathname,'/test-login.html');
    assert.equal((await fetch(site.base+url.pathname)).status,200);
    const r=await login(url.searchParams.get('token'));const data=await r.json();
    assert.equal(data.success,true);assert.equal(data.subscription.status,'active');
    const cookie=r.headers.getSetCookie().at(-1).split(';')[0];
    const me=await (await fetch(site.base+'/api/me.php',{headers:{Cookie:cookie}})).json();
    assert.equal(me.authenticated,true);assert.equal(me.user.id,data.user.id);
    assert.equal((await (await login(url.searchParams.get('token'))).json()).success,false);
});
test('test links expire after a day',async()=>{
    const token=(await createLink()).searchParams.get('token');
    const file=path.join(site.dir,'data/test_accounts.json');
    const items=JSON.parse(fs.readFileSync(file,'utf8'));
    items.find(t=>t.token===token).created_at=new Date(Date.now()-25*3600e3).toISOString();
    fs.writeFileSync(file,JSON.stringify(items));
    assert.equal((await (await login(token)).json()).success,false);
});
test('deploy installs the test login page and API, not the key-based account endpoint',()=>{
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'riffkiller-deploy-'));
    const stage=path.join(tmp,'stage'),root=path.join(tmp,'root');
    for(const f of ['practice.html','test-login.html','api/test-login.php','api/create-test-account.php','config/test-accounts.php']){
        fs.mkdirSync(path.dirname(path.join(stage,f)),{recursive:true});fs.copyFileSync(path.join(__dirname,'..',f),path.join(stage,f));
    }
    fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.writeFileSync(path.join(root,'practice.html'),'old');
    execFileSync('tar',['-czf',path.join(tmp,'release.tgz'),'-C',stage,'.']);
    execFileSync('bash',[path.join(__dirname,'../scripts/deploy-remote.sh'),'apply',path.join(tmp,'release.tgz'),'0123456789'],
        {env:{...process.env,RIFFKILLER_ROOT:root,RIFFKILLER_BACKUP_DIR:path.join(tmp,'backups')},stdio:'pipe'});
    assert.ok(fs.existsSync(path.join(root,'test-login.html')));
    assert.ok(fs.existsSync(path.join(root,'api/test-login.php')));
    assert.equal(fs.existsSync(path.join(root,'api/create-test-account.php')),false);
    fs.rmSync(tmp,{recursive:true,force:true});
});
