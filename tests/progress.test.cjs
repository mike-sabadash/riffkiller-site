const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../js/rk-progress.js');

const segs=[{start:0,end:2},{start:2,end:4},{start:4,end:6},{start:6,end:8}];
const riff={id:1,segments:segs,dna:{atoms:[{technique:'bend',segmentIndex:0},{technique:'vibrato',segmentIndex:1},{technique:'bend',segmentIndex:2}]}};
const at=(y,m,d,h=12)=>new Date(y,m-1,d,h).getTime();
const keys=s=>P.riffSummary(s,riff,at(2026,10,26)).parts.map(p=>p.key);

test('a part goes new → working → at tempo, and a riff is learned only after the whole riff at ×1',()=>{
    const s=P.empty(),now=at(2026,10,26);
    assert.deepEqual(keys(s),['new','new','new','new']);
    P.recordLoop(s,1,segs,0,now);
    assert.deepEqual(keys(s),['working','new','new','new']);
    P.markClean(s,1,segs,0,0.75,now);
    assert.equal(P.riffSummary(s,riff,now).parts[0].best,0.75);
    const r=P.markClean(s,1,segs,0,1,now);
    assert.equal(r.before.key,'working');assert.equal(r.after.key,'tempo');
    for(const i of [1,2,3])P.markClean(s,1,segs,i,1,now);
    let sum=P.riffSummary(s,riff,now);
    assert.equal(sum.atTempo,4);assert.ok(sum.allAtTempo);assert.ok(!sum.learned);
    P.markWhole(s,1,now);
    assert.ok(P.riffSummary(s,riff,now).learned);
});

test('reviews: due after 3 days, “clean” locks the part in, “not yet” keeps it at tempo and asks again',()=>{
    const s=P.empty();
    P.markClean(s,1,segs,0,1,at(2026,10,26,20));
    assert.equal(P.riffSummary(s,riff,at(2026,10,28,23)).parts[0].due,false);
    assert.equal(P.riffSummary(s,riff,at(2026,10,29,0)).parts[0].due,true);
    P.reviewMissed(s,1,segs,0,at(2026,10,29,10));
    let p=P.riffSummary(s,riff,at(2026,10,29,11)).parts[0];
    assert.equal(p.key,'tempo');assert.equal(p.due,false);
    assert.equal(P.riffSummary(s,riff,at(2026,11,1,1)).parts[0].due,true);
    P.markClean(s,1,segs,0,1,at(2026,11,1,10));
    p=P.riffSummary(s,riff,at(2026,11,1,11)).parts[0];
    assert.equal(p.key,'locked');assert.equal(p.due,false);
    assert.equal(P.riffSummary(s,riff,at(2026,11,11,1)).parts[0].due,true,'next review after 10 days');
    // clean at ×1 again before the review is due changes nothing
    const before=JSON.stringify(s.riffs);
    P.markClean(s,1,segs,0,1,at(2026,11,5));
    assert.equal(JSON.parse(JSON.stringify(s.riffs))['1'].parts[0].reviews,JSON.parse(before)['1'].parts[0].reviews);
});

test('progress follows a part when the admin retrims or inserts parts',()=>{
    const s=P.empty(),now=at(2026,10,26);
    P.markClean(s,1,segs,2,1,now);
    const retrimmed=[{start:0,end:2.1},{start:2.1,end:3.9},{start:3.9,end:6.2},{start:6.2,end:8}];
    assert.deepEqual(P.riffSummary(s,{id:1,segments:retrimmed},now).parts.map(p=>p.key),['new','new','tempo','new']);
    const inserted=[{start:0,end:1},{start:1,end:2},{start:2,end:4},{start:4,end:6},{start:6,end:8}];
    assert.deepEqual(P.riffSummary(s,{id:1,segments:inserted},now).parts.map(p=>p.key),['new','new','new','tempo','new']);
});

test('a practice day is 5 minutes of playing; the weekly goal counts days and weeks in a row',()=>{
    const s=P.empty();
    P.setGoal(s,3,at(2026,10,1));
    assert.equal(P.setGoal(s,4,at(2026,10,1)),false);
    // week of Oct 12: Mon, Wed, Fri → met
    for(const d of [12,14,16])P.addPlayTime(s,1,300,at(2026,10,d));
    // week of Oct 19: Mon, Tue, Sun → met
    for(const d of [19,20,25])P.addPlayTime(s,1,320,at(2026,10,d));
    // this week (Oct 26): one short day (4 min) and one full day
    P.addPlayTime(s,1,240,at(2026,10,26));
    P.addPlayTime(s,1,400,at(2026,10,27));
    const w=P.weekSummary(s,at(2026,10,28));
    assert.equal(w.days[0].key,'2026-10-26');
    assert.deepEqual(w.days.map(d=>d.done),[false,true,false,false,false,false,false]);
    assert.equal(w.count,1);assert.equal(w.goal,3);assert.equal(w.met,false);
    assert.equal(w.weeksInRow,2,'an unfinished week does not break the run');
    P.addPlayTime(s,1,60,at(2026,10,26));
    P.addPlayTime(s,1,300,at(2026,10,28));
    const w2=P.weekSummary(s,at(2026,10,28));
    assert.equal(w2.count,3);assert.ok(w2.met);assert.equal(w2.weeksInRow,3);
    assert.equal(P.calendar(s,at(2026,10,28),12).length,12);
    assert.equal(P.calendar(s,at(2026,10,28),12)[11][0].key,'2026-10-26');
});

test('techniques count parts and riffs at tempo; learned in three riffs',()=>{
    const s=P.empty(),now=at(2026,10,26);
    const r2={id:2,segments:segs,dna:{atoms:[{technique:'bend',segmentIndex:1},{technique:'palm',segmentIndex:3}]}};
    const r3={id:3,segments:segs,dna:{atoms:[{technique:'bend',segmentIndex:0}]}};
    P.markClean(s,1,segs,0,1,now);P.markClean(s,1,segs,2,1,now);P.markClean(s,2,segs,1,1,now);
    let t=P.techniques(s,[riff,r2,r3],now);
    const bend=t.find(x=>x.technique==='bend');
    assert.deepEqual([bend.parts,bend.riffs,bend.learned],[3,2,false]);
    assert.equal(t.find(x=>x.technique==='palm').parts,0);
    P.markClean(s,3,segs,0,1,now);
    t=P.techniques(s,[riff,r2,r3],now);
    assert.equal(t.find(x=>x.technique==='bend').learned,true);
});

test('what next: a due review, then the open riff, then the whole riff, then a new riff with one new technique',()=>{
    const r2={id:2,segments:segs,dna:{atoms:[{technique:'bend',segmentIndex:0},{technique:'palm',segmentIndex:1},{technique:'slide',segmentIndex:2}]}};
    const r3={id:3,segments:segs,dna:{atoms:[{technique:'bend',segmentIndex:0},{technique:'palm',segmentIndex:1}]}};
    const s=P.empty();
    assert.equal(P.nextStep(s,[riff,r2,r3],at(2026,10,26)).kind,'new');
    P.markClean(s,1,segs,0,1,at(2026,10,26));
    let n=P.nextStep(s,[riff,r2,r3],at(2026,10,27));
    assert.deepEqual([n.kind,n.riff.id,n.part],['continue',1,1]);
    n=P.nextStep(s,[riff,r2,r3],at(2026,10,30));
    assert.deepEqual([n.kind,n.riff.id,n.part],['review',1,0]);
    P.markClean(s,1,segs,0,1,at(2026,10,30));
    for(const i of [1,2,3])P.markClean(s,1,segs,i,1,at(2026,10,30));
    assert.equal(P.nextStep(s,[riff,r2,r3],at(2026,10,30)).kind,'whole');
    P.markWhole(s,1,at(2026,10,30));
    n=P.nextStep(s,[riff,r2,r3],at(2026,10,31));
    assert.deepEqual([n.kind,n.riff.id,n.newTechniques],['new',3,['palm']]);
});

test('merge keeps everything either copy earned and survives junk',()=>{
    const a=P.empty(),b=P.empty();
    P.markClean(a,1,segs,0,1,at(2026,10,20));
    P.markClean(b,1,segs,0,0.75,at(2026,10,21));P.markClean(b,1,segs,1,1,at(2026,10,21));
    P.addPlayTime(a,1,200,at(2026,10,20));P.addPlayTime(b,1,350,at(2026,10,20));P.addPlayTime(b,2,300,at(2026,10,21));
    P.setGoal(a,3,at(2026,10,1));P.setGoal(b,5,at(2026,10,2));
    const m=P.merge(a,b);
    assert.deepEqual(P.riffSummary(m,riff,at(2026,10,22)).parts.map(p=>p.key),['tempo','tempo','new','new']);
    assert.equal(m.days['2026-10-20'].sec,350);
    assert.deepEqual(Object.keys(m.days['2026-10-20'].riffs),['1']);
    assert.equal(m.goal,5);
    assert.deepEqual(P.merge(m,m).riffs,m.riffs,'merging twice changes nothing');
    assert.deepEqual(P.normalize('nonsense'),P.empty());
    assert.deepEqual(P.normalize({goal:4,days:{bad:{sec:5},'2026-10-01':{sec:-3}},riffs:{1:{parts:'x'}}}).riffs['1'].parts,[]);
});

test('session diff lists parts that moved up or got faster',()=>{
    const s=P.empty(),now=at(2026,10,26);
    P.markClean(s,1,segs,0,0.5,now);
    const before=P.riffSummary(s,riff,now);
    P.markClean(s,1,segs,0,0.75,now);P.markClean(s,1,segs,1,1,now);P.recordLoop(s,1,segs,2,now);
    const d=P.sessionDiff(before,P.riffSummary(s,riff,now));
    assert.deepEqual(d.map(x=>[x.part,x.from.best,x.to.key]),[[0,0.5,'working'],[1,0,'tempo'],[2,0,'working']]);
});
