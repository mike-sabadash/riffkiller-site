const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const Media = require('../js/practice-media.js');
async function server(t, handler) {
    const s = http.createServer(handler);
    await new Promise(resolve => s.listen(0, '127.0.0.1', resolve));
    t.after(() => { s.closeAllConnections(); s.close(); });
    return 'http://127.0.0.1:' + s.address().port;
}
test('pair waits for the slower camera; byte progress never reports false readiness', async t => {
    let finish;
    const base = await server(t, (req, res) => {
        res.writeHead(200, {'Content-Type':'video/mp4','Content-Length':8});
        res.write('1234');
        if (req.url === '/right') finish = () => res.end('5678');
        else res.end('5678');
    });
    let seePartial;
    const partial = new Promise(resolve => seePartial = resolve);
    const states = [];
    const loader = new Media({onProgress: state => {
        states.push(state);
        if (state.items[0].done && state.items[1].loaded === 4) seePartial();
    }});
    t.after(() => loader.destroy());
    let resolved = false;
    const result = loader.load([{label:'Left',sources:[base+'/left']},{label:'Right',sources:[base+'/right']}]).then(urls => {resolved=true;return urls});
    await partial;
    assert.equal(resolved, false);
    const state = states.at(-1);
    assert.equal(state.loaded / state.total, .75);
    finish();
    const urls = await result;
    assert.equal(urls.length, 2);
    assert.ok(urls.every(url => url.startsWith('blob:')));
    assert.equal((await (await fetch(urls[1])).text()), '12345678');
    assert.equal(states.at(-1).items.every(item => item.done),true);
});
test('missing direct recording falls back and duplicate camera sources download once', async t => {
    const paths=[];
    const base = await server(t, (req, res) => {
        paths.push(req.url);
        if (req.url === '/missing') {res.writeHead(404);res.end();}
        else res.end('recording');
    });
    const loader = new Media();t.after(() => loader.destroy());
    const item = {label:'Camera', sources:[base+'/missing',base+'/fallback']};
    const urls = await loader.load([item,item]);
    assert.deepEqual(paths,['/missing','/fallback']);
    assert.equal(urls[0],urls[1]);
    loader.destroy();
    await assert.rejects(fetch(urls[0]));
});
test('unknown content length remains indeterminate until the recording finishes', async t => {
    const base=await server(t,(req,res)=>{res.write('part');res.end('last');});
    const states=[];const loader=new Media({onProgress:s=>states.push(s)});t.after(()=>loader.destroy());
    await loader.load([{label:'Camera',sources:[base]}]);
    assert.ok(states.some(s=>s.loaded>0 && s.total===0));
    assert.equal(states.at(-1).loaded,8);
    assert.equal(states.at(-1).total,8);
});
test('idle download timeout aborts the pair so Retry can start a fresh loader', async t => {
    const base=await server(t,(req,res)=>{res.writeHead(200,{'Content-Length':8});res.write('1');});
    const loader=new Media({idleTimeout:50});
    await assert.rejects(loader.load([{label:'Camera',sources:[base]}]));
    assert.equal(loader.cancelled,true);
    assert.equal(loader.urls.length,0);
});
