const {test} = require('node:test');
const assert = require('node:assert/strict');
const Transport = require('../js/practice-transport.js');
class Video extends EventTarget {
    currentTime = 0; duration = 17.136; readyState = 4; paused = true; seeking = false; playbackRate = 1;
    play() { this.paused = false; return this.result || Promise.resolve(); }
    pause() { this.paused = true; }
}
function setup(options = {}) {
    const left = new Video(), right = new Video();
    return {left, right, t: new Transport(left, right, {autoTick:false, ...options})};
}
test('one clock keeps both cameras aligned after drift and a seek', async () => {
    const {left,right,t} = setup(); await t.play();
    left.currentTime = 9.2; right.currentTime = 9.6; t.tick();
    assert.equal(right.currentTime, 9.2);
    t.seek(13.441); assert.equal(left.currentTime,13.441); assert.equal(right.currentTime,13.441);
    t.seek(99); assert.equal(left.currentTime,left.duration);
    t.setRate(.5); assert.equal(left.playbackRate,.5); assert.equal(right.playbackRate,.5);
});
test('pause cancels an unresolved play without resurrecting the UI', async () => {
    const states=[]; const {left,right,t}=setup({onState:s=>states.push(s)});
    let resolve; left.result=new Promise(r=>{resolve=r});
    const playing=t.play(); t.pause(); resolve(); await playing;
    assert.equal(t.intendedPlaying,false); assert.deepEqual(states,[false]);
    assert.ok(left.paused && right.paused);
});
test('a rejected camera start stops both cameras', async () => {
    let failed=false; const {left,right,t}=setup({onError:()=>{failed=true}});
    right.result=Promise.reject(new Error('decoder failed'));
    assert.equal(await t.play(),false); assert.ok(failed); assert.ok(left.paused && right.paused);
});
test('buffering one camera pauses the pair and resumes at the same time', async () => {
    const {left,right,t}=setup(); await t.play(); left.currentTime=5; right.currentTime=5.2;
    right.readyState=2; right.dispatchEvent(new Event('waiting'));
    assert.ok(left.paused && right.paused); assert.equal(t.intendedPlaying,true);
    right.readyState=4; right.dispatchEvent(new Event('canplay')); await new Promise(setImmediate);
    assert.equal(right.currentTime,5); assert.ok(!left.paused && !right.paused);
});
test('pause while buffering cancels automatic resume', async () => {
    const {left,right,t}=setup(); await t.play();
    right.readyState=2; right.dispatchEvent(new Event('waiting')); t.pause();
    right.readyState=4; right.dispatchEvent(new Event('canplay')); await new Promise(setImmediate);
    assert.ok(left.paused && right.paused);
});
test('seek-in-progress does not trigger a second boundary check', () => {
    let ticks=0; const {left,t}=setup({onTick:()=>ticks++});
    left.seeking=true; t.tick(); assert.equal(ticks,0);
    left.seeking=false; t.tick(); assert.equal(ticks,1);
});
test('a catch-up seek of the right camera does not pause the loop check', () => {
    let ticks=0; const {right,t}=setup({onTick:()=>ticks++});
    right.seeking=true; t.tick(); assert.equal(ticks,1);
});
test('only the master camera can finish a loop', async () => {
    let loops=0; const {left,right,t}=setup({onEnded:()=>loops++});await t.play();
    right.dispatchEvent(new Event('ended'));left.dispatchEvent(new Event('ended'));assert.equal(loops,1);
    t.destroy();left.dispatchEvent(new Event('ended'));assert.equal(loops,1);
});
test('small drift is pulled in by speed, never by a seek', async () => {
    const {left,right,t} = setup(); let clock = 0; t.now = () => clock; t.setRate(.5); await t.play();
    left.currentTime = 4; right.currentTime = 4.08; t.tick();
    assert.equal(right.currentTime, 4.08);
    assert.equal(right.playbackRate, .475, 'ahead: one step slower');
    assert.equal(left.playbackRate, .5);
    // Pulled in: back to the exact speed once the smoothed drift is small.
    for (let i = 0; i < 30; i++) { clock += 33; right.currentTime = 4.005; t.tick(); }
    assert.equal(right.playbackRate, .5);
    // Behind for a while: one step faster.
    for (let i = 0; i < 30; i++) { clock += 33; right.currentTime = 3.9; t.tick(); }
    assert.equal(right.playbackRate, .525);
    t.pause(); await t.play();
    assert.equal(right.playbackRate, .5);
});
test('frame-sized jitter of a phone camera does not keep changing its speed', async () => {
    const {left,right,t} = setup(); let clock = 0; t.now = () => clock; await t.play();
    let changes = 0, rate = 1;
    Object.defineProperty(right, 'playbackRate', {get: () => rate, set: v => { changes++; rate = v; }});
    // 10 s at 30 fps: each camera reports whole frames on its own beat, so the drift jumps between -1 and +1 frame.
    for (let i = 0; i < 300; i++) {
        clock += 33; left.currentTime = Math.floor(i / 2) / 30; right.currentTime = Math.floor((i + 1 + (i % 3 === 0 ? 1 : 0)) / 2) / 30;
        t.tick();
    }
    assert.equal(changes, 0, 'speed changed ' + changes + ' times');
    assert.equal(right.currentTime > 0, true);
});
test('a large drift seeks the follower once, then waits instead of seeking in a loop', async () => {
    const {left,right,t} = setup(); await t.play();
    let seeks = 0; let time = 0;
    Object.defineProperty(right, 'currentTime', {get: () => time, set: v => { seeks++; time = v; }});
    left.currentTime = 6; time = 6.6; t.tick();
    assert.equal(seeks, 1); assert.equal(time, 6);
    time = 6.5; t.tick(); t.tick();
    assert.equal(seeks, 1, 'no second seek inside the cooldown');
    assert.ok(right.playbackRate < 1);
});
test('a loop jump keeps the clock camera silent until the seek lands', () => {
    const {left,right,t}=setup(); left.muted=false; right.muted=true;
    t.loopTo(3); assert.equal(left.currentTime,3); assert.equal(right.currentTime,3);
    assert.equal(left.muted,true);
    t.loopTo(3); left.dispatchEvent(new Event('seeked'));
    assert.equal(left.muted,false); assert.equal(right.muted,true);
    t.destroy();
});
test('the loop lead follows how far the clock moves between checks', async () => {
    const {left,t}=setup(); await t.play();
    for (let i=0;i<20;i++){ left.currentTime=i*0.033; t.tick(); }
    assert.ok(Math.abs(t.step-0.033)<0.002);
    left.currentTime=5; t.tick(); assert.ok(t.step<0.04, 'a jump is not a step');
    t.destroy();
});
test('a hard loop jump stops both cameras, seeks, and starts again only after the seek lands', async () => {
    const {left,right,t}=setup(); await t.play();
    left.currentTime=4.9; right.currentTime=4.9;
    left.play=function(){ this.paused=false; return Promise.resolve(); };
    const seeking=v=>{ v.seeking=true; };
    left.seeking=false;
    t.loopTo(2, true);
    assert.ok(left.paused && right.paused, 'silent at once');
    assert.equal(left.currentTime,2); assert.equal(right.currentTime,2);
    assert.equal(t.intendedPlaying,true, 'still playing as far as the page knows');
    await new Promise(setImmediate);
    assert.ok(!left.paused && !right.paused, 'started again');
    assert.equal(t.pending,false);
    t.destroy();
});
test('a hard loop waits for a seek in progress and a pause meanwhile wins', async () => {
    const {left,right,t}=setup(); await t.play();
    left.seeking=true; right.seeking=true;
    t.loopTo(1, true); left.seeking=true;
    t.pause();
    left.seeking=false; right.seeking=false;
    left.dispatchEvent(new Event('seeked')); right.dispatchEvent(new Event('seeked'));
    await new Promise(setImmediate);
    assert.ok(left.paused && right.paused); assert.equal(t.intendedPlaying,false);
    t.destroy();
});
test('the boundary is met by a timer from the last frame, not by the next coarse time update', async () => {
    const {left,t}=setup(); await t.play(); left.currentTime=2.95; // a coarse update behind the last frame
    t.anchor={media:3, wall:t.now()};
    assert.ok(t.estimate()>=3);
    let fired=0; t.at(3.05, ()=>fired++);
    await new Promise(r=>setTimeout(r,120));
    assert.equal(fired,1);
    t.at(10, ()=>fired++); await new Promise(r=>setTimeout(r,20)); assert.equal(fired,1, 'too far ahead to arm');
    t.at(3.05, ()=>fired++); t.seek(0); await new Promise(r=>setTimeout(r,120));
    assert.equal(fired,1, 'a seek cancels the jump');
    t.destroy();
});
class Sound { currentTime = 0; paused = true; ended = false; playbackRate = 1; loop = true;
    play() { this.paused = false; return this.result || Promise.resolve(); } pause() { this.paused = true; } }
test('a looped part sounds from its own file, which loops by itself and leads the silent cameras', async () => {
    const {left,right,t}=setup(); const a=new Sound();
    t.setVoice(a, 3.64, 5.56); assert.equal(left.muted,true); assert.equal(a.loop,true);
    left.currentTime=4; await t.play(); assert.equal(a.paused,false); assert.ok(Math.abs(a.currentTime-.36)<1e-9);
    // the picture lags a little: the sound is never re-seeked to it
    a.currentTime=1.3; left.currentTime=4.8; t.voice.lastFix=-Infinity; t.tick(); assert.equal(a.currentTime,1.3); assert.equal(left.currentTime,4.8);
    // the jump back before the sound wrapped goes to the part start; the sound is left alone
    a.currentTime=1.9; t.loopTo(3.64); assert.equal(left.currentTime,3.64); assert.equal(right.currentTime,3.64); assert.equal(a.currentTime,1.9);
    // the sound has only just looped: the picture goes to the part's first frame (a keyframe, fastest on a phone)
    a.currentTime=.05; t.loopTo(3.64); assert.equal(left.currentTime,3.64);
    // the sound clearly looped already: the picture goes to where the sound is
    a.currentTime=.3; t.loopTo(3.64); assert.ok(Math.abs(left.currentTime-3.94)<1e-9);
    // the picture clearly off (a slow phone seek): it is moved to the sound, once per cooldown
    a.currentTime=.3; left.currentTime=3.09; t.voice.lastFix=-Infinity; t.tick(); assert.ok(Math.abs(left.currentTime-3.94)<1e-9);
    left.currentTime=3.09; t.tick(); assert.equal(left.currentTime,3.09);
    // close to the part's end the jump back fixes it: no extra seek
    a.currentTime=1; left.currentTime=3.7; t.voice.lastFix=-Infinity; t.tick(); assert.equal(left.currentTime,3.7);
    t.setRate(.5); assert.equal(a.playbackRate,.5);
    t.pause(); assert.equal(a.paused,true);
    // switching the view (left, right, both hands) keeps a single voice: the part file, not the camera as well
    left.muted=false; right.muted=false; t.applyVoice(); assert.equal(left.muted,true); assert.equal(right.muted,true);
    t.clearVoice(); assert.equal(left.muted,false);
    t.applyVoice(); assert.equal(left.muted,false); assert.equal(right.muted,true);
});
test('a refused part sound hands the sound back to the clock camera', async () => {
    const {left,t}=setup(); const a=new Sound(); a.result=Promise.reject(new Error('NotAllowedError'));
    t.setVoice(a, 0, 1.6); await t.play(); await new Promise(setImmediate);
    assert.equal(t.voice,null); assert.equal(left.muted,false);
});
test('the part file holds exactly the part, sample-exact', async () => {
    globalThis.Blob ??= require('node:buffer').Blob;
    const PartAudio = require('../js/part-audio.js');
    const rate=44100, len=rate*4, ch=[new Float32Array(len).fill(.5), new Float32Array(len).fill(-.5)];
    const buffer={sampleRate:rate, numberOfChannels:2, length:len, getChannelData:c=>ch[c]};
    const blob=PartAudio.wav(buffer, 1.7, 3.44), view=new DataView(await blob.arrayBuffer());
    const frames=Math.round(3.44*rate)-Math.round(1.7*rate);
    assert.equal(blob.size, 44+frames*4); assert.equal(view.getUint32(40,true), frames*4);
    assert.equal(view.getUint16(22,true),2); assert.equal(view.getUint32(24,true),rate);
    assert.equal(view.getInt16(44,true),0); // faded in, no click
    assert.ok(view.getInt16(44+4*1000,true)>16000 && view.getInt16(46+4*1000,true)<-16000);
});
test('a frame from before a loop jump does not make the clock look past the part end', async () => {
    const {left,t}=setup(); await t.play();
    left.currentTime=1.74; t.anchor={media:3.42, wall:t.now()-50};
    assert.equal(t.estimate(), 1.74);
});
test('a camera catching up after a loop jump does not stop the part sound', async () => {
    const {left,right,t}=setup(); const a=new Sound();
    t.setVoice(a, 1.7, 3.44); left.currentTime=2; await t.play();
    t.loopTo(1.7); left.readyState=2; left.dispatchEvent(new Event('waiting'));
    assert.equal(a.paused,false); assert.ok(!left.paused && !right.paused); assert.equal(t.buffering,false);
});
test('small drift from the part sound is closed by camera speed, not by a seek', async () => {
    const {left,t}=setup(); let clock=0; t.now=()=>clock; const a=new Sound();
    t.setVoice(a, 1.7, 3.44); left.currentTime=2; await t.play();
    a.currentTime=.1; left.currentTime=2; t.tick(); // picture 0.2 s ahead of the sound
    assert.equal(left.currentTime,2); assert.equal(left.playbackRate,.95);
    for (let i=0;i<30;i++){ clock+=33; a.currentTime=.5; left.currentTime=2; t.tick(); } // behind: faster
    assert.equal(left.playbackRate,1.05);
    a.paused=true; t.tick(); assert.equal(a.paused,false, 'a sound stopped by the system starts again');
    t.clearVoice(); assert.equal(left.playbackRate,1);
});
test('the right camera catching up after its sync seek does not stop the clock camera', async () => {
    const {left,right,t}=setup(); let clock=10000; t.now=()=>clock; await t.play();
    left.currentTime=6; right.currentTime=6.6; t.tick(); assert.equal(right.currentTime,6);
    right.readyState=2; right.dispatchEvent(new Event('waiting'));
    assert.ok(!left.paused, 'left keeps playing'); assert.equal(t.buffering,false);
    clock+=5000; right.dispatchEvent(new Event('waiting'));
    assert.ok(left.paused && right.paused, 'a real stall later still pauses the pair');
});
test('the right camera follows the clock at the clock own nudged speed, so it can catch up', async () => {
    const {left,right,t}=setup(); let clock=0; t.now=()=>clock; await t.play();
    left.playbackRate=1.05; // the clock is sped up to keep up with a part's sound
    left.currentTime=5; right.currentTime=5; t.tick(); assert.equal(right.playbackRate,1.05);
    for(let i=0;i<30;i++){ clock+=33; right.currentTime=4.9; t.tick(); }
    assert.ok(right.playbackRate>1.05, 'behind: faster than the clock '+right.playbackRate);
});
test('a sync seek aims where the clock will be once the phone lands it', async () => {
    const {left,right,t}=setup(); let clock=10000; t.now=()=>clock; await t.play();
    left.currentTime=6; right.currentTime=5; t.tick(); assert.equal(right.currentTime,6);
    clock+=200; right.dispatchEvent(new Event('seeked')); // took 0.2 s
    clock+=5000; left.currentTime=8; right.currentTime=7; t.tick();
    assert.ok(Math.abs(right.currentTime-8.2)<1e-9, String(right.currentTime));
});
test('with a part sound the picture jumps to where the sound will be when the seek lands', async () => {
    const {left,t}=setup(); let clock=0; t.now=()=>clock; const a=new Sound();
    t.setVoice(a, 3, 5); left.currentTime=3.5; await t.play();
    a.currentTime=.3; t.loopTo(3); assert.ok(Math.abs(left.currentTime-3.3)<1e-9);
    clock+=150; left.dispatchEvent(new Event('seeked'));
    a.currentTime=.3; t.loopTo(3); assert.ok(Math.abs(left.currentTime-3.45)<1e-9, String(left.currentTime));
    // the jump starts that much before the part's end, so it lands on the first frame as the sound loops
    assert.ok(Math.abs(t.loopLead()-0.15)<1e-9);
    a.currentTime=1.85; t.loopTo(3); assert.equal(left.currentTime,3);
});
test('solo: with one hand on screen only that camera plays and is the clock; the other waits paused', async () => {
    const {left,right,t}=setup({solo:true}); let clock=0; t.now=()=>clock;
    left.muted=false; await t.play();
    assert.ok(!left.paused && right.paused, 'only the shown camera plays');
    left.currentTime=4; t.seek(5); assert.equal(left.currentTime,5); assert.equal(right.currentTime,0, 'the hidden one is not seeked');
    t.setView('right');
    assert.equal(t.clock,right); assert.ok(right.currentTime>=5, 'shown camera brought to the clock'); assert.ok(!right.paused && left.paused);
    assert.equal(right.muted,false); assert.equal(left.muted,true, 'the sound moves with the clock');
    right.currentTime=6; assert.equal(t.time,6);
    let ended=0; t.options.onEnded=()=>ended++; left.dispatchEvent(new Event('ended')); right.dispatchEvent(new Event('ended')); assert.equal(ended,1);
    t.setView('both');
    assert.equal(t.clock,left); assert.ok(!left.paused && !right.paused, 'Split plays both'); assert.ok(left.currentTime>=6);
    assert.equal(left.muted,false); assert.equal(right.muted,true);
    t.setView('left'); assert.ok(!left.paused && right.paused);
    t.pause(); t.setView('right'); assert.equal(t.clock,right); assert.equal(right.currentTime,left.currentTime);
    t.destroy();
});
test('without solo (desktop) both cameras always play and the left one stays the clock', async () => {
    const {left,right,t}=setup(); await t.play(); t.setView('right');
    assert.equal(t.clock,left); assert.ok(!left.paused && !right.paused);
});
test('solo (phone): drift from the part sound never changes a camera speed; a seek only when far off and not near the end', async () => {
    const {left,t}=setup({solo:true}); let clock=0; t.now=()=>clock; const a=new Sound();
    t.setVoice(a, 0, 4); left.currentTime=1; await t.play();
    let changes=0, rate=1; Object.defineProperty(left,'playbackRate',{get:()=>rate,set:v=>{changes++;rate=v;}});
    for(let i=0;i<60;i++){ clock+=33; a.currentTime=1.3; left.currentTime=1; t.tick(); }
    assert.equal(changes,0); assert.equal(left.currentTime,1);
    clock+=5000; a.currentTime=2; left.currentTime=1; t.tick(); assert.equal(left.currentTime,2, 'a second behind with time left: seek');
    clock+=5000; a.currentTime=3.2; left.currentTime=2.2; t.tick(); assert.equal(left.currentTime,2.2, 'near the end: the jump back fixes it');
    t.destroy();
});
test('solo: once the Split video is there, Split plays it alone and it keeps time', async () => {
    const {left,right,t}=setup({solo:true}); let clock=0; t.now=()=>clock;
    await t.play(); t.setView('both');
    assert.ok(!left.paused && !right.paused, 'two cameras until the Split video arrives');
    left.currentTime=7; right.currentTime=7;
    const split=new Video(); t.setSplitVideo(split);
    assert.equal(t.clock,split); assert.ok(split.currentTime>=7); assert.ok(!split.paused && left.paused && right.paused);
    assert.equal(split.muted,false); assert.ok(left.muted && right.muted);
    split.currentTime=8; t.seek(9); assert.equal(split.currentTime,9); assert.equal(left.currentTime,7, 'hidden cameras are not seeked');
    let ended=0; t.options.onEnded=()=>ended++; split.dispatchEvent(new Event('ended')); assert.equal(ended,1);
    t.setView('right'); assert.equal(t.clock,right); assert.ok(right.currentTime>=9 && !right.paused && split.paused);
    t.setView('both'); assert.equal(t.clock,split); assert.ok(!split.paused && right.paused);
    t.destroy();
});
test('phone: a looped part plays from its own video with the sound inside; it loops by itself and counts passes', async () => {
    const loops=[]; const {left,right,t}=setup({solo:true,view:'left',onClipLoop:()=>loops.push(1)});
    await t.play(); left.currentTime=5.4;
    const clip=new Video(); clip.duration=1.3; t.setClip(clip,5,6.3);
    assert.equal(t.master,clip); assert.ok(!clip.paused && left.paused && right.paused);
    assert.equal(clip.loop,true); assert.equal(clip.muted,false); assert.ok(left.muted && right.muted, 'only the part video sounds');
    assert.ok(Math.abs(clip.currentTime-0.4)<1e-9, 'starts where the camera was'); assert.ok(Math.abs(t.time-5.4)<1e-9);
    clip.currentTime=1.2; t.tick(); clip.currentTime=0.05; t.tick();
    assert.equal(loops.length,1,'the jump back of the file counts one pass');
    assert.equal(t.loopTo(5), t.time, 'no seek per pass'); assert.equal(clip.currentTime,0.05);
    t.setRate(.5); assert.equal(clip.playbackRate,.5);
    t.seek(5.9); assert.ok(Math.abs(clip.currentTime-0.9)<1e-9,'a seek inside the part moves the part video'); assert.equal(loops.length,1);
    t.seek(8); assert.equal(t.clip,null); assert.ok(clip.paused); assert.equal(left.currentTime,8); assert.ok(!left.paused); assert.equal(left.muted,false);
});
test('phone: a view change keeps the part video until the view gets its own; a refused start falls back to the cameras', async () => {
    const refused=[]; const {left,right,t}=setup({solo:true,view:'left',onClipRefused:()=>refused.push(1)});
    await t.play(); left.currentTime=5.2;
    const a=new Video(); t.setClip(a,5,6);
    t.setView('right'); assert.equal(t.master,a); assert.ok(right.paused && left.paused && !a.paused);
    a.currentTime=0.5; const b=new Video(); t.setClip(b,5,6);
    assert.ok(a.paused && !b.paused); assert.equal(b.currentTime,0.5,'the other view starts at the same moment'); assert.equal(a.muted,true);
    t.clearClip(); assert.equal(t.clock,right); assert.ok(!right.paused); assert.equal(right.currentTime,5.5);
    const c=new Video(); c.result=Promise.reject(new Error('NotAllowedError')); t.setClip(c,5,6);
    await new Promise(setImmediate); await new Promise(setImmediate);
    assert.equal(t.clip,null); assert.equal(refused.length,1); assert.ok(!right.paused);
});
test('a part video set while the cameras are still starting does not report a failed start', async () => {
    let failed=0; const {left,t}=setup({solo:true,onError:()=>failed++});
    let reject; left.result=new Promise((_,r)=>{reject=r});
    const playing=t.play(); const clip=new Video(); t.setClip(clip,0,1);
    reject(new Error('AbortError')); await playing;
    assert.equal(failed,0); assert.equal(t.intendedPlaying,true); assert.ok(!clip.paused);
});
