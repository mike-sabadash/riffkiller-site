const {test}=require('node:test');
const assert=require('node:assert/strict');
const alphaTab=require('../js/vendor/alphatab/alphaTab.min.js');
const {barDurations}=require('../js/tab-live.js').TabLive;
const {features,events,syncPart,syncWhole,tabLength}=require('../js/tab-sync.js').TabSync;
const {render,perform}=require('./guitar-synth.cjs');

const SURE=0.05; // the admin's threshold for "the notes were found"
const RIFF='\\tempo 84 . :16 5.1 7.1 5.2 5.1 7.1 5.2 7.2 5.2 7.3 5.3 7.4 5.3 7.3 5.4 :8 7.5 | :16 5.5 7.5 5.4 7.5 5.4 0.6 :4 5.6 r | :8 3.6 5.6 r 3.6 5.6 7.6 r 5.6 | :16 0.6{pm} 0.6{pm} 0.6{pm} 0.6{pm} 0.6{pm} 0.6{pm} 3.6 0.6{pm} 0.6{pm} 0.6{pm} 0.6{pm} 5.6 0.6{pm} 0.6{pm} 3.6 0.6 |';
function take(tex,scale,jitter){
    const score=alphaTab.importer.ScoreLoader.loadAlphaTex(tex),d=barDurations(score.masterBars,score.tempo);
    const evs=events(score,0,1,d.length,d),total=tabLength(1,d.length,d);
    const played=perform(evs,total,1,scale,jitter);
    return {score,d,evs,played,feat:features(render(played,total/1000*scale+2.5)),end:1+total/1000*scale};
}
const errors=(anchors,played)=>anchors.map((a,i)=>Math.abs(a[2]-played[i].t)*1000).sort((a,b)=>a-b);

test('every note of a part is found in the sound within a few milliseconds, also played faster or slower',()=>{
    for(const [scale,jitter] of [[1,0.015],[1.12,0.02],[0.9,0.02]]){
        const r=take(RIFF,scale,jitter);
        const m=syncPart(r.score,0,r.d,r.feat,{start:0.85,end:r.end+0.1,bars:[1,4]},true);
        const e=errors(m.anchors,r.played);
        assert.equal(m.anchors.length,r.evs.length);
        assert.ok(e[e.length>>1]<8,'median '+e[e.length>>1]);
        assert.ok(e[e.length-1]<30,'worst '+e[e.length-1]);
        assert.ok(m.contrast>=SURE,'contrast '+m.contrast);
    }
});
test('the sound tells which bars a part plays',()=>{
    const r=take(RIFF,1,0.015);
    for(const bar of [2,3]){
        const first=r.played[r.evs.findIndex(e=>e.bar===bar)].t,next=r.played[r.evs.findIndex(e=>e.bar===bar+1)].t;
        const m=syncPart(r.score,0,r.d,r.feat,{start:first-0.12,end:next-0.03,bars:null},false);
        assert.deepEqual(m.bars,[bar,bar]);
        assert.deepEqual(m.anchors[0].slice(0,2),[bar,0]);
    }
});
test('a tab that is not what the video plays is not trusted',()=>{
    const r=take(RIFF,1,0.015);
    const other=alphaTab.importer.ScoreLoader.loadAlphaTex('\\tempo 84 . :8 0.6 0.6 3.6 5.6 0.6 3.5 5.5 3.5 | 0.6 0.6 3.6 5.6 7.4 5.4 3.4 0.4 | 5.3 7.3 5.3 7.4 5.4 7.5 5.5 0.6 | 5.3 7.3 5.3 7.4 5.4 7.5 5.5 0.6 |');
    const m=syncPart(other,0,barDurations(other.masterBars,other.tempo),r.feat,{start:0.85,end:r.end+0.1,bars:[1,4]},true);
    assert.ok(m.contrast<SURE,'contrast '+m.contrast);
});
test('parts cut mid-bar are synced from the whole take, each with its bars and its start and end in the tab',()=>{
    const tex=require('node:fs').readFileSync(__dirname+'/../content/tabs/led-zeppelin/black-dog.tex','utf8');
    const r=take(tex,1.03,0.02),n=r.evs.length;
    const cuts=[0,.15,.35,.5,.7,.85].map(x=>Math.round(x*n)).concat([n]);
    const parts=cuts.slice(0,-1).map((c,i)=>({start:r.played[c].t-0.05,end:cuts[i+1]<n?r.played[cuts[i+1]].t-0.06:r.played[n-1].t+0.4}));
    const w=syncWhole(r.score,0,r.d,r.feat,parts);
    const e=errors(w.anchors,r.played);
    assert.ok(e[e.length>>1]<8,'median '+e[e.length>>1]);
    assert.ok(e[e.length-1]<30,'worst '+e[e.length-1]);
    assert.ok(w.contrast>=SURE,'contrast '+w.contrast);
    w.parts.forEach((p,i)=>{
        const inside=r.evs.filter((ev,k)=>k>=cuts[i]&&k<cuts[i+1]);
        assert.equal(p.notes,inside.length,'part '+(i+1));
        assert.deepEqual(p.bars,[p.anchors[0][0],p.anchors[p.anchors.length-1][0]]);
        assert.ok(p.bars[0]<=inside[0].bar&&p.bars[1]>=inside[inside.length-1].bar,'part '+(i+1)+' bars '+p.bars);
        assert.equal(p.anchors[0][2],parts[i].start);
    });
});
