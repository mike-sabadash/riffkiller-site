const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const php=(dir,code)=>execFileSync('php',['-r','chdir('+JSON.stringify(dir)+'); require "config/video-parts.php"; '+code],{encoding:'utf8'});
const probe=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,width,nb_frames,duration:format=duration','-of','json',file]));
test('each part is its own video with the sound inside, cut on frame edges, picture and sound equally long; offered only while it matches',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rk-parts-'));
    fs.cpSync(path.join(root,'config'),path.join(dir,'config'),{recursive:true});
    fs.mkdirSync(path.join(dir,'data'));fs.mkdirSync(path.join(dir,'assets/video/a/b'),{recursive:true});
    fs.writeFileSync(path.join(dir,'.env'),'');
    const make=(name,color)=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c='+color+':size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440',
        '-t','3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(dir,'assets/video/a/b',name)]);
    make('p-left.mp4','red');make('p-right.mp4','blue');
    const riff={id:5,song:'P',videoFile:'assets/video/a/b/p-left.mp4',videoFileRight:'assets/video/a/b/p-right.mp4',segments:[{start:0,end:1.21},{start:1.21,end:2.5}]};
    const save=r=>fs.writeFileSync(path.join(dir,'data/riffs.json'),JSON.stringify([r]));
    save(riff);
    const offered=()=>JSON.parse(php(dir,'echo json_encode(video_parts_offer(json_decode(file_get_contents("data/riffs.json"),true)[0]));')).partClips;
    assert.equal(offered(),undefined,'nothing offered before it is built');
    const out=execFileSync('php',[path.join(dir,'config/video-parts-cli.php'),'--all'],{encoding:'utf8'});
    assert.match(out,/built 2 parts × 3 views/);
    const clips=offered();
    assert.deepEqual(Object.keys(clips).sort(),['left','right','split']);
    assert.equal(clips.left.length,2);
    // Part 2: 1.21 s → frame 36, 2.5 s → frame 75: 39 frames, 1.3 s of picture and of sound.
    for(const view of ['left','right','split']){
        const info=probe(path.join(dir,clips[view][1]));
        const v=info.streams.find(s=>s.codec_type==='video'),a=info.streams.find(s=>s.codec_type==='audio');
        assert.ok(a,'sound inside '+view);
        assert.equal(Number(v.nb_frames),39,view+' frames');
        assert.ok(Math.abs(Number(a.duration)-1.3)<0.03,view+' sound '+a.duration);
    }
    assert.equal(probe(path.join(dir,clips.split[0])).streams.find(s=>s.codec_type==='video').width,1280);
    // Right view shows the right camera (blue).
    const px=file=>[...execFileSync('ffmpeg',['-v','error','-i',file,'-vf','crop=2:2:300:300','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])];
    const [r,,b]=px(path.join(dir,clips.right[0]));assert.ok(b>150&&r<80,'right camera '+[r,b]);
    assert.match(execFileSync('php',[path.join(dir,'config/video-parts-cli.php'),'--riff','5'],{encoding:'utf8'}),/up to date/);
    // Part times changed: not offered until rebuilt; the rebuild removes the old files.
    save({...riff,segments:[{start:0,end:1.5},{start:1.5,end:2.5}]});
    assert.equal(offered(),undefined);
    execFileSync('php',[path.join(dir,'config/video-parts-cli.php'),'--all']);
    const again=offered();assert.ok(again&&again.left[0]!==clips.left[0]);
    assert.ok(!fs.existsSync(path.join(dir,clips.left[0])),'old part video removed');
    fs.rmSync(dir,{recursive:true,force:true});
});
