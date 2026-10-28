const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const V=require('../js/riff-dna-vocab.js').RiffDNAVocab;

// Runs a dictionary file the way the browser does and returns what it registers.
function dict(lang){
    let registered;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/i18n',lang+'.js'),'utf8'),{window:{RK_I18N:{register:d=>{registered=d;}}}});
    return registered;
}
function translate(d,text){
    if(Object.hasOwn(d.exact,text))return d.exact[text];
    const part=s=>Object.hasOwn(d.exact,s)?d.exact[s]:s;
    for(const [re,out] of d.patterns){const m=text.match(re);if(m)return typeof out==='function'?out(m,part):out.replace(/\$(\d)/g,(_,n)=>m[n]||'');}
    return null;
}
const ru=dict('ru'),es=dict('es');

test('Russian and Spanish cover the same English strings, none left empty',()=>{
    assert.deepEqual(Object.keys(ru.exact).sort(),Object.keys(es.exact).sort());
    for(const d of [ru,es])for(const [k,v] of Object.entries(d.exact))assert.ok(v.trim(),k);
    assert.ok(Object.keys(ru.exact).length>400);
});
test('every Riff DNA role, hint and technique is translated',()=>{
    for(const d of [ru,es]){
        for(const r of V.roles){assert.ok(Object.hasOwn(d.exact,r.label),r.label);assert.ok(Object.hasOwn(d.exact,r.hint),r.hint);}
        for(const t of V.techniques)assert.ok(Object.hasOwn(d.exact,t.label),t.label);
    }
});
test('numbers keep Russian plural forms and Spanish singular',()=>{
    assert.equal(translate(ru,'1 shots'),'1 фрагмент');
    assert.equal(translate(ru,'3 shots'),'3 фрагмента');
    assert.equal(translate(ru,'11 shots'),'11 фрагментов');
    assert.equal(translate(ru,'21 days'),'21 день');
    assert.equal(translate(ru,'2 riffs'),'2 риффа');
    assert.equal(translate(es,'1 shots'),'1 toma');
    assert.equal(translate(es,'4 riffs'),'4 riffs');
    assert.equal(translate(ru,'Shot 4 · 0:11'),'Фрагмент 4 · 0:11');
});
test('patterns translate the known part and keep admin text as typed',()=>{
    assert.equal(translate(ru,'Next: Bend at 0:05'),'Далее: Бенд в 0:05');
    assert.equal(translate(es,'Next: My custom lick at 0:05'),'Sigue: My custom lick en 0:05');
    assert.equal(translate(ru,'Payment: Promo · Next billing: Oct 21, 2026'),'Оплата: Промокод · Следующее списание: Oct 21, 2026');
    assert.equal(translate(ru,'Black Dog'),null);
});
test('every public page loads the language script before the header',()=>{
    const pages=['index.html','app.html','landing.html','practice.html','profile.html','collection.html','billing.html','billing-wallet.html','billing-stripe.html','billing-cryptomus.html','cryptomus-success.html','stripe-success.html','stripe-cancel.html','patreon-callback.html','coming-soon.html','privacy.html','terms.html'];
    for(const p of pages){
        const html=fs.readFileSync(path.join(__dirname,'..',p),'utf8');
        const at=html.indexOf('js/i18n.js');
        assert.ok(at>0&&at<html.indexOf('</head>'),p);
        const header=html.indexOf('js/site-header.js');
        if(header>0)assert.ok(at<header,p);
    }
});
test('js/i18n dictionaries match tools/i18n/strings.py',()=>{
    const out=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'rk-i18n-'));
    require('node:child_process').execFileSync('python3',[path.join(__dirname,'../tools/i18n/build.py'),out]);
    for(const f of ['ru.js','es.js'])assert.equal(fs.readFileSync(path.join(out,f),'utf8'),fs.readFileSync(path.join(__dirname,'../js/i18n',f),'utf8'),f+' is stale: run python3 tools/i18n/build.py');
    fs.rmSync(out,{recursive:true,force:true});
});
