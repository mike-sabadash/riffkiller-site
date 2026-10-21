const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {startSite}=require('./site-fixture.cjs');
const V=require('../js/riff-dna-vocab.js').RiffDNAVocab;

// Fake OpenRouter: records requests and answers with whatever the test queued.
const calls=[];let replies=[];
const mock=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
    calls.push({headers:req.headers,body:JSON.parse(body)});
    const [status,payload]=replies.shift()||[500,{error:{message:'no reply queued'}}];
    res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(payload));
});});
let site,noKey,admin,mockUrl;
before(async()=>{
    await new Promise(r=>mock.listen(0,'127.0.0.1',r));
    mockUrl='http://127.0.0.1:'+mock.address().port+'/api/v1';
    site=await startSite({env:'OPENROUTER_API_KEY=test-key\nOPENROUTER_BASE_URL='+mockUrl+'\n'});
    admin=await site.adminCookie();
    noKey=await startSite();
});
after(()=>{site?.stop();noKey?.stop();mock.close();});

const riff={song:'Black Dog',artist:'Led Zeppelin',duration:10,segments:[{start:0,end:2,name:'Shot 1',role:'',function:''},{start:2,end:4,name:'Shot 2',role:'land',function:'Lands on E'},{start:4,end:6,name:'Detail',role:'',function:''}],dna:{}};
const post=(s,body,cookie)=>fetch(s.base+'/api/riffs/dna-draft.php',{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
const answer=obj=>[200,{model:'some/model:free',choices:[{message:{content:'Here is the draft:\n```json\n'+JSON.stringify(obj)+'\n```'}}]}];

test('the server reads the same roles and techniques as the site',()=>{
    const php=JSON.parse(execFileSync('php',['-r','require "config/riff-dna-ai.php"; $v=dna_ai_vocab(); echo json_encode(["roles"=>array_keys($v["roles"]),"techniques"=>array_keys($v["techniques"])]);'],{cwd:path.resolve(__dirname,'..')}));
    assert.deepEqual(php.roles,V.roles.map(r=>r.key));
    assert.deepEqual(php.techniques,V.techniques.map(t=>t.key));
});

test('only the signed-in admin can ask for a draft',async()=>{
    assert.equal((await post(site,{riff,notes:'Guitar jumps in after the vocal'})).status,403);
});

test('without OPENROUTER_API_KEY the admin gets a clear message',async()=>{
    const r=await post(noKey,{riff,notes:'Guitar jumps in after the vocal'},await noKey.adminCookie());
    assert.equal(r.status,503);assert.match((await r.json()).error,/OPENROUTER_API_KEY/);
});

test('the draft is built from the rules and cleaned to the editor format',async()=>{
    calls.length=0;
    replies=[[400,{error:{message:'response_format is not supported by this model'}}],answer({
        segments:[{index:0,role:'launch',function:'Jumps in off balance'},{index:1,role:'fly',function:'x'},{index:7,role:'land'}],
        dna:{overview:'A conversation.',rule:'Simple cells, uneven phrase.',preserve:'The gap\nThe landing',change:['Register'],failure:'You remove the gap.',
            atoms:[{technique:'qbend',label:'5th fret',tip:'Just a nudge',time:2.5,segmentIndex:0,view:'left',speed:0.5},
                {technique:'sweep',type:'Sweep',label:'Somewhere',tip:'Fast',segmentIndex:2,view:'top',speed:3},
                {technique:'bend',label:'Lost',tip:'No segment',time:99}],
            mutation:{title:'Same spirit',steps:['Leave a gap','Land']}},
        notes:['Где вступает вокал?']
    })];
    const r=await post(site,{riff,notes:'Вокал, пауза, гитара врывается и садится на E. На 2.5 c бенд.'},admin);
    const data=await r.json();
    assert.equal(r.status,200,JSON.stringify(data));
    assert.equal(calls.length,2,'retries without response_format');
    assert.ok(calls[0].body.response_format);assert.equal(calls[1].body.response_format,undefined);
    assert.equal(calls[0].headers.authorization,'Bearer test-key');
    assert.equal(calls[0].body.model,'openrouter/free');
    const system=calls[0].body.messages[0].content;
    assert.match(system,/Riff DNA drafting rules/);assert.match(system,/- hang \(Hang\)/);assert.match(system,/- qbend: Quarter-tone bend/);
    assert.doesNotMatch(system,/<!--/);
    assert.match(calls[0].body.messages[1].content,/садится на E/);

    const d=data.draft;
    assert.deepEqual(d.segments.map(s=>[s.index,s.role]),[[0,'launch'],[1,'']],'unknown roles and indexes are dropped');
    assert.deepEqual(d.dna.preserve,['The gap','The landing']);
    assert.equal(d.dna.atoms.length,2,'an atom outside the video with no segment is dropped');
    assert.deepEqual(d.dna.atoms[0],{technique:'qbend',type:'Quarter-tone bend',label:'5th fret',tip:'Just a nudge',view:'left',speed:0.5,segmentIndex:1,time:2.5},'the time decides the segment');
    assert.equal(d.dna.atoms[1].technique,'other');assert.equal(d.dna.atoms[1].type,'Sweep');
    assert.equal(d.dna.atoms[1].view,'split');assert.equal(d.dna.atoms[1].speed,0.5);assert.equal(d.dna.atoms[1].time,undefined);
    assert.deepEqual(d.dna.mutation.steps,['Leave a gap','Land']);
    assert.deepEqual(d.notes,['Где вступает вокал?']);
    assert.equal(data.model,'some/model:free');
});

test('OpenRouter errors become plain Russian messages',async()=>{
    replies=[[429,{error:{message:'Rate limit exceeded: free-models-per-day'}}]];
    let r=await post(site,{riff,notes:'Guitar jumps in after the vocal'},admin);
    assert.equal(r.status,502);assert.match((await r.json()).error,/Лимит/);
    replies=[[404,{error:{message:'No endpoints found matching your data policy (Free model publication)'}}]];
    r=await post(site,{riff,notes:'Guitar jumps in after the vocal'},admin);
    assert.match((await r.json()).error,/settings\/privacy/);
    replies=[[200,{choices:[{message:{content:'Sorry, I cannot help.'}}]}]];
    r=await post(site,{riff,notes:'Guitar jumps in after the vocal'},admin);
    assert.match((await r.json()).error,/JSON/);
});

test('a riff without segments or description is refused before calling the model',async()=>{
    calls.length=0;
    assert.equal((await post(site,{riff:{...riff,segments:[]},notes:'Guitar jumps in'},admin)).status,400);
    assert.equal((await post(site,{riff,notes:'short'},admin)).status,400);
    assert.equal(calls.length,0);
});
