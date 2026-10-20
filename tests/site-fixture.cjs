const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn,execFileSync} = require('node:child_process');
const net = require('node:net');
const root = path.resolve(__dirname,'..');
async function startSite(options = {}) {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'riffkiller-test-'));
    for (const name of ['api','admin','config','js','css']) fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});
    for (const name of fs.readdirSync(root).filter(n=>/\.(html|php)$/.test(n))) fs.copyFileSync(path.join(root,name),path.join(dir,name));
    fs.mkdirSync(path.join(dir,'data'));fs.mkdirSync(path.join(dir,'sessions'));
    if (options.google) {
        fs.writeFileSync(path.join(dir,'.env'),'GOOGLE_CLIENT_ID=fixture.apps.googleusercontent.com\nGOOGLE_CLIENT_SECRET=fixture-secret\n');
        fs.copyFileSync(path.join(__dirname,'google-provider.fixture.php'),path.join(dir,'google-provider.fixture.php'));
    }
    for (const name of ['riffs.json','collections.json']) fs.copyFileSync(path.join(root,'data',name),path.join(dir,'data',name));
    const riffs=JSON.parse(fs.readFileSync(path.join(dir,'data/riffs.json')));
    const videos=[...new Set(riffs.flatMap(r=>[r.videoFile,r.videoFileRight,r.lessonVideo]).filter(Boolean))];
    const realMedia=videos.every(name=>fs.existsSync(path.join(root,name)));
    if (realMedia) fs.symlinkSync(path.join(root,'assets'),path.join(dir,'assets'),'dir');
    else {
        if(fs.existsSync(path.join(root,'assets')))fs.cpSync(path.join(root,'assets'),path.join(dir,'assets'),{recursive:true});
        for (const name of videos) {
            const dest=path.join(dir,name);
            // Keep any available original recordings; synthesize only absent CI media.
            if (fs.existsSync(dest)) continue;
            fs.mkdirSync(path.dirname(dest),{recursive:true});
            execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=192x108:rate=30','-t','18.57','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',dest]);
        }
    }
    fs.writeFileSync(path.join(dir,'router.php'),`<?php
$url = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_ends_with($url, '.mp4')) { $_GET['file'] = ltrim($url, '/'); require __DIR__ . '/video.php'; return true; }
return false;
`);
    const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
    let log='';
    const server=spawn(process.env.PHP_BIN||'php',['-d','session.save_path='+path.join(dir,'sessions'),...(options.google?['-d','auto_prepend_file='+path.join(dir,'google-provider.fixture.php')]:[]),'-S','127.0.0.1:'+port,'-t',dir,path.join(dir,'router.php')],{stdio:['ignore','ignore','pipe']});
    server.stderr.on('data',data=>{log+=data});server.on('error',error=>{log+=error.message});
    const base='http://127.0.0.1:'+port;
    for(let i=0;i<100;i++) {
        try {if((await fetch(base+'/api/me.php')).ok)return {base,dir,realMedia,log:()=>log,stop:()=>{server.kill();fs.rmSync(dir,{recursive:true,force:true});}};}catch{}
        await new Promise(r=>setTimeout(r,50));
    }
    server.kill();throw new Error('PHP test server did not start: '+log);
}
module.exports={startSite};

