const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {startSite}=require('./site-fixture.cjs');
let site,admin,source;
before(async()=>{
    site=await startSite();admin=await site.adminCookie();
    // A wide "one camera" recording: 640x240 with sound, 3 s.
    source=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'rk-crop-')),'take.mp4');
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=640x240:rate=30','-f','lavfi','-i','sine=frequency=440','-t','3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',source]);
});
after(()=>site?.stop());
function chunk(fields,blob,cookie=admin){const form=new FormData();for(const [k,v] of Object.entries(fields))form.append(k,String(v));form.append('chunk',blob,'part');return fetch(site.base+'/api/admin/upload-chunk.php',{method:'POST',headers:{Cookie:cookie},body:form});}
async function uploadInChunks(target,size=40000){
    const bytes=fs.readFileSync(source);const total=Math.ceil(bytes.length/size);const uploadId='ab'.repeat(12);let last;
    for(let i=0;i<total;i++){const r=await chunk({uploadId,index:i,total,path:target},new Blob([bytes.subarray(i*size,(i+1)*size)]));assert.equal(r.status,200);last=await r.json();}
    return last;
}
const probe=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_type,width,height,nb_read_frames:format=duration','-of','json',file]));

test('chunked upload needs the admin, keeps order and never overwrites an existing video',async()=>{
    assert.equal((await chunk({uploadId:'cd'.repeat(12),index:0,total:1,path:'assets/video/a/b/x.mp4'},new Blob(['x']),'')).status,403);
    for(const bad of ['assets/video/../x.mp4','assets/img/x.mp4','assets/video/x.php','data/x.mp4'])
        assert.equal((await chunk({uploadId:'cd'.repeat(12),index:0,total:1,path:bad},new Blob(['x']))).status,400,bad);
    assert.equal((await chunk({uploadId:'ef'.repeat(12),index:1,total:2,path:'assets/video/t/t/x.mp4'},new Blob(['x']))).status,409);
    const first=await uploadInChunks('assets/video/test-artist/test-song/source.mp4');
    assert.deepEqual(first,{success:true,done:true,path:'assets/video/test-artist/test-song/source.mp4'});
    assert.equal(fs.readFileSync(path.join(site.dir,first.path)).equals(fs.readFileSync(source)),true);
    const second=await uploadInChunks('assets/video/test-artist/test-song/source.mp4');
    assert.equal(second.path,'assets/video/test-artist/test-song/source-2.mp4');
});

test('one recording becomes two synchronized camera videos with the chosen frames',async()=>{
    const target='assets/video/crop-artist/crop-song/take.mp4';
    fs.mkdirSync(path.dirname(path.join(site.dir,target)),{recursive:true});fs.copyFileSync(source,path.join(site.dir,target));
    const post=body=>fetch(site.base+'/api/admin/crop-video.php',{method:'POST',headers:{'Content-Type':'application/json',Cookie:admin},body:JSON.stringify(body)});
    assert.equal((await post({source:target,song:'Crop Song',left:{x:600,y:0,w:200,h:200},right:{x:0,y:0,w:10,h:10}})).status,400);
    const start=await post({source:target,song:'Crop Song',left:{x:0,y:0,w:320,h:180},right:{x:321,y:40,w:319,h:200}});
    assert.equal(start.status,200);const {job,width,height}=await start.json();assert.equal(width,640);assert.equal(height,240);
    let state;
    for(let i=0;i<200;i++){state=await (await fetch(site.base+'/api/admin/crop-video.php?job='+job,{headers:{Cookie:admin}})).json();if(state.state!=='running')break;await new Promise(r=>setTimeout(r,100));}
    assert.equal(state.state,'done',state.error);
    assert.deepEqual(state.outputs,{left:'assets/video/crop-artist/crop-song/crop-song-left.mp4',right:'assets/video/crop-artist/crop-song/crop-song-right.mp4'});
    const left=probe(path.join(site.dir,state.outputs.left)),right=probe(path.join(site.dir,state.outputs.right));
    const v=p=>p.streams.find(s=>s.codec_type==='video');
    assert.deepEqual([v(left).width,v(left).height],[320,180]);
    assert.deepEqual([v(right).width,v(right).height],[318,200]);
    assert.equal(v(left).nb_read_frames,v(right).nb_read_frames);
    assert.ok(left.streams.some(s=>s.codec_type==='audio'));
    assert.ok(Math.abs(Number(left.format.duration)-Number(right.format.duration))<0.05);
    // Keyframes every 0.5 s so seeks in practice stay cheap on phones.
    for(const out of [state.outputs.left,state.outputs.right]){
        const keys=execFileSync('ffprobe',['-v','error','-select_streams','v','-skip_frame','nokey','-show_entries','frame=pts_time','-of','csv=p=0',path.join(site.dir,out)]).toString().trim().split('\n').map(parseFloat);
        assert.ok(keys.length>=6,out+': '+keys.length+' keyframes');
        for(let i=1;i<keys.length;i++)assert.ok(keys[i]-keys[i-1]<=0.55,out+' gap at '+keys[i]);
    }
    // A second run keeps the first pair and writes next to it.
    const again=await (await post({source:target,song:'Crop Song',left:{x:0,y:0,w:320,h:180},right:{x:320,y:0,w:320,h:180}})).json();
    for(let i=0;i<200;i++){state=await (await fetch(site.base+'/api/admin/crop-video.php?job='+again.job,{headers:{Cookie:admin}})).json();if(state.state!=='running')break;await new Promise(r=>setTimeout(r,100));}
    assert.equal(state.outputs.left,'assets/video/crop-artist/crop-song/crop-song-left-2.mp4');
});
