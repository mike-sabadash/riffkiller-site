const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const zlib=require('node:zlib');
const {startSite}=require('./site-fixture.cjs');
const alphaTab=require('../js/vendor/alphatab/alphaTab.min.js');
const TabListing=require('../js/tab-listing.js');

// Fake OpenRouter: records requests and answers with whatever the test queued.
const calls=[];let replies=[];
const mock=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
    calls.push({headers:req.headers,body:JSON.parse(body)});
    const [status,payload]=replies.shift()||[500,{error:{message:'no reply queued'}}];
    res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(payload));
});});
let site,custom,noKey,admin;
before(async()=>{
    await new Promise(r=>mock.listen(0,'127.0.0.1',r));
    const base='http://127.0.0.1:'+mock.address().port+'/api/v1';
    site=await startSite({env:'OPENROUTER_API_KEY=test-key\nOPENROUTER_BASE_URL='+base+'\n'});
    custom=await startSite({env:'OPENROUTER_API_KEY=test-key\nOPENROUTER_BASE_URL='+base+'\nTAB_AI_MODEL=some/vision-model\n'});
    noKey=await startSite();
    admin=await site.adminCookie();
});
after(()=>{site?.stop();custom?.stop();noKey?.stop();mock.close();});

// A real (tiny, grey) PNG, as the browser sends it.
function png(w=120,h=60){
    const crc=b=>{let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}let x=0xffffffff;for(const v of b)x=t[(x^v)&255]^(x>>>8);return (x^0xffffffff)>>>0;};
    const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c]);};
    const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=0;
    const raw=Buffer.alloc((w+1)*h);for(let i=0;i<raw.length;i++)raw[i]=(i*37)%251;for(let y=0;y<h;y++)raw[y*(w+1)]=0;
    return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
const IMAGE=png();
const riff={song:'Black Dog',artist:'Led Zeppelin'};
const post=(s,body,cookie)=>fetch(s.base+'/api/riffs/tab-draft.php',{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
async function run(s,body,cookie){
    const started=await post(s,body,cookie);
    const first=await started.json();
    if(!first.job)return {status:started.status,body:first};
    const r=await fetch(s.base+'/api/riffs/tab-draft.php?job='+first.job,{headers:{Cookie:cookie}});
    return {status:r.status,body:await r.json()};
}
const answer=text=>[200,{model:'anthropic/claude-opus-5.5',choices:[{message:{content:text}}]}];
const TEX='\\tempo 164\n.\n\\ts 4 4 3.5.8 5.5.8 (2.4 0.5).4{d} r.4 r.8 |';

test('only the signed-in admin can ask; without OPENROUTER_API_KEY a clear message',async()=>{
    assert.equal((await post(site,{pass:'read',image:IMAGE,riff})).status,403);
    const r=await post(noKey,{pass:'read',image:IMAGE,riff},await noKey.adminCookie());
    assert.equal(r.status,503);assert.match((await r.json()).error,/OPENROUTER_API_KEY/);
});

test('only a real PNG, JPEG or WebP image is sent on',async()=>{
    for(const image of ['', 'data:image/png;base64,AAAA', 'data:text/html;base64,PGgxPg==', 'https://example.com/tab.png']){
        const r=await post(site,{pass:'read',image,riff},admin);
        assert.equal(r.status,400,image);
    }
    assert.equal(calls.length,0);
});

test('read: the rules and the Black Dog example go with the screenshot to the tab model',async()=>{
    calls.length=0;
    replies=[answer('Here it is:\n```alphatex\n'+TEX+'\n```\nDOUBTS:\n- Bar 1: the 3 could be a 5, chose 3 as in bar 4\n')];
    const {status,body}=await run(site,{pass:'read',image:IMAGE,riff,notes:'Only the last phrase'},admin);
    assert.equal(status,200,JSON.stringify(body));
    assert.equal(body.tex,TEX);
    assert.deepEqual(body.doubts,['Bar 1: the 3 could be a 5, chose 3 as in bar 4']);
    assert.deepEqual(body.changes,[]);
    assert.equal(body.model,'anthropic/claude-opus-5.5');
    const req=calls[0].body;
    assert.equal(req.model,'anthropic/claude-opus-5.5','the default is the model Claude uses in chat');
    assert.equal(req.temperature,0);
    assert.equal(calls[0].headers.authorization,'Bearer test-key');
    const system=req.messages[0].content;
    assert.match(system,/RiffKiller tab transcription rules/);
    assert.match(system,/Crossed-out notes/);
    assert.ok(system.includes(fs.readFileSync(path.join(__dirname,'../content/tabs/led-zeppelin/black-dog.tex'),'utf8').trim()),'the house-style example');
    assert.doesNotMatch(system,/<!--/);
    const [text,image]=req.messages[1].content;
    assert.match(text.text,/Led Zeppelin — Black Dog/);assert.match(text.text,/Only the last phrase/);
    assert.equal(image.type,'image_url');assert.equal(image.image_url.url,IMAGE);
});

test('TAB_AI_MODEL picks another model for the tabs only',async()=>{
    calls.length=0;
    replies=[answer('```\n'+TEX+'\n```\nDOUBTS: none')];
    const {status,body}=await run(custom,{pass:'read',image:IMAGE,riff},await custom.adminCookie());
    assert.equal(status,200);assert.equal(calls[0].body.model,'some/vision-model');assert.deepEqual(body.doubts,[]);
});

test('check: the model gets its tab read back and the parser problems, and returns the fix',async()=>{
    calls.length=0;
    replies=[answer('```alphatex\n'+TEX+'\n```\nCHANGES:\n- Bar 1: added the rest that fills the bar\nDOUBTS: none\n')];
    const {status,body}=await run(site,{pass:'check',image:IMAGE,riff,tex:'\\tempo 164\n.\n3.5.8 5.5.8 |',listing:'Bar 1 (4/4): 3.5 eighth, 5.5 eighth',problems:['Bar 1 (4/4) holds 2.00 eighths of 8.00.']},admin);
    assert.equal(status,200);
    assert.deepEqual(body.changes,['Bar 1: added the rest that fills the bar']);assert.deepEqual(body.doubts,[]);
    const text=calls[0].body.messages[1].content[0].text;
    assert.match(text,/Check the tab you typed/);assert.match(text,/3\.5\.8 5\.5\.8/);
    assert.match(text,/Bar 1 \(4\/4\): 3\.5 eighth/);assert.match(text,/holds 2\.00 eighths/);
    assert.equal((await post(site,{pass:'check',image:IMAGE,riff,tex:''},admin)).status,400,'nothing to check');
});

test('an answer without a tab or an OpenRouter error becomes a plain message',async()=>{
    replies=[answer('I cannot read this image.')];
    let r=await run(site,{pass:'read',image:IMAGE,riff},admin);
    assert.equal(r.status,502);assert.match(r.body.error,/alphaTex/);assert.equal(r.body.raw,'I cannot read this image.');
    replies=[[402,{error:{message:'Insufficient credits'}}]];
    r=await run(site,{pass:'read',image:IMAGE,riff},admin);
    assert.match(r.body.error,/баланса/);
});

test('the tab reads back bar by bar with strings counted like alphaTex, and short bars are flagged',()=>{
    const bd=alphaTab.importer.ScoreLoader.loadAlphaTex(fs.readFileSync(path.join(__dirname,'../content/tabs/led-zeppelin/black-dog.tex'),'utf8'));
    const back=TabListing.describe(bd,0);
    assert.equal(back.bars,13);assert.deepEqual(back.problems,[]);
    assert.match(back.text,/Bar 1 \(3\/4\): rest eighth, 7\.5 eighth, 5\.4 eighth/);
    assert.match(back.text,/5\.3 \(bend\) quarter/);assert.match(back.text,/\(hammer\/pull\) eighth \(3:2 tuplet\)/);
    assert.match(back.text,/Bar 13 \(4\/4\): 3\.5 eighth, 5\.5 eighth, chord \[2\.4 \+ 0\.5\] dotted quarter/);
    const short=alphaTab.importer.ScoreLoader.loadAlphaTex('\\tempo 120\n.\n5.3.4 7.3.4 |');
    assert.deepEqual(TabListing.describe(short,0).problems,['Bar 1 (4/4) holds 4.00 eighths of 8.00.']);
});

test('the example in the rules is valid alphaTex',()=>{
    const rules=fs.readFileSync(path.join(__dirname,'../config/tab-ai-rules.txt'),'utf8');
    const block=rules.match(/```\n(\\title[\s\S]*?)```/)[1];
    const score=alphaTab.importer.ScoreLoader.loadAlphaTex(block);
    assert.deepEqual(TabListing.describe(score,0).problems,[]);
});
