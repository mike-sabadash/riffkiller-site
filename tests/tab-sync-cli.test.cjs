const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const alphaTab=require('../js/vendor/alphatab/alphaTab.min.js');
const {barDurations}=require('../js/tab-live.js').TabLive;
const {events,tabLength}=require('../js/tab-sync.js').TabSync;
const {render,perform,writeWav}=require('./guitar-synth.cjs');

test('agent tool syncs a typed tab to a video sound and writes it into the riff, keeping a backup',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rk-tabcli-')),root=path.join(dir,'root');
    const texFile=path.join(__dirname,'../content/tabs/led-zeppelin/black-dog.tex');
    const score=alphaTab.importer.ScoreLoader.loadAlphaTex(fs.readFileSync(texFile,'utf8')),d=barDurations(score.masterBars,score.tempo);
    // Four shots of the video play bars 1–2, 3–4, 6–7 and 12–13, a little faster than the tab's tempo.
    let t=0.5;const notes=[],segments=[];
    for(const [a,b] of [[1,2],[3,4],[6,7],[12,13]]){
        const len=tabLength(a,b,d)/1000*0.95;
        notes.push(...perform(events(score,0,a,b,d),tabLength(a,b,d),t,0.95,0.012,a));
        segments.push({start:+(t-0.1).toFixed(3),end:+(t+len).toFixed(3),role:'call',name:'Shot'});t+=len+0.6;
    }
    writeWav(path.join(dir,'a.wav'),render(notes,t+1));
    fs.mkdirSync(path.join(root,'data'),{recursive:true});
    fs.writeFileSync(path.join(root,'data/riffs.json'),JSON.stringify([{id:1,song:'Black Dog',artist:'Led Zeppelin',segments,dna:{rule:'kept',atoms:[{technique:'qbend',type:'Quarter-tone bend',time:0.5,segmentIndex:0}]}},{id:2,song:'Other',artist:'X',segments:[]}]));
    const report=execFileSync('node',[path.join(__dirname,'../tools/tab-sync-cli.cjs'),'--riffs',path.join(root,'data/riffs.json'),'--id','1','--tex',texFile,'--wav',path.join(dir,'a.wav'),'--out',path.join(dir,'patch.json')],{encoding:'utf8'});
    assert.match(report,/Synced 4 of 4 parts/,report);
    execFileSync('php',[path.join(__dirname,'../scripts/riff-tab-apply.php'),root,path.join(dir,'patch.json'),path.join(dir,'backups')]);
    const [riff,other]=JSON.parse(fs.readFileSync(path.join(root,'data/riffs.json'),'utf8'));
    assert.deepEqual(riff.segments.map(s=>s.tabBars),[[1,2],[3,4],[6,7],[12,13]]);
    assert.match(riff.tab.tex,/Black Dog/);
    assert.equal(riff.segments[0].name,'Shot','other fields stay');
    assert.equal(other.tab,undefined,'other riffs untouched');
    assert.equal(fs.readdirSync(path.join(dir,'backups')).length,1);
    // Techniques written in the tab land on the parts that play them, next to the ones the author set.
    assert.match(report,/Techniques from the tab: \d+ new/,report);
    assert.equal(riff.dna.rule,'kept');
    const fromTab=riff.dna.atoms.filter(a=>a.source==='tab');
    assert.ok(fromTab.some(a=>a.technique==='legato')&&fromTab.some(a=>a.technique==='qbend'),JSON.stringify(riff.dna.atoms));
    assert.ok(fromTab.every(a=>a.segmentIndex>=0&&a.segmentIndex<4&&a.time>=segments[a.segmentIndex].start-0.01&&a.time<=segments[a.segmentIndex].end+0.01));
    assert.equal(riff.dna.atoms.filter(a=>a.technique==='qbend'&&Math.abs(a.time-0.5)<0.25).length,1,'no second copy of an atom already there');
    // Writing the same patch again adds nothing.
    execFileSync('php',[path.join(__dirname,'../scripts/riff-tab-apply.php'),root,path.join(dir,'patch.json'),path.join(dir,'backups')]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/riffs.json'),'utf8'))[0].dna.atoms.length,riff.dna.atoms.length);
    // A patch computed before the parts were moved is refused.
    const store=JSON.parse(fs.readFileSync(path.join(root,'data/riffs.json'),'utf8'));store[0].segments[0].start=0.2;
    fs.writeFileSync(path.join(root,'data/riffs.json'),JSON.stringify(store));
    assert.throws(()=>execFileSync('php',[path.join(__dirname,'../scripts/riff-tab-apply.php'),root,path.join(dir,'patch.json'),path.join(dir,'backups')],{stdio:'pipe'}));
    fs.rmSync(dir,{recursive:true,force:true});
});
test('replace mode leaves on a synced part exactly the tab techniques, keeping a matching tip',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rk-tabrep-')),root=path.join(dir,'root');
    fs.mkdirSync(path.join(root,'data'),{recursive:true});
    const segments=[{start:0,end:1.6},{start:1.7,end:3.4},{start:3.6,end:5}];
    fs.writeFileSync(path.join(root,'data/riffs.json'),JSON.stringify([{id:1,song:'S',artist:'A',segments,dna:{atoms:[
        {technique:'bend',time:0.3,segmentIndex:0},
        {technique:'qbend',time:1.0,segmentIndex:0,tip:'just a nudge',source:'tab'},
        {technique:'legato',time:1.6,segmentIndex:0,source:'tab'},
        {technique:'vibrato',time:4,segmentIndex:2},
        {technique:'other',type:'Groove',segmentIndex:0}
    ]}}]));
    fs.writeFileSync(path.join(dir,'patch.json'),JSON.stringify({id:1,tab:{tex:'x'},expect:segments.map(s=>[s.start,s.end]),
        segments:{0:{tabBars:[1,2],tabSync:[[1,0,0.1]]},1:{tabBars:[2,3],tabSync:[[2,0,1.8]]}},atomsMode:'replace',
        atoms:[{technique:'qbend',time:1.05,segmentIndex:0},{technique:'legato',time:1.9,segmentIndex:1}]}));
    const out=execFileSync('php',[path.join(__dirname,'../scripts/riff-tab-apply.php'),root,path.join(dir,'patch.json'),path.join(dir,'backups')],{encoding:'utf8'});
    assert.match(out,/1 techniques added, 2 removed/);
    const atoms=JSON.parse(fs.readFileSync(path.join(root,'data/riffs.json'),'utf8'))[0].dna.atoms;
    assert.deepEqual(atoms.map(a=>[a.technique,a.time,a.segmentIndex]).sort(),[['legato',1.9,1],['other',undefined,0],['qbend',1.05,0],['vibrato',4,2]]);
    assert.equal(atoms.find(a=>a.technique==='qbend').tip,'just a nudge');
    fs.rmSync(dir,{recursive:true,force:true});
});
