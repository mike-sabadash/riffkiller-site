const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {startSite}=require('./site-fixture.cjs');
let site,browser;
before(async()=>{
    site=await startSite();
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN || undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
    console.log('Media:',site.realMedia?'restored original MP4s':'generated CI fixtures');
});
after(async()=>{await browser?.close();site?.stop()});
async function pageFor(t,width=1440) {
    const context=await browser.newContext({viewport:{width,height:1000}});t.after(()=>context.close());
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    t.after(()=>assert.deepEqual(errors,[],'No browser JavaScript errors'));
    await page.route(/fonts\.(googleapis|gstatic)\.com/,route=>route.abort());
    await page.addInitScript(()=>localStorage.setItem('riffKillerOnboardingSeen','1'));
    return page;
}
async function practice(page,id=1) {
    await page.goto(site.base+'/practice.html?riff='+id,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelectorAll('#segmentControls .segment-btn').length>1);
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('#videoWrapper video')).slice(0,2).every(v=>v.readyState>=3));
}
test('home opens the library; normal sign-up and login survive reload without a promo gate',async t=>{
    const page=await pageFor(t);await page.goto(site.base+'/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#riffsGrid .riff-card');
    assert.equal(await page.locator('#comingSoonLanding').count(),0);
    assert.ok((await page.locator('body').innerText()).includes('Kill every riff'));assert.ok(await page.locator('#homeHeroPrimary').getAttribute('href'));
    await page.getByText('Sign up',{exact:true}).first().click();
    await page.fill('#authModalNameInput','Browser Practice');await page.fill('#authModalEmailInput','browser-test@example.com');await page.fill('#authModalPasswordInput','browser-test-password');
    await page.click('#authModalEmailBtn');await page.waitForFunction(()=>window.authManager.isAuthenticated);
    const id=await page.evaluate(()=>window.authManager.userData.id);
    await page.reload({waitUntil:'domcontentloaded'});await page.evaluate(()=>window.authManager.ready);
    assert.equal(await page.evaluate(()=>window.authManager.userData.id),id);
    fs.mkdirSync(path.join(site.dir,'data/subscriptions'),{recursive:true});
    fs.writeFileSync(path.join(site.dir,'data/subscriptions',id+'.json'),JSON.stringify({status:'active',source:'patreon',plan:'monthly',expires:Math.floor(Date.now()/1000)+3600}));
    await page.reload({waitUntil:'domcontentloaded'});await page.evaluate(()=>window.authManager.ready);
    assert.equal(await page.evaluate(()=>window.authManager.hasActiveSubscription()),true);
    await page.evaluate(()=>window.authManager.logout());await page.waitForURL('**/index.html',{waitUntil:'domcontentloaded'});
    await page.getByText('Log in',{exact:true}).first().click();await page.fill('#authModalEmailInput','browser-test@example.com');await page.fill('#authModalPasswordInput','browser-test-password');await page.click('#authModalEmailBtn');
    await page.waitForFunction(()=>window.authManager.isAuthenticated && window.authManager.hasActiveSubscription());
    if(process.env.QA_SCREENSHOTS)await page.screenshot({path:path.join(process.env.QA_SCREENSHOTS,'library-desktop.png'),fullPage:true});
});
test('collection page lists its riffs and the profile shows no placeholder payments',async t=>{
    const page=await pageFor(t);await page.goto(site.base+'/collection.html?id=1',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#collectionRiffsGrid .riff-card');
    const expected=JSON.parse(fs.readFileSync(path.join(site.dir,'data/collections.json'))).find(c=>c.id===1).riffs?.length;
    if(expected)assert.equal(await page.locator('#collectionRiffsGrid .riff-card').count(),expected);
    await page.goto(site.base+'/profile.html',{waitUntil:'domcontentloaded'});
    assert.equal(await page.getByText('15 March 2026').count(),0);
});
test('email submits with Enter, blocks duplicate requests and recovers after a wrong password',async t=>{
    const page=await pageFor(t);await page.goto(site.base+'/',{waitUntil:'domcontentloaded'});
    await page.getByText('Sign up',{exact:true}).first().click();
    await page.fill('#authModalNameInput','Email UX');await page.fill('#authModalEmailInput','email-ux@example.com');await page.fill('#authModalPasswordInput','email-ux-password');
    let requests=0;
    await page.route('**/api/auth/email-register.php',async route=>{requests++;await new Promise(r=>setTimeout(r,350));await route.continue()});
    await page.press('#authModalPasswordInput','Enter');
    await page.waitForFunction(()=>document.querySelector('#authModalEmailBtn').disabled);
    assert.equal(await page.locator('#authTabSignup').isDisabled(),true);
    await page.press('#authModalPasswordInput','Enter');await page.waitForFunction(()=>authManager.isAuthenticated);
    assert.equal(requests,1);const id=await page.evaluate(()=>authManager.userData.id);
    await page.evaluate(()=>authManager.logout());await page.waitForURL('**/index.html',{waitUntil:'domcontentloaded'});
    await page.getByText('Log in',{exact:true}).first().click();await page.fill('#authModalEmailInput','email-ux@example.com');await page.fill('#authModalPasswordInput','wrong');await page.press('#authModalPasswordInput','Enter');
    await page.waitForSelector('#authModalEmailMessage',{state:'visible'});assert.equal(await page.locator('#authModalEmailBtn').isEnabled(),true);assert.equal(await page.evaluate(()=>authManager.isAuthenticated),false);
    await page.fill('#authModalPasswordInput','email-ux-password');await page.press('#authModalPasswordInput','Enter');await page.waitForFunction(()=>authManager.isAuthenticated);
    await page.reload({waitUntil:'domcontentloaded'});await page.evaluate(()=>authManager.ready);assert.equal(await page.evaluate(()=>authManager.userData.id),id);
});
test('Google configuration failure returns to an actionable login dialog',async t=>{
    const page=await pageFor(t);await page.goto(site.base+'/',{waitUntil:'domcontentloaded'});await page.getByText('Log in',{exact:true}).first().click();
    await page.click('#authModalGoogle');await page.waitForURL('**/app.html',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#authModalEmailMessage',{state:'visible'});assert.match(await page.locator('#authModalEmailMessage').innerText(),/Use email or Patreon/);
    assert.equal(await page.locator('#authModalEmailInput').isVisible(),true);assert.equal(await page.locator('#authModalPatreon').isVisible(),true);
});
test('successful Patreon callback returns to the application',async t=>{
    const page=await pageFor(t);await page.addInitScript(()=>localStorage.setItem('patreonState','fixture-state'));
    await page.route('**/patreon-exchange.php',route=>route.fulfill({json:{success:true,token:'fixture-token',user:{id:'fixture-patreon',full_name:'Fixture'},subscription:{status:'active',source:'patreon'}}}));
    await page.route('**/patreon-validate.php',route=>route.fulfill({json:{success:true,user:{id:'fixture-patreon',full_name:'Fixture'},subscription:{status:'active',source:'patreon'}}}));
    await page.goto(site.base+'/patreon-callback.html?code=fixture&state=fixture-state',{waitUntil:'domcontentloaded'});await page.waitForURL('**/app.html',{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#comingSoonLanding').count(),0);
});
test('segment loops, angle changes, tabs, slow motion, drift correction and pause stay synchronized',async t=>{
    const page=await pageFor(t);await practice(page);
    await page.locator('.segment-btn').nth(3).click();
    await page.waitForFunction(()=>!document.getElementById('leftVideo').paused);
    const sample=()=>page.evaluate(()=>({l:leftVideo.currentTime,r:rightVideo.currentTime,lp:leftVideo.paused,rp:rightVideo.paused,rate:leftVideo.playbackRate}));
    let state=await sample();assert.ok(state.l>=3.64 && state.l<5.7,JSON.stringify(state));
    await page.click('#toggleTabs');await page.waitForFunction(()=>document.querySelector('.tabs-image')?.complete);
    assert.match(await page.locator('.tabs-image').getAttribute('src'),/3\.png$/);
    await page.locator('[data-mode="right"]').click();await page.locator('[data-mode="split"]').click();
    assert.equal(await page.locator('#toggleTabs').evaluate(el=>el.classList.contains('active')),true);
    await page.locator('.speed-btn[data-speed="0.5"]').click();state=await sample();assert.equal(state.rate,.5);
    await page.evaluate(()=>{rightVideo.currentTime=leftVideo.currentTime+.3;});
    await page.waitForFunction(()=>Math.abs(rightVideo.currentTime-leftVideo.currentTime)<.09);
    const samples=await page.evaluate(async()=>{const values=[];for(let i=0;i<44;i++){values.push({l:leftVideo.currentTime,r:rightVideo.currentTime});await new Promise(r=>setTimeout(r,100));}return values;});
    assert.ok(samples.every(v=>v.l>=3.60 && v.l<=5.70),JSON.stringify(samples));
    assert.ok(samples.some((v,i)=>i && v.l<samples[i-1].l),'Segment actually loops');
    await page.click('#playControl');state=await sample();assert.ok(state.lp && state.rp);const paused=state.l;
    await page.waitForTimeout(250);assert.ok(Math.abs((await sample()).l-paused)<.02);
    await page.locator('.dna-stage[data-dna-stage="isolate"]').click();await page.locator('[data-dna-atom="2"]').click();
    await page.waitForFunction(()=>!leftVideo.paused);state=await sample();assert.equal(state.rate,.5);assert.ok(state.l>=1.7 && state.l<3.6);
    for(const stage of ['scan','split','decode','mutate']){await page.locator('.dna-stage[data-dna-stage="'+stage+'"]').click();assert.ok((await page.locator('#dnaStageContent').innerText()).length>20);}
    if(process.env.QA_SCREENSHOTS)await page.screenshot({path:path.join(process.env.QA_SCREENSHOTS,'practice-desktop.png'),fullPage:true});
});
test('All Riff updates tabs; Speed Trainer advances only on completed loops',async t=>{
    const page=await pageFor(t);await practice(page);await page.click('#toggleTabs');await page.locator('.segment-btn.all-riff').click();
    await page.evaluate(()=>practiceTransport.seek(6.3));await page.waitForFunction(()=>document.querySelector('.tabs-image')?.getAttribute('src')?.endsWith('/4.png'));
    await page.locator('.segment-btn').nth(1).click();await page.click('#modeSpeedBtn');
    const intro=page.locator('#speedTrainerIntroModal');if(await intro.isVisible())await page.locator('#speedTrainerIntroBtn').click();
    await page.waitForFunction(()=>playbackSpeed===.5);
    await page.evaluate(()=>{practiceTransport.pause();currentSegment=6;loopAllRiff=false;loopActive=true;setPracticeMode('speed');practiceTransport.seek(11.06);return practiceTransport.play();});
    await page.waitForFunction(()=>playbackSpeed===.75,{timeout:12000});
    assert.equal(await page.evaluate(()=>rightVideo.playbackRate),.75);
});
test('editor captures boundaries, edits Atoms, saves and reopens without losing metadata',async t=>{
    const page=await pageFor(t);const [name,value]=(await site.adminCookie()).split('=');await page.context().addCookies([{name,value,url:site.base}]);await page.goto(site.base+'/admin/riffs.html',{waitUntil:'domcontentloaded'});await page.click('.admin-tab[data-tab="edit"]');await page.selectOption('#riffSelect','1');
    await page.waitForFunction(()=>document.querySelectorAll('#segmentRows .segment-row').length===10);
    assert.equal(await page.locator('#dnaAtomsEditor > div').count(),4);
    await page.waitForFunction(()=>document.getElementById('segmentEditorVideo').readyState>=2);
    await page.evaluate(()=>{segmentEditorVideo.currentTime=.1;});await page.waitForFunction(()=>!segmentEditorVideo.seeking);await page.click('#segmentSetStart');
    assert.equal(Number(await page.locator('#segmentRows .start').first().inputValue()),.1);
    await page.locator('#segmentRows .name').first().fill('Edited in browser');
    await page.locator('#dnaAtomsEditor [data-field="label"]').first().fill('Edited Atom');
    var firstSave = page.waitForResponse(r=>r.url().endsWith('/api/riffs/save.php'));
    // The first Atom (0.05 s) is now before the moved start of part 1: the markup check says so, save anyway.
    await page.click('#submitBtn');await page.waitForSelector('#dnaLintDialog[open]');
    assert.match(await page.locator('#dnaLintList').innerText(),/0\.05 с не попадает/);
    await page.click('#dnaLintSave');assert.equal((await firstSave).status(),200);
    await page.waitForSelector('#saveFeedback.show');
    await page.waitForFunction(()=>document.querySelector('#riffForm').dataset.editId==='1' && document.querySelector('#riffSelect').value==='1');
    await page.waitForTimeout(200);
    var secondSave = page.waitForResponse(r=>r.url().endsWith('/api/riffs/save.php'));
    await page.click('#submitBtn');await page.click('#dnaLintSave');assert.equal((await secondSave).status(),200);
    await page.reload({waitUntil:'domcontentloaded'});await page.click('.admin-tab[data-tab="edit"]');await page.selectOption('#riffSelect','1');await page.waitForFunction(()=>document.querySelectorAll('#segmentRows .segment-row').length===10);
    assert.equal(await page.locator('#segmentRows .name').first().inputValue(),'Edited in browser');
    assert.equal(await page.locator('#segmentRows .role').first().inputValue(),'launch');
    assert.equal(await page.locator('#dnaAtomsEditor [data-field="label"]').first().inputValue(),'Edited Atom');
    assert.match(await page.locator('#segmentRows .tab-image').first().inputValue(),/1\.png$/);
    if(process.env.QA_SCREENSHOTS)await page.screenshot({path:path.join(process.env.QA_SCREENSHOTS,'editor-desktop.png'),fullPage:true});
    await practice(page);assert.match(await page.locator('.segment-btn').nth(1).innerText(),/Edited in browser/);
});
// Browser-playable stand-in for the camera files (sandboxed Chromium may lack H.264).
let webmCache;
function webm(){
    if(!webmCache){const file=path.join(require('node:os').tmpdir(),'rk-editor-'+process.pid+'.webm');
        require('node:child_process').execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-t','18.57','-c:v','libvpx-vp9','-b:v','200k','-deadline','realtime',file]);webmCache=file;}
    return webmCache;
}
async function editor(t,width=1440){
    // These tests save riff 1; put the catalog back so later tests see the fixture.
    const store=path.join(site.dir,'data/riffs.json'),original=fs.readFileSync(store);t.after(()=>fs.writeFileSync(store,original));
    const page=await pageFor(t,width);const [name,value]=(await site.adminCookie()).split('=');await page.context().addCookies([{name,value,url:site.base}]);
    const body=fs.readFileSync(webm());await page.route(/video\.php\?file=/,route=>route.fulfill({status:200,contentType:'video/webm',body,headers:{'Accept-Ranges':'bytes'}}));
    await page.goto(site.base+'/admin/riffs.html',{waitUntil:'domcontentloaded'});await page.click('.admin-tab[data-tab="edit"]');await page.selectOption('#riffSelect','1');
    await page.waitForFunction(()=>document.querySelectorAll('#segmentRows .segment-row').length===10);
    await page.waitForFunction(()=>segmentEditorVideo.readyState>=1&&segmentEditorVideo.duration>0);
    return page;
}
const bounds=page=>page.evaluate(()=>[...document.querySelectorAll('#segmentRows .segment-row')].map(r=>[Number(r.querySelector('.start').value),Number(r.querySelector('.end').value)]));
test('markup editor: S splits at the playhead, undo restores, dragging a boundary trims, keys pick roles and save persists',async t=>{
    const page=await editor(t);
    await page.evaluate(()=>{segmentEditorVideo.currentTime=2.5});await page.waitForFunction(()=>!segmentEditorVideo.seeking);
    await page.keyboard.press('s');
    assert.deepEqual((await bounds(page)).slice(1,3),[[1.7,2.5],[2.5,3.44]]);
    await page.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');
    assert.equal((await bounds(page)).length,10);
    // Tap S while the video runs past the end: a new part from the last boundary to the playhead.
    await page.evaluate(()=>{segmentEditorVideo.currentTime=18});await page.waitForFunction(()=>!segmentEditorVideo.seeking);
    const last=(await bounds(page)).at(-1)[1];await page.keyboard.press('s');
    assert.deepEqual((await bounds(page)).at(-1),[last,18]);
    // Trim the start of part 3 with the mouse.
    await page.locator('.tl').scrollIntoViewIfNeeded();const edge=await page.locator('.tl-seg').nth(2).locator('.tl-edge.l').boundingBox();
    await page.mouse.move(edge.x+3,edge.y+10);await page.mouse.down();await page.mouse.move(edge.x+33,edge.y+10,{steps:4});await page.mouse.up();
    const trimmed=(await bounds(page))[2];assert.ok(trimmed[0]>3.64&&trimmed[0]<trimmed[1],JSON.stringify(trimmed));
    await page.locator('.tl-seg').nth(0).click();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(()=>SegmentEditor.selected()),1);
    await page.locator('#segmentRows .segment-row').nth(1).locator('select.role').selectOption('answer');
    await page.locator('#segmentRows .segment-row').nth(1).locator('.function').fill('Replies to the first cell');
    assert.match(await page.locator('#edStatus').innerText(),/несохранённые/);
    assert.match(await page.locator('#segmentRows .segment-row').nth(1).locator('.seg-role-help').innerText(),/Answer/);
    // A part with a role but no description: the markup check asks first; Escape keeps editing, then save anyway.
    await page.evaluate(()=>SegmentEditor.select(3));await page.locator('#segmentRows .segment-row').nth(3).locator('.function').fill('');
    await page.keyboard.press('Control+s');await page.waitForSelector('#dnaLintDialog[open]');
    assert.match(await page.locator('#dnaLintList').innerText(),/без описания/);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#dnaLintDialog[open]').count(),0);
    const save=page.waitForResponse(r=>r.url().endsWith('/api/riffs/save.php'));await page.keyboard.press('Control+s');await page.click('#dnaLintSave');assert.equal((await save).status(),200);
    await page.waitForFunction(()=>/Сохранено/.test(document.getElementById('edStatus').textContent));
    const saved=JSON.parse(fs.readFileSync(path.join(site.dir,'data/riffs.json')))[0];
    assert.equal(saved.segments.length,11);assert.equal(saved.segments[1].role,'answer');assert.equal(saved.segments[1].function,'Replies to the first cell');
    assert.equal(saved.segments[2].start,trimmed[0]);assert.equal(saved.dna.atoms.length,4);
    if(process.env.QA_SCREENSHOTS)await page.screenshot({path:path.join(process.env.QA_SCREENSHOTS,'markup-editor.png'),fullPage:true});
});
test('two cameras from one recording: upload, frame both hands, cut and fill both video fields',async t=>{
    const page=await editor(t);
    await page.click('#openCutter');await page.setInputFiles('#cutFile',webm());
    await page.waitForFunction(()=>!document.getElementById('cutRun').disabled,{timeout:30000});
    const h=await page.locator('.cut-frame.right .cut-handle[data-h="nw"]').boundingBox();
    await page.mouse.move(h.x+7,h.y+7);await page.mouse.down();await page.mouse.move(h.x+60,h.y+40,{steps:4});await page.mouse.up();
    await page.click('#cutRun');
    await page.waitForFunction(()=>!document.getElementById('cutter').open,{timeout:60000});
    const left=await page.inputValue('#videoFile'),right=await page.inputValue('#videoFileRight');
    assert.match(left,/black-dog-left-2\.mp4$/);assert.match(right,/black-dog-right-2\.mp4$/);
    for(const f of [left,right])assert.ok(fs.existsSync(path.join(site.dir,f)),f);
    // Earlier tests leave markup warnings on this riff; they are not what this test checks, so save past them.
    const save=page.waitForResponse(r=>r.url().endsWith('/api/riffs/save.php'));await page.click('#submitBtn');
    if(await page.locator('#dnaLintDialog[open]').count())await page.click('#dnaLintSave');
    assert.equal((await save).status(),200);
    const saved=JSON.parse(fs.readFileSync(path.join(site.dir,'data/riffs.json')))[0];
    assert.equal(saved.videoFile,left);assert.match(saved.videoSource.file,/black-dog-source\.webm$/);
    assert.ok(saved.videoSource.right.w<320&&Math.abs(saved.videoSource.right.w/saved.videoSource.right.h-16/9)<0.02,JSON.stringify(saved.videoSource));
});
test('riff editor fits a phone screen without horizontal scrolling',async t=>{
    const page=await editor(t,390);
    const sizes=await page.evaluate(()=>({screen:innerWidth,page:document.documentElement.scrollWidth}));assert.ok(sizes.page<=sizes.screen+1,JSON.stringify(sizes));
});
test('mobile practice has all stages and usable segment controls without horizontal overflow',async t=>{
    const page=await pageFor(t,390);await practice(page);
    const sizes=await page.evaluate(()=>({screen:innerWidth,page:document.documentElement.scrollWidth}));assert.ok(sizes.page<=sizes.screen+1,JSON.stringify(sizes));
    assert.equal(await page.locator('.dna-stage').count(),5);
    for(const stage of ['scan','split','isolate','decode','mutate']) {
        assert.equal(await page.locator('[data-dna-stage="'+stage+'"]').isVisible(),true,stage+' visible');
        await page.locator('[data-dna-stage="'+stage+'"]').click();
    }
    await page.locator('.segment-btn').nth(2).click();await page.waitForFunction(()=>!leftVideo.paused);
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);
    if(process.env.QA_SCREENSHOTS)await page.screenshot({path:path.join(process.env.QA_SCREENSHOTS,'practice-mobile.png'),fullPage:true});
});


test('Normal restores speed and loop settings; manual speed and loop controls leave the ladder cleanly',async t=>{
    const page=await pageFor(t);await page.addInitScript(()=>localStorage.setItem('rkSpeedTrainerIntroSeen','1'));await practice(page);
    await page.locator('[data-speed="0.75"]').click();
    const before=await page.evaluate(()=>({speed:playbackSpeed,loop:loopActive,all:loopAllRiff}));
    await page.click('#modeSpeedBtn');
    assert.deepEqual(await page.evaluate(()=>({speed:playbackSpeed,loop:loopActive})),{speed:.5,loop:true});
    await page.click('#modeNormalBtn');
    assert.deepEqual(await page.evaluate(()=>({speed:playbackSpeed,loop:loopActive,all:loopAllRiff})),before);
    await page.click('#modeSpeedBtn');await page.locator('[data-speed="1"]').click();
    assert.deepEqual(await page.evaluate(()=>({mode:practiceMode,speed:playbackSpeed,loop:loopActive})),{mode:'normal',speed:1,loop:before.loop});
    await page.click('#modeSpeedBtn');await page.click('#loopButton');
    assert.equal(await page.evaluate(()=>practiceMode),'normal');assert.equal(await page.evaluate(()=>loopActive),false);
    await page.locator('.segment-btn.all-riff').click();await page.click('#modeSpeedBtn');
    assert.equal(await page.evaluate(()=>loopAllRiff),false);
    await page.click('#modeNormalBtn');assert.equal(await page.evaluate(()=>loopAllRiff),true);
    assert.equal(await page.evaluate(()=>leftVideo.paused),false);
    assert.equal(await page.evaluate(()=>leftVideo.playbackRate===rightVideo.playbackRate),true);
});
test('both recordings download before Play; loops, seeks and angle changes work offline',async t=>{
    const page=await pageFor(t);
    let release;
    const gate=new Promise(resolve=>release=resolve);t.after(()=>release());
    await page.route('**/*black-dog-right.mp4',async route=>{const response=await route.fetch();await gate;await route.fulfill({response});});
    await page.goto(site.base+'/practice.html?riff=1',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#videoLoadingPlaceholder',{state:'visible'});
    assert.equal(await page.locator('#playControl').isDisabled(),true);
    assert.equal(await page.evaluate(()=>videosFullyLoaded),false);
    assert.doesNotMatch(await page.locator('#videoLoadingText').innerText(),/100%/);
    release();await page.waitForFunction(()=>videosFullyLoaded);
    assert.match(await page.locator('#practiceMediaStatus').innerText(),/full riff downloaded/);
    assert.equal(await page.evaluate(()=>[leftVideo,rightVideo].every(v=>v.src.startsWith('blob:'))),true);
    await page.context().setOffline(true);
    await page.locator('.segment-btn').nth(3).click();await page.waitForFunction(()=>!leftVideo.paused);
    await page.locator('[data-mode="right"]').click();await page.locator('[data-mode="split"]').click();
    await page.evaluate(()=>practiceTransport.seek(4.1));
    await page.waitForFunction(()=>!leftVideo.seeking && !rightVideo.seeking);
    const samples=await page.evaluate(async()=>{const out=[];for(let i=0;i<32;i++){out.push(leftVideo.currentTime);await new Promise(r=>setTimeout(r,100));}return out;});
    assert.ok(samples.some((time,i)=>i && time<samples[i-1]),'A complete loop plays offline');
    assert.equal(await page.evaluate(()=>practiceTransport.buffering),false);
    assert.ok(await page.evaluate(()=>Math.abs(leftVideo.currentTime-rightVideo.currentTime)<.1));
});
test('interrupted downloads expose Retry and a fresh attempt enables both cameras',async t=>{
    const page=await pageFor(t);
    const fail=route=>route.fulfill({status:503,body:'unavailable'});
    await page.route(/black-dog.*\.mp4|video\.php/,fail);
    await page.goto(site.base+'/practice.html?riff=1',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#videoErrorState',{state:'visible'});
    assert.equal(await page.locator('#playControl').isDisabled(),true);
    await page.unroute(/black-dog.*\.mp4|video\.php/,fail);
    await page.click('#videoRetryBtn');await page.waitForFunction(()=>videosFullyLoaded);
    assert.equal(await page.locator('#playControl').isEnabled(),true);
    await page.click('#playControl');await page.waitForFunction(()=>!leftVideo.paused && !rightVideo.paused);
});
test('DNA tabs stay beside their content at desktop, tablet and mobile sizes; theme is reversibly hidden',async t=>{
    const page=await pageFor(t);await page.addInitScript(()=>localStorage.setItem('rk-theme','light'));await practice(page);
    assert.equal(await page.locator('.rk-theme-toggle').count(),0);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    assert.equal(await page.evaluate(()=>localStorage.getItem('rk-theme')),'light');
    for(const width of [1440,768,390]) {
        await page.setViewportSize({width,height:1000});
        for(const stage of ['scan','split','isolate','decode','mutate']) {
            const tab=page.locator('[data-dna-stage="'+stage+'"]');await tab.click();
            assert.equal(await tab.getAttribute('aria-selected'),'true');
            assert.equal(await page.locator('#dnaStagePanel').getAttribute('aria-labelledby'),'dna-tab-'+stage);
            const geometry=await page.evaluate(()=>{
                const nav=document.getElementById('dnaStageNav').getBoundingClientRect();
                const panel=document.getElementById('dnaStagePanel').getBoundingClientRect();
                return {gap:panel.top-nav.bottom,overflow:document.documentElement.scrollWidth-innerWidth};
            });
            assert.ok(geometry.gap>=0 && geometry.gap<45,JSON.stringify(geometry));
            assert.ok(geometry.overflow<=1,JSON.stringify(geometry));
        }
        await page.locator('#dna-tab-scan').click();await page.locator('#dna-tab-scan').press('ArrowRight');
        assert.equal(await page.locator('#dna-tab-split').getAttribute('aria-selected'),'true');
        if(process.env.QA_SCREENSHOTS){await page.waitForTimeout(250);await page.screenshot({path:path.join(process.env.QA_SCREENSHOTS,'workspace-'+width+'.png'),fullPage:true});}
    }
});
test('Riff DNA shows the phrase, a live map of roles and techniques that light up with the video',async t=>{
    const page=await pageFor(t);await practice(page);
    assert.match(await page.locator('.dna-phrase').innerText(),/Launch\s*→\s*Land/);
    await page.locator('#dna-tab-split').click();
    assert.equal(await page.locator('.dna-map-block').count(),10);
    assert.equal(await page.locator('.dna-map-block--plain').count(),2,'Practice-only shots are not part of the phrase');
    await page.locator('.dna-map-block').nth(3).click();
    await page.waitForFunction(()=>currentSegment===3 && !leftVideo.paused);
    await page.waitForFunction(()=>document.querySelector('.dna-map-block.active')?.dataset.dnaSegment==='3');
    await page.locator('#dna-tab-isolate').click();
    await page.evaluate(()=>{loopActive=false;loopAllRiff=true;practiceTransport.seek(2.1);return practiceTransport.play();});
    await page.waitForFunction(()=>document.querySelector('[data-dna-atom="2"]')?.classList.contains('now'));
    assert.match(await page.locator('#dnaLive').innerText(),/Quarter-tone bend/);
});
test('part buttons show one role each, a key explains the roles and the i opens a dark hint',async t=>{
    const page=await pageFor(t,390);
    // Older lessons on production name the halves "Statement · …" / "Answer · …" while the role is set separately.
    await page.route('**/api/riffs/list.php*',async route=>{
        const response=await route.fetch();const body=await response.json();
        const list=Array.isArray(body)?body:(body.riffs||body.data||[]);
        const riff=list.find(r=>String(r.id)==='1');
        riff.segments[0].displayName='Statement · Pass 1';
        riff.segments[1].displayName='Answer · Pass 1';riff.segments[1].role='answer';
        riff.segments[6].displayName='Answer · Final pass';
        await route.fulfill({response,json:body});
    });
    await practice(page);
    const buttons=page.locator('.segment-btn:not(.all-riff)');
    const row=async i=>({name:await buttons.nth(i).locator('.segment-name').innerText(),role:await buttons.nth(i).locator('.dna-segment-role').innerText()});
    assert.deepEqual(await row(0),{name:'Pass 1',role:'Launch'});
    assert.deepEqual(await row(1),{name:'Pass 1',role:'Answer'});
    assert.deepEqual(await row(6),{name:'Final pass',role:'Drill'});
    assert.equal(await page.locator('.dna-segment-role').count(),10,'Every part says what it is');
    assert.deepEqual(await page.locator('.segment-key-item').allInnerTexts(),['Launch','Answer','Land','Drill']);
    const hint=page.locator('.segment-key-item .rk-hint').first();
    await hint.click();
    const tip=page.locator('#rkTip');
    assert.equal(await tip.isVisible(),true);
    assert.match(await tip.innerText(),/sharp entry/);
    const box=await tip.boundingBox();
    assert.ok(box.x>=0 && box.x+box.width<=390,JSON.stringify(box));
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('rkTip')).backgroundColor),'rgb(11, 11, 14)');
    assert.equal(await page.evaluate(()=>leftVideo.paused),true,'Tapping the i does not play anything');
    await page.locator('body').click({position:{x:5,y:5}});
    assert.equal(await tip.isVisible(),false);
    await page.locator('#dna-tab-isolate').click();
    await page.locator('.dna-atom-item .rk-hint').first().click();
    assert.ok((await tip.innerText()).length>10);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,true);
});
test('a riff without DNA says so instead of showing empty tabs',async t=>{
    const page=await pageFor(t);await practice(page,7);
    assert.equal(await page.locator('#dnaEmpty').isVisible(),true);
    assert.equal(await page.locator('#dnaStageNav').isVisible(),false);
});

test('English by default; the header switches to Russian and Spanish and the choice survives navigation',async t=>{
    const page=await pageFor(t);await page.goto(site.base+'/index.html',{waitUntil:'domcontentloaded'});
    assert.equal(await page.evaluate(()=>document.documentElement.lang),'en');
    assert.equal((await page.locator('.topbar-links [data-page=riffs]').textContent()).trim(),'Riffs');
    await page.click('.rk-lang-toggle');
    await Promise.all([page.waitForEvent('load'),page.click('.rk-lang-option[data-lang=ru]')]);
    assert.equal(await page.evaluate(()=>document.documentElement.lang),'ru');
    assert.equal((await page.locator('.topbar-links [data-page=practice]').textContent()).trim(),'Практика');
    assert.match(await page.locator('.home-hero-title').textContent(),/Добей каждый рифф/);
    await page.goto(site.base+'/practice.html?riff=1',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('[data-dna-stage=split]')?.textContent.trim()==='Части');
    assert.equal((await page.locator('[data-dna-stage=split]').textContent()).trim(),'Части');
    assert.equal(await page.locator('#modeNormalBtn').textContent(),'Обычный');
    await page.goto(site.base+'/billing.html?lang=es',{waitUntil:'domcontentloaded'});
    assert.equal(await page.evaluate(()=>document.documentElement.lang),'es-419');
    assert.match(await page.locator('body').innerText(),/Elige un plan/);
    const mobile=await pageFor(t,390);await mobile.goto(site.base+'/index.html?lang=es',{waitUntil:'domcontentloaded'});
    await mobile.click('#burgerMenu');
    assert.equal(await mobile.locator('.rk-lang-chip.is-active').textContent(),'ES');
    await Promise.all([mobile.waitForEvent('load'),mobile.click('.rk-lang-chip[data-lang=en]')]);
    assert.equal(await mobile.evaluate(()=>[document.documentElement.lang,location.search].join('|')),'en|');
});
test('Patreon sign-in still completes with Russian selected',async t=>{
    const page=await pageFor(t);await page.addInitScript(()=>{localStorage.setItem('patreonState','fixture-state');localStorage.setItem('rk-lang','ru');});
    await page.route('**/patreon-exchange.php',route=>route.fulfill({json:{success:true,token:'fixture-token',user:{id:'fixture-patreon',full_name:'Fixture'},subscription:{status:'active',source:'patreon'}}}));
    await page.route('**/patreon-validate.php',route=>route.fulfill({json:{success:true,user:{id:'fixture-patreon',full_name:'Fixture'},subscription:{status:'active',source:'patreon'}}}));
    await page.goto(site.base+'/patreon-callback.html?code=fixture&state=fixture-state',{waitUntil:'domcontentloaded'});await page.waitForURL('**/app.html',{waitUntil:'domcontentloaded'});
    assert.equal(await page.evaluate(()=>document.documentElement.lang),'ru');
});
test('in Russian and Spanish every interface string on the main pages is translated; only riff content stays as typed',async t=>{
    // Riff content comes from the admin (titles, part names, DNA texts) and is not part of the interface dictionary.
    const content=new Set();
    const walk=v=>{if(typeof v==='string')content.add(v.replace(/\s+/g,' ').trim());else if(v&&typeof v==='object')Object.values(v).forEach(walk);};
    // Read the fixture's data, not the repository's: the editor tests above save riffs there.
    for(const f of ['riffs.json','collections.json'])walk(JSON.parse(fs.readFileSync(path.join(site.dir,'data',f),'utf8')));
    // Pages also show pieces of content: "Pass 1" from a part named "Statement · Pass 1".
    const fromContent=s=>content.has(s)||[...content].some(c=>(c.length>2&&s.includes(c))||(s.length>3&&c.includes(s)));
    const brands=/^(Riff Killer|Instagram|YouTube|Facebook|Patreon|Stripe|Cryptomus|Mike Sabadash|RK-X+|\S+@\S+)$/;
    for(const lang of ['ru','es']){
        const page=await pageFor(t);await page.addInitScript(l=>localStorage.setItem('rk-lang',l),lang);
        const missing=new Set();
        const collect=async()=>{for(const s of await page.evaluate(()=>RK_I18N.missing()))if(!brands.test(s)&&!fromContent(s))missing.add(s);};
        for(const p of ['index.html','landing.html','billing.html','profile.html','favorites.html']){await page.goto(site.base+'/'+p,{waitUntil:'load'});await collect();}
        await practice(page);
        for(const stage of ['scan','split','isolate','decode','mutate']){await page.locator('[data-dna-stage='+stage+']').click();await collect();}
        assert.deepEqual([...missing],[],lang+': add these to tools/i18n/strings.py and run python3 tools/i18n/build.py');
    }
});
