const {test}=require('node:test');
const assert=require('node:assert/strict');
const alphaTab=require('../js/vendor/alphatab/alphaTab.min.js');
const {extract,place,fresh,stringNames}=require('../js/tab-atoms.js').TabAtoms;

const score=tex=>alphaTab.importer.ScoreLoader.loadAlphaTex('\\tempo 120 . '+tex);

test('string names run from the lowest string and tell the two E strings apart',()=>{
    assert.deepEqual(stringNames([64,59,55,50,45,40]),['E','A','D','G','B','e']);
    assert.deepEqual(stringNames([62,57,53,48,43,38]),['D','G','C','F','A','d']);
});
test('techniques are read from the notes with fret and string',()=>{
    const ev=extract(score('3.3{h} 5.3 5.3{b (0 4)} 5.3{v} | 7.3{sl} 9.3 (5.3 7.2) 12.1{nh} 3.3{tp 8} | 5.3{b (0 1)} 5.3{b (4 0)} 5.3{ac} 5.3{g} 7.3{h} 5.3{h} 7.3 |'),0);
    assert.deepEqual(ev.map(e=>[e.bar,e.tick,e.technique,e.label]),[
        [0,0,'hammer','3–5 лад, струна G'],
        [0,1920,'bend','5 лад, струна G, на тон'],
        [0,2880,'vibrato','5 лад, струна G'],
        [1,0,'slide','7–9 лад, струна G'],
        [1,1920,'double','лады 5 и 7, струны G, B'],
        [1,2880,'harmonic','12 лад, струна e'],
        [1,3840,'tremolo','3 лад, струна G'],
        [2,0,'qbend','5 лад, струна G'],
        [2,960,'release','5 лад, струна G, на тон'],
        [2,1920,'accent','5 лад, струна G'],
        [2,2880,'ghost','5 лад, струна G'],
        [2,3840,'legato','7–5–7 лад, струна G']
    ]);
});
test('a run of palm-muted notes is one atom, a pull-off goes down',()=>{
    const ev=extract(score('5.6{pm} 5.6{pm} 5.6{pm} 7.3 | 5.6{pm} 7.3{h} 5.3 r |'),0);
    assert.deepEqual(ev.map(e=>[e.bar,e.technique,e.label]),[
        [0,'palm','струна E, 3 ноты'],
        [1,'palm','струна E'],
        [1,'pull','7–5 лад, струна G']
    ]);
});
test('a technique lands in the first part that plays its bar, stretched over the part',()=>{
    const bars=[{ms:2000,ticks:3840},{ms:2000,ticks:3840},{ms:2000,ticks:3840}];
    const parts=[{start:10,end:14,bars:[1,2]},{start:20,end:22,bars:[1,2]},{start:30,end:31,bars:null},{start:40,end:42,bars:[3,3]}];
    const ev=[{bar:0,tick:1920,technique:'bend',label:'a'},{bar:1,tick:0,technique:'palm',label:'b'},{bar:2,tick:960,technique:'slide',label:'c'},{bar:5,tick:0,technique:'gap',label:''}];
    const r=place(ev,bars,parts);
    assert.deepEqual(r.atoms.map(a=>[a.technique,a.time,a.segmentIndex,a.view]),[['bend',11,0,'left'],['palm',12,0,'right'],['slide',40.5,3,'left']]);
    assert.equal(r.unplaced,1);
});
test('suggestions already in the list are skipped',()=>{
    const s=[{technique:'bend',time:11},{technique:'bend',time:12},{technique:'palm',time:11}];
    assert.deepEqual(fresh(s,[{technique:'bend',time:11.1},{technique:'slide',time:12}]),[s[1],s[2]]);
});
test('in a part synced to the sound a technique goes to the heard note',()=>{
    globalThis.TabLive=require('../js/tab-live.js').TabLive;
    const bars=[{ms:2000,ticks:3840}];
    const parts=[{start:10,end:14,bars:[1,1],sync:[[1,0,10.3],[1,1920,12.6]]}];
    const r=place([{bar:0,tick:1920,technique:'bend',label:'a'}],bars,parts);
    assert.equal(r.atoms[0].time,12.6);
});
