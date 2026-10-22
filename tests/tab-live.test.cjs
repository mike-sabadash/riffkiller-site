const {test}=require('node:test');
const assert=require('node:assert/strict');
const {barDurations,cursorAt,barsOf,hasTab}=require('../js/tab-live.js').TabLive;

test('bar lengths follow time signature and carry tempo changes forward',()=>{
    const d=barDurations([{ticks:2400,tempoAutomations:[{value:171}]},{ticks:3840,tempoAutomations:[{value:160}]},{ticks:3840}],120);
    assert.equal(Math.round(d[0].ms),877);  // 5/8 at 171
    assert.equal(Math.round(d[1].ms),1500); // 4/4 at 160
    assert.equal(Math.round(d[2].ms),1500);
});
test('the cursor stretches the bars over the shot and sits between beats',()=>{
    const bars=[{ticks:3840,ms:2000,x0:0,x1:400,beats:[{start:0,x:20},{start:1920,x:220}]}];
    assert.equal(cursorAt(bars,10,12,10).x,20);
    assert.equal(cursorAt(bars,10,12,10.5).x,120);
    assert.equal(cursorAt(bars,10,12,11).x,220);
    assert.equal(cursorAt(bars,10,12,13).x,400,'clamped at the end of the shot');
    const two=[{ticks:960,ms:500,x0:0,x1:100,beats:[{start:0,x:10}]},{ticks:960,ms:500,x0:100,x1:200,beats:[{start:0,x:110}]}];
    assert.deepEqual([cursorAt(two,0,4,2.2).bar,Math.round(cursorAt(two,0,4,2.2).x)],[1,119]);
});
test('a shot maps to its own bars, clamped to the file',()=>{
    assert.deepEqual(barsOf({tabBars:[2,3]},10),{from:2,to:3});
    assert.deepEqual(barsOf({tabBars:[4]},10),{from:4,to:4});
    assert.deepEqual(barsOf({tabBars:[9,14]},10),{from:9,to:10});
    assert.equal(barsOf({},10),null);
    assert.equal(hasTab({tab:{file:'a.gp'},segments:[{}]}),false,'needs at least one mapped shot');
    assert.equal(hasTab({tab:{tex:'.'},segments:[{tabBars:[1,1]}]}),true);
});
const {autoMap,parseBars,formatBars}=require('../js/tab-live.js').TabLive;
test('auto-mapping gives repeated roles the same bars and new roles the next bars that fill the shot',()=>{
    const bars=[{ms:877},{ms:1500},{ms:1500},{ms:1500}];
    const segs=[{start:0,end:0.9,role:'launch'},{start:1,end:2.6,role:'land'},{start:3,end:3.9,role:'launch'},{start:4,end:5,role:''},{start:5,end:8,role:'reset'}];
    assert.deepEqual(autoMap(segs,bars),[[1,1],[2,2],[1,1],null,[3,4]]);
    assert.deepEqual(autoMap([{start:0,end:1,role:'call'},{start:1,end:2,role:'answer'}],[{ms:900}]),[[1,1],null],'nothing left for a new role');
});
test('bar ranges read and print the way the admin field shows them',()=>{
    assert.deepEqual([parseBars('1-2'),parseBars(' 3 '),parseBars('2–5'),parseBars('3-1'),parseBars('')],[[1,2],[3,3],[2,5],null,null]);
    assert.deepEqual([formatBars([1,2]),formatBars([4,4]),formatBars(null)],['1–2','4','']);
});
