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
    const {left,right,t} = setup(); t.setRate(.5); await t.play();
    left.currentTime = 4; right.currentTime = 4.08; t.tick();
    assert.equal(right.currentTime, 4.08);
    assert.ok(right.playbackRate < .5 && right.playbackRate >= .45, String(right.playbackRate));
    assert.equal(left.playbackRate, .5);
    right.currentTime = 3.95; t.tick();
    assert.ok(right.playbackRate > .5 && right.playbackRate <= .55, String(right.playbackRate));
    right.currentTime = 4.005; t.tick();
    assert.equal(right.playbackRate, .5);
    right.currentTime = 4.1; t.tick(); t.pause(); await t.play();
    assert.equal(right.playbackRate, .5);
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
    const {left,t}=setup(); await t.play();
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
test('a looped part sounds from its own file: the clock camera is silent and the file restarts at every jump', async () => {
    const {left,t}=setup(); const a=new Sound();
    t.setVoice(a, 3.64, 5.56); assert.equal(left.muted,true); assert.equal(a.loop,false);
    left.currentTime=3.64; await t.play(); assert.equal(a.paused,false);
    left.currentTime=5; a.currentTime=1.36; t.tick(); assert.equal(a.currentTime,1.36);
    a.ended=true; a.paused=true; left.currentTime=5.6; t.tick(); assert.equal(a.paused,true); // past the end: silent
    t.loopTo(3.64); assert.equal(a.currentTime,0); assert.equal(a.paused,false); assert.equal(left.muted,true);
    t.setRate(.5); assert.equal(a.playbackRate,.5);
    t.pause(); assert.equal(a.paused,true);
    t.clearVoice(); assert.equal(left.muted,false);
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
