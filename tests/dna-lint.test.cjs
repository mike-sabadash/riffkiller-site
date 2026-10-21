const {test}=require('node:test');
const assert=require('node:assert/strict');
const {check}=require('../js/riff-dna-lint.js');
const fs=require('node:fs');const path=require('node:path');

const seg=(start,end,role,fn='Does something')=>({start,end,role,function:fn});
const full={rule:'Simple cells, uneven phrase.',mutation:{steps:['Leave a gap']}};
const texts=r=>check(r).map(w=>w.text);

test('the Black Dog lesson passes clean',()=>{
    const riffs=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/riffs.json')));
    const bd=riffs.find(r=>r.song==='Black Dog');
    assert.deepEqual(texts(bd),[]);
});

test('a three-part phrase that lands is fine',()=>{
    assert.deepEqual(texts({segments:[seg(0,2,'call'),seg(2,4,'push'),seg(4,6,'land')],dna:full}),[]);
});

test('gaps, forgotten roles and missing descriptions are pointed at the part',()=>{
    const w=check({segments:[seg(0,2,'call'),seg(3,4,''),seg(4,6,'land',''),seg(6,7,'','')],dna:full});
    assert.deepEqual(w.map(x=>x.segment),[0,2],JSON.stringify(w));
    assert.match(w[0].text,/Между частями 1 и 2 пропуск 1\.0 с/);
    assert.match(w[1].text,/Часть 3 \(Land\) без описания/);
    const forgot=check({segments:[seg(0,2,'call'),seg(2,4,'',''),seg(4,6,'land')],dna:full});
    assert.equal(forgot[0].segment,1);assert.match(forgot[0].text,/без роли посреди фразы/);
});

test('a phrase that never lands, or is all one role, is flagged',()=>{
    assert.match(texts({segments:[seg(0,2,'call'),seg(2,4,'climb')],dna:full}).join(),/не приходит домой/);
    assert.match(texts({segments:[seg(0,2,'repeat'),seg(2,4,'repeat'),seg(4,6,'repeat')],dna:full}).join(),/одна роль \(Repeat\)/);
});

test('atoms without time or outside the parts, and empty rule or exercise',()=>{
    const w=texts({segments:[seg(0,2,'call'),seg(2,4,'land')],dna:{rule:'x'.repeat(95),atoms:[{technique:'bend',segmentIndex:0},{technique:'slide',time:9}]}});
    assert.match(w[0],/Приём 1 \(Bend\) без времени/);
    assert.match(w[1],/Приём 2 \(Slide\) на 9\.00 с не попадает/);
    assert.match(w[2],/длиннее 90 знаков \(95\)/);
    assert.match(w[3],/Нет шагов упражнения/);
    assert.match(texts({segments:[seg(0,2,'call'),seg(2,4,'land')],dna:{mutation:{steps:['a']}}}).join(),/Нет правила риффа/);
});

test('practice-only lessons without DNA are left alone',()=>{
    assert.deepEqual(texts({segments:[seg(0,2,'',''),seg(2,4,'','')],dna:{}}),[]);
});
