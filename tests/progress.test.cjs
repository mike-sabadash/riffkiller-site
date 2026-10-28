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

test('stars: ★ at ×0.5, ★★ at ×0.75, ★★★ at ×1; each star is a win once; the riff counts stars and shots to kill',()=>{
    const s=P.empty(),now=at(2026,10,26);
    P.recordLoop(s,1,segs,0,now);
    let sum=P.riffSummary(s,riff,now);
    assert.equal(sum.parts[0].stars,0);assert.equal(sum.stars,0);assert.equal(sum.maxStars,12);assert.equal(sum.toKill,4);
    P.markClean(s,1,segs,0,0.5,now);
    assert.equal(P.riffSummary(s,riff,now).parts[0].stars,1);
    P.markClean(s,1,segs,0,0.75,now+1);P.markClean(s,1,segs,0,0.75,now+2);
    assert.equal(P.riffSummary(s,riff,now).stars,2);
    P.markClean(s,1,segs,1,1,now+3);
    sum=P.riffSummary(s,riff,now);
    assert.deepEqual(sum.parts.map(p=>p.stars),[2,3,0,0]);assert.equal(sum.stars,5);assert.equal(sum.toKill,3);
    assert.deepEqual(s.wins.map(w=>w.t+(w.n||'')+':'+(w.p==null?'':w.p)),['star1:0','star2:0','star1:1','star2:1','star3:1','tempo:1'],'a jump to ×1 gives every star on the way');
    assert.equal(P.starsFor(0.6),1);assert.equal(P.starsFor(0),0);assert.equal(P.starsFor(0.3,true),3);
});

test('the method: Scan, Split, Isolate, Decode, Mutate; kill, rank and the next step after the kill',()=>{
    const ruled={...riff,dna:{...riff.dna,rule:'Call and answer that comes home.'}};
    const s=P.empty(),now=at(2026,10,26);
    let sum=P.riffSummary(s,ruled,now);
    assert.equal(sum.stageNext,'scan');assert.equal(sum.stagesDone,0);
    assert.equal(P.markStage(s,1,'scan',now),true);assert.equal(P.markStage(s,1,'scan',now+5),false,'only the first time');
    for(const i of [0,1,2,3])P.recordLoop(s,1,segs,i,now);
    sum=P.riffSummary(s,ruled,now);assert.equal(sum.stageNext,'isolate');assert.equal(sum.stagesDone,2);
    for(const i of [0,1,2,3])P.markClean(s,1,segs,i,1,now);
    sum=P.riffSummary(s,ruled,now);
    assert.equal(sum.stages.isolate,true);assert.equal(sum.killed,false);assert.equal(sum.toKill,1,'the whole riff at ×1 is the last shot');
    assert.equal(P.rank(s,[ruled],now).label,'Rookie');
    P.markWhole(s,1,now);
    sum=P.riffSummary(s,ruled,now);assert.equal(sum.killed,true);assert.equal(sum.toKill,0);
    const r=P.rank(s,[ruled],now);
    assert.equal(r.label,'Riff Hunter');assert.equal(r.kills,1);assert.deepEqual([r.next.label,r.next.toGo],['Riff Killer',2]);
    assert.equal(P.nextStep(s,[ruled],at(2026,10,27)).kind,'decode','a killed riff with a rule asks for Decode');
    P.markStage(s,1,'decode',now);
    assert.equal(P.nextStep(s,[ruled],at(2026,10,27)).kind,'mutate');
    P.markStage(s,1,'mutate',now);
    sum=P.riffSummary(s,ruled,now);assert.equal(sum.stagesDone,5);assert.equal(sum.stageNext,null);
    assert.deepEqual(s.wins.filter(w=>!['star','tempo'].includes(w.t)).map(w=>w.t),['scan','kill','decode','mutate']);
});

test('achievements show how far along they are, and only the ones the catalog allows',()=>{
    const s=P.empty(),now=at(2026,10,26);
    P.markClean(s,1,segs,0,0.5,now);
    let list=P.achievements(s,[riff],now);
    const by=k=>list.find(a=>a.key===k);
    assert.deepEqual([by('first-star').done,by('first-tempo').done],[true,false]);
    assert.deepEqual([by('all-stars').value,by('all-stars').target],[1,12]);
    assert.equal(by('three-kills'),undefined,'three kills need three riffs cut into parts');
    assert.equal(by('technique'),undefined,'a technique in three riffs needs three riffs with it');
    const r2={id:2,segments:segs,dna:{atoms:[{technique:'bend',segmentIndex:0}]}},r3={id:3,segments:segs,dna:{atoms:[{technique:'bend',segmentIndex:1}]}};
    list=P.achievements(s,[riff,r2,r3],now);
    assert.ok(list.find(a=>a.key==='three-kills'));assert.ok(list.find(a=>a.key==='technique'));
    const t=P.techniques(s,[riff,r2,r3],now).find(x=>x.technique==='bend');
    assert.equal(t.reachable,true);assert.equal(t.trainIn,'1','where to train it next');
});

test('the weekly goal is a win once a week; wins merge from both copies without doubles',()=>{
    const a=P.empty(),b=P.empty();
    P.setGoal(a,3,at(2026,10,19));
    for(const d of [26,27,28])P.addPlayTime(a,1,320,at(2026,10,d));
    P.addPlayTime(a,1,320,at(2026,10,29));
    assert.equal(a.wins.filter(w=>w.t==='goal').length,1);
    P.markClean(b,1,segs,0,0.5,at(2026,10,20));P.markClean(a,1,segs,0,0.5,at(2026,10,22));
    P.markStage(b,1,'decode',at(2026,10,21));
    const m=P.merge(a,b);
    assert.equal(m.wins.filter(w=>w.t==='star').length,1,'the same star once');
    assert.equal(m.wins.find(w=>w.t==='star').at,at(2026,10,20),'with the earliest time');
    assert.equal(m.riffs['1'].decodeAt,at(2026,10,21));
    const junk=P.normalize({v:2,days:{},riffs:{},wins:[{t:'hack',at:1},{t:'star',at:0},{t:'kill',r:'<b>',at:5},{t:'star',n:9,at:3}]});
    assert.deepEqual(junk.wins,[{t:'kill',at:5},{t:'star',at:3}]);
    assert.equal(P.recentWins(m,2).length,2);
});

test('favorites: latest change wins when two devices merge, removals stick', () => {
    const a = P.empty(), b = P.empty();
    P.setFavorite(a, 'riff', 1, true, 1000);
    P.setFavorite(a, 'collection', 2, true, 1100);
    P.setFavorite(b, 'riff', 1, true, 900);
    P.setFavorite(b, 'riff', 1, false, 2000);   // removed later on the other device
    P.setFavorite(b, 'riff', 7, true, 1500);
    const m = P.merge(a, b);
    assert.equal(P.isFavorite(m, 'riff', 1), false);
    assert.deepEqual(P.favorites(m, 'riff'), ['7']);
    assert.deepEqual(P.favorites(m, 'collection'), ['2']);
    // Junk keys and values do not survive normalize.
    const n = P.normalize({ v: 2, riffs: {}, days: {}, fav: { 'r:1': { on: true, at: 5 }, 'x:2': { on: true, at: 5 }, 'r:<b>': { on: true, at: 5 }, 'r:3': 'yes' } });
    assert.deepEqual(Object.keys(n.fav), ['r:1']);
    // Toggling twice at the same millisecond still moves time forward, so the last click wins.
    const c = P.empty();
    P.setFavorite(c, 'riff', 4, true, 3000); P.setFavorite(c, 'riff', 4, false, 3000);
    assert.equal(P.isFavorite(c, 'riff', 4), false);
    assert.ok(c.fav['r:4'].at > 3000);
});
