const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {startSite}=require('./site-fixture.cjs');
let site;
before(async()=>{site=await startSite()});after(()=>site?.stop());
async function post(url,data,cookie='') {return fetch(site.base+url,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});}
function upload(name,filePath,cookie='') {const form=new FormData();form.append('file',new Blob(['<?php echo 1;']),name);form.append('path',filePath);return fetch(site.base+'/api/upload.php',{method:'POST',headers:{Cookie:cookie},body:form});}

test('video.php serves only videos under assets/video, never secrets, data or source',async()=>{
    fs.writeFileSync(path.join(site.dir,'data/users.json'),'[]');
    for(const file of ['.env','data/users.json','config/load-env.php','api/me.php','assets/video/../../.env'])
        assert.equal((await fetch(site.base+'/video.php?file='+encodeURIComponent(file))).status,404,file);
});
test('debug and secret files are gone from the site',async()=>{
    for(const file of ['test.php','env-check.php','patreon-secrets.php'])
        assert.equal(fs.existsSync(path.join(site.dir,file)),false,file);
});
test('catalog editing and uploads require the admin session',async()=>{
    const original=fs.readFileSync(path.join(site.dir,'data/riffs.json'),'utf8');
    const riff=JSON.parse(original)[0];
    for(const [url,body] of [['/api/riffs/save.php',{riff}],['/api/riffs/delete.php',{id:riff.id}],['/api/riffs/reorder.php',{order:[riff.id]}],['/api/collections/save.php',{collection:{name:'x'}}],['/api/collections/delete.php',{id:1}]])
        assert.equal((await post(url,body)).status,403,url);
    assert.equal((await upload('a.png','assets/img/a.png')).status,403);
    assert.equal(fs.readFileSync(path.join(site.dir,'data/riffs.json'),'utf8'),original);
});
test('admin uploads accept media under assets/ only',async()=>{
    const admin=await site.adminCookie();
    for(const target of ['shell.php','assets/shell.php','assets/x.svg','assets/img/x.png.php','index.html','assets/../x.png'])
        assert.equal((await upload('x',target,admin)).status,400,target);
    assert.equal(fs.existsSync(path.join(site.dir,'shell.php')),false);
    const ok=await upload('cover.png','assets/img/security-test.png',admin);assert.equal(ok.status,200);
    assert.ok(fs.existsSync(path.join(site.dir,'assets/img/security-test.png')));
    fs.rmSync(path.join(site.dir,'assets/img/security-test.png'));
    for(const target of ['assets/img/riff.gp','assets/tabs/x.xml','assets/tabs/x.musicxml','assets/tabs/x.gp.php'])
        assert.equal((await upload('x',target,admin)).status,400,target);
    const tab=await upload('riff.gp','assets/tabs/security-test/riff.gp',admin);assert.equal(tab.status,200);
    fs.rmSync(path.join(site.dir,'assets/tabs/security-test'),{recursive:true});
});
test('subscriptions cannot be granted without the server secret; test accounts need the admin',async()=>{
    const grant=await post('/api/subscription/update.php',{user_id:'u_attacker',status:'active',source:'patreon'});
    assert.equal(grant.status,403);assert.equal(fs.existsSync(path.join(site.dir,'data/subscriptions/u_attacker.json')),false);
    // The fixture runs on 127.0.0.1, which the old Host-header check treated as trusted.
    assert.equal((await fetch(site.base+'/api/create-test-account.php')).status,403);
    const admin=await site.adminCookie();
    const created=await (await fetch(site.base+'/api/create-test-account.php',{headers:{Cookie:admin}})).json();assert.equal(created.success,true);
});
