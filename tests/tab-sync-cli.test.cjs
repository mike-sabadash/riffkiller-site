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
    fs.writeFileSync(path.join(root,'data/riffs.json'),JSON.stringify([{id:1,song:'Black Dog',artist:'Led Zeppelin',segments},{id:2,song:'Other',artist:'X',segments:[]}]));
    const report=execFileSync('node',[path.join(__dirname,'../tools/tab-sync-cli.cjs'),'--riffs',path.join(root,'data/riffs.json'),'--id','1','--tex',texFile,'--wav',path.join(dir,'a.wav'),'--out',path.join(dir,'patch.json')],{encoding:'utf8'});
    assert.match(report,/Synced 4 of 4 parts/,report);
    execFileSync('php',[path.join(__dirname,'../scripts/riff-tab-apply.php'),root,path.join(dir,'patch.json'),path.join(dir,'backups')]);
    const [riff,other]=JSON.parse(fs.readFileSync(path.join(root,'data/riffs.json'),'utf8'));
    assert.deepEqual(riff.segments.map(s=>s.tabBars),[[1,2],[3,4],[6,7],[12,13]]);
    assert.match(riff.tab.tex,/Black Dog/);
    assert.equal(riff.segments[0].name,'Shot','other fields stay');
    assert.equal(other.tab,undefined,'other riffs untouched');
    assert.equal(fs.readdirSync(path.join(dir,'backups')).length,1);
    // A patch computed before the parts were moved is refused.
    const store=JSON.parse(fs.readFileSync(path.join(root,'data/riffs.json'),'utf8'));store[0].segments[0].start=0.2;
    fs.writeFileSync(path.join(root,'data/riffs.json'),JSON.stringify(store));
    assert.throws(()=>execFileSync('php',[path.join(__dirname,'../scripts/riff-tab-apply.php'),root,path.join(dir,'patch.json'),path.join(dir,'backups')],{stdio:'pipe'}));
    fs.rmSync(dir,{recursive:true,force:true});
});
