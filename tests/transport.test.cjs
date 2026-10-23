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
