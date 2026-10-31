const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const php=(dir,code)=>execFileSync('php',['-r','chdir('+JSON.stringify(dir)+'); require "config/video-split.php"; '+code],{encoding:'utf8'});
test('Split as one video: left in full, right in a window, same length and sound; offered only while it matches the cameras',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rk-split-'));
    fs.cpSync(path.join(root,'config'),path.join(dir,'config'),{recursive:true});
    fs.mkdirSync(path.join(dir,'data'));fs.mkdirSync(path.join(dir,'assets/video/a/b'),{recursive:true});
    fs.writeFileSync(path.join(dir,'.env'),'');
    const make=(name,color)=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c='+color+':size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440',
        '-t','2.5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(dir,'assets/video/a/b',name)]);
    make('s-left.mp4','red');make('s-right.mp4','blue');
    const riff={id:3,song:'S',videoFile:'assets/video/a/b/s-left.mp4',videoFileRight:'assets/video/a/b/s-right.mp4',segments:[{start:0,end:1.2},{start:1.2,end:2.5}]};
    fs.writeFileSync(path.join(dir,'data/riffs.json'),JSON.stringify([riff,{id:4,videoFile:riff.videoFile,videoFileRight:riff.videoFile}]));
    const offered=()=>JSON.parse(php(dir,'echo json_encode(video_split_offer(json_decode(file_get_contents("data/riffs.json"),true)[0]));')).videoFileSplit;
    assert.equal(offered(),undefined,'nothing offered before it is built');
    const out=execFileSync('php',[path.join(dir,'config/video-split-cli.php'),'--all'],{encoding:'utf8'});
    assert.match(out,/s-left-split\.mp4: built/);
    const file=path.join(dir,'assets/video/a/b/s-left-split.mp4');
    const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height:format=duration','-of','json',file]));
    const v=info.streams.find(s=>s.codec_type==='video');assert.equal(v.width,1280);assert.ok(info.streams.some(s=>s.codec_type==='audio'));
    assert.ok(Math.abs(info.format.duration-2.5)<0.1);
    // Top left is the right camera (blue), the rest the left one (red).
    const px=(x,y)=>[...execFileSync('ffmpeg',['-v','error','-ss','1','-i',file,'-vf','crop=2:2:'+x+':'+y,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])];
    const [r1,,b1]=px(100,100),[r2,,b2]=px(1000,600);
    assert.ok(b1>150&&r1<80,'window is the right camera '+[r1,b1]);assert.ok(r2>150&&b2<80,'rest is the left camera '+[r2,b2]);
    assert.equal(offered(),'assets/video/a/b/s-left-split.mp4');
    assert.match(execFileSync('php',[path.join(dir,'config/video-split-cli.php'),'--riff','3'],{encoding:'utf8'}),/up to date/);
    // A camera replaced: the old Split no longer matches and is not offered until rebuilt.
    fs.appendFileSync(path.join(dir,'assets/video/a/b/s-right.mp4'),'x');
    assert.equal(offered(),undefined);
    fs.rmSync(dir,{recursive:true,force:true});
});
