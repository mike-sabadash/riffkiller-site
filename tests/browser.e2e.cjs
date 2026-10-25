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
    await page.addInitScript(()=>localStorage.setItem('rkPracticeTourSeen','1'));
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
    // Changing the angle never moves the sound or re-seeks the second camera (that stalls its decoder).
    const switching=await page.evaluate(async()=>{let seeks=0;const on=()=>{if(!leftVideo.seeking)seeks++;};rightVideo.addEventListener('seeking',on);
        for(const mode of ['right','left','split','right','left']){document.querySelector('.mode-btn[data-mode="'+mode+'"]').click();await new Promise(r=>setTimeout(r,250));
            const part=!!(practiceTransport.voice&&!practiceTransport.voice.audio.paused);
            if((part||!!practiceTransport.silenced)!==leftVideo.muted||!rightVideo.muted)return {mode,part,leftMuted:leftVideo.muted,rightMuted:rightVideo.muted};}
        rightVideo.removeEventListener('seeking',on);return {seeks,paused:leftVideo.paused||rightVideo.paused};});
    assert.deepEqual(switching,{seeks:0,paused:false});
    // While the part's own sound file plays, showing both hands must not unmute a camera on top of it.
    const voiced=await page.evaluate(async()=>{practiceTransport.setVoice(new Audio(),3.64,5.56);const out=[];
        for(const mode of ['split','right','left']){document.querySelector('.mode-btn[data-mode="'+mode+'"]').click();await new Promise(r=>setTimeout(r,50));out.push([mode,leftVideo.muted,rightVideo.muted]);}
        practiceTransport.clearVoice();return out;});
    assert.deepEqual(voiced,[['split',true,true],['right',true,true],['left',true,true]]);
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
    // Space toggles playback like any player and does not leave a focus ring on the clicked Play button.
    await page.keyboard.press('Space');await page.waitForFunction(()=>!leftVideo.paused && !rightVideo.paused);
    assert.equal(await page.evaluate(()=>document.activeElement.tagName),'BODY');
    await page.keyboard.press('Space');await page.waitForFunction(()=>leftVideo.paused && rightVideo.paused);
    await page.locator('.dna-stage[data-dna-stage="isolate"]').click();await page.locator('[data-dna-atom="2"]').click();
    await page.waitForFunction(()=>!leftVideo.paused);state=await sample();assert.equal(state.rate,.5);assert.ok(state.l>=1.7 && state.l<3.6);
    for(const stage of ['scan','split','decode','mutate']){await page.locator('.dna-stage[data-dna-stage="'+stage+'"]').click();assert.ok((await page.locator('#dnaStageContent').innerText()).length>20);}
    if(process.env.QA_SCREENSHOTS)await page.screenshot({path:path.join(process.env.QA_SCREENSHOTS,'practice-desktop.png'),fullPage:true});
});
test('All Riff updates tabs; Speed Trainer advances only on completed loops',async t=>{
    const page=await pageFor(t);await practice(page);await page.click('#toggleTabs');await page.locator('.segment-btn.all-riff').click();
    await page.evaluate(()=>practiceTransport.seek(6.3));await page.waitForFunction(()=>document.querySelector('.tabs-image')?.getAttribute('src')?.endsWith('/4.png'));
    await page.locator('.segment-btn').nth(1).click();await page.click('#modeSpeedBtn');
    const intro=page.locator('#speedTrainerGuide');if(await intro.isVisible())await page.locator('#speedTrainerGuideStart').click();
    await page.waitForFunction(()=>playbackSpeed===.5);
    await page.evaluate(()=>{practiceTransport.pause();currentSegment=6;loopAllRiff=false;loopActive=true;setPracticeMode('speed');practiceTransport.seek(11.06);return practiceTransport.play();});
    await page.waitForFunction(()=>playbackSpeed===.75,{timeout:12000});
    assert.equal(await page.evaluate(()=>practiceTransport.rate),.75);assert.ok(await page.evaluate(()=>Math.abs(rightVideo.playbackRate/.75-1)<=.1));
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
async function editor(t,width=1440,video=webm()){
    // These tests save riff 1; put the catalog back so later tests see the fixture.
    const store=path.join(site.dir,'data/riffs.json'),original=fs.readFileSync(store);t.after(()=>fs.writeFileSync(store,original));
    const page=await pageFor(t,width);const [name,value]=(await site.adminCookie()).split('=');await page.context().addCookies([{name,value,url:site.base}]);
    const body=fs.readFileSync(video);await page.route(/video\.php\?file=/,route=>route.fulfill({status:200,contentType:'video/webm',body,headers:{'Accept-Ranges':'bytes'}}));
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
test('cover: a frame from the markup video becomes the riff card picture after save',async t=>{
    const page=await editor(t);
    assert.ok(await page.locator('#hCover').isVisible(),'cover section is visible without opening anything');
    assert.ok(await page.locator('#coverPreview').isVisible(),'current cover is shown');
    await page.evaluate(()=>{segmentEditorVideo.currentTime=2});await page.waitForFunction(()=>!segmentEditorVideo.seeking&&segmentEditorVideo.readyState>=2);
    await page.click('#segmentCoverFrame');
    await page.waitForFunction(()=>/Взят кадр 0:02/.test(document.getElementById('coverStatus').textContent));
    assert.match(await page.getAttribute('#coverPreview','src'),/^blob:/);
    assert.match(await page.locator('#edStatus').innerText(),/несохранённые/);
    const save=page.waitForResponse(r=>r.url().endsWith('/api/riffs/save.php'));await page.click('#submitBtn');
    await page.waitForSelector('#dnaLintDialog[open]',{timeout:1500}).then(()=>page.click('#dnaLintSave'),()=>{});
    assert.equal((await save).status(),200);
    const saved=JSON.parse(fs.readFileSync(path.join(site.dir,'data/riffs.json')))[0];
    assert.match(saved.thumbnail,/^assets\/img\/riffs\/led-zeppelin-black-dog-[a-z0-9]+\.jpg$/);
    const file=path.join(site.dir,saved.thumbnail),stem=file.replace(/\.jpg$/,'');
    const copies=()=>fs.readdirSync(path.dirname(file)).filter(n=>n.startsWith(path.basename(stem)+'.w')).map(n=>path.join(path.dirname(file),n));
    t.after(()=>{for(const f of [file,...copies()])fs.rmSync(f,{force:true})});
    const jpg=fs.readFileSync(file);assert.equal(jpg.readUInt16BE(0),0xffd8,'JPEG');
    // Light WebP copies for the cards (400/800/1200, never wider than the frame itself).
    const widths=copies().map(f=>Number(f.match(/\.w(\d+)\.webp$/)[1]));assert.ok(widths.length&&widths.every(w=>w<=1200),String(widths));
    for(const f of copies())assert.equal(fs.readFileSync(f).toString('latin1',8,12),'WEBP',f);
    assert.equal(JSON.parse(fs.readFileSync(path.join(site.dir,'data/riffs.json')))[0].thumbnailSrcset,undefined,'srcset is not stored');
    assert.ok(fs.existsSync(path.join(site.dir,'assets/img/riff-1.png')),'the old shared cover is left alone');
    await page.waitForFunction(()=>/Сохранено/.test(document.getElementById('edStatus').textContent));
    assert.equal(await page.inputValue('#thumbnail'),saved.thumbnail);
    await page.goto(site.base+'/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#riffsGrid .riff-card[data-id="1"] img.riff-image');
    assert.equal(await page.getAttribute('#riffsGrid .riff-card[data-id="1"] img.riff-image','src'),saved.thumbnail);
    assert.match(await page.getAttribute('#riffsGrid .riff-card[data-id="1"] img.riff-image','srcset'),/^assets\/img\/riffs\/.+\.w\d+\.webp \d+w/);
    await page.waitForFunction(()=>document.querySelector('#riffsGrid .riff-card[data-id="1"] img.riff-image').complete);
    assert.match(await page.$eval('#riffsGrid .riff-card[data-id="1"] img.riff-image',img=>img.currentSrc),/\.w\d+\.webp$/,'the card loads a WebP copy');
});
test('draft: a new riff starts hidden; shown without a video it has a card and a «coming soon» practice page',async t=>{
    const store=path.join(site.dir,'data/riffs.json'),original=fs.readFileSync(store);t.after(()=>fs.writeFileSync(store,original));
    const page=await pageFor(t);const [name,value]=(await site.adminCookie()).split('=');await page.context().addCookies([{name,value,url:site.base}]);
    await page.goto(site.base+'/admin/riffs.html',{waitUntil:'domcontentloaded'});await page.click('.admin-tab[data-tab="edit"]');
    await page.waitForSelector('#collChecks input[data-col-id="3"]');
    assert.ok(await page.isChecked('#hidden')&&!await page.isDisabled('#hidden'),'a new riff starts hidden, the admin can still untick it');
    await page.fill('#song','Paranoid');await page.fill('#artist','Black Sabbath');await page.selectOption('#genre','metal');await page.selectOption('#difficulty','advanced');
    await page.check('#collChecks input[data-col-id="3"]');
    let save=page.waitForResponse(r=>r.url().endsWith('/api/riffs/save.php'));await page.click('#submitBtn');
    assert.equal((await save).status(),200);await page.waitForFunction(()=>/Сохранено/.test(document.getElementById('edStatus').textContent));
    let draft=JSON.parse(fs.readFileSync(store)).find(r=>r.song==='Paranoid');
    assert.equal(draft.hidden,true);assert.equal(draft.videoFile,'');assert.equal(draft.difficulty,'advanced');assert.deepEqual(draft.collectionIds,[3]);
    assert.match(await page.locator('#riffSelect option:checked').innerText(),/черновик/);
    await page.click('.admin-tab[data-tab="list"]');
    assert.match(await page.locator('.riff-card[data-id="'+draft.id+'"] .riff-list-draft').innerText(),/черновик, нет видео/);
    await page.waitForFunction(()=>{const img=document.querySelector('.riff-card[data-id="1"] .riff-list-thumb img');return img&&img.complete&&img.naturalWidth>0;});
    const home=await page.context().newPage();
    await home.goto(site.base+'/',{waitUntil:'domcontentloaded'});await home.waitForSelector('#riffsGrid .riff-card');
    assert.equal(await home.locator('#riffsGrid .riff-card[data-id="'+draft.id+'"]').count(),0,'a hidden draft is not in the library');
    // Untick to look at the card in the library, without a video.
    await page.click('.admin-tab[data-tab="edit"]');await page.uncheck('#hidden');
    save=page.waitForResponse(r=>r.url().endsWith('/api/riffs/save.php'));await page.click('#submitBtn');
    assert.equal((await save).status(),200);await page.waitForFunction(()=>/Сохранено/.test(document.getElementById('edStatus').textContent));
    assert.equal(JSON.parse(fs.readFileSync(store)).find(r=>r.id===draft.id).hidden,false);
    await home.goto(site.base+'/',{waitUntil:'domcontentloaded'});
    await home.waitForSelector('#riffsGrid .riff-card[data-id="'+draft.id+'"]');
    await home.goto(site.base+'/practice.html?riff='+draft.id,{waitUntil:'domcontentloaded'});
    await home.waitForSelector('#videoSoonState:not([hidden])');
    assert.match(await home.locator('#videoSoonState').innerText(),/coming soon/);
    assert.match(await home.locator('.breadcrumb-current').innerText(),/Paranoid/);
    assert.ok(!await home.locator('#videoErrorState').isVisible(),'no download error');
    await home.close();
});
test('admin collection list shows each card picture; recent riffs leave out ones deleted from the catalog',async t=>{
    const page=await pageFor(t);const [name,value]=(await site.adminCookie()).split('=');await page.context().addCookies([{name,value,url:site.base}]);
    await page.goto(site.base+'/admin/collections.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>{const imgs=[...document.querySelectorAll('.col-card .col-card-thumb img')];return imgs.length>0&&imgs.every(i=>i.complete&&i.naturalWidth>0);});
    await page.addInitScript(()=>{try{const s=JSON.parse(localStorage.getItem('riffKillerState')||'{}');if(!s.seeded){s.seeded=1;s.recentlyPracticed=[{id:777,song:'Deleted test riff',artist:'Nobody',thumbnail:'assets/img/riff-1.png'},{id:1,song:'Black Dog',artist:'Led Zeppelin',thumbnail:'assets/img/riff-1.png'}];localStorage.setItem('riffKillerState',JSON.stringify(s));}}catch(e){}});
    await page.goto(site.base+'/practice.html?riff=2',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#recentRiffsGrid .riff-card');
    assert.equal(await page.getByText('Deleted test riff').count(),0,'a deleted riff is not in recent');
    assert.ok(await page.locator('#recentRiffsGrid .riff-card[data-id="1"]').count()>0||await page.locator('#recentRiffsGrid').getByText('Black Dog').count()>0);
});
test('a cover file bigger than the 2 MB upload limit is shrunk in the browser and saved',async t=>{
    const store=path.join(site.dir,'data/riffs.json'),original=fs.readFileSync(store);t.after(()=>fs.writeFileSync(store,original));
    const big=path.join(site.dir,'big-cover.png');
    require('node:child_process').execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','nullsrc=s=3000x1800,geq=random(1)*255:128:128','-frames:v','1',big]);
    assert.ok(fs.statSync(big).size>2*1024*1024,'fixture is over the limit');
    const page=await pageFor(t);const [name,value]=(await site.adminCookie()).split('=');await page.context().addCookies([{name,value,url:site.base}]);
    await page.goto(site.base+'/admin/riffs.html',{waitUntil:'domcontentloaded'});await page.click('.admin-tab[data-tab="edit"]');
    await page.waitForSelector('#collChecks input');
    await page.fill('#song','War Pigs');await page.fill('#artist','Black Sabbath');
    await page.setInputFiles('#thumbnailUpload',big);
    const save=page.waitForResponse(r=>r.url().endsWith('/api/riffs/save.php'));await page.click('#submitBtn');
    assert.equal((await save).status(),200);await page.waitForFunction(()=>/Сохранено/.test(document.getElementById('edStatus').textContent));
    const saved=JSON.parse(fs.readFileSync(store)).find(r=>r.song==='War Pigs');
    assert.match(saved.thumbnail,/^assets\/img\/riffs\/black-sabbath-war-pigs-[a-z0-9]+\.jpg$/);
    const file=path.join(site.dir,saved.thumbnail);t.after(()=>{for(const f of fs.readdirSync(path.dirname(file)).filter(n=>n.startsWith(path.basename(file,'.jpg'))))fs.rmSync(path.join(path.dirname(file),f),{force:true})});
    assert.ok(fs.statSync(file).size<=1.8*1024*1024,String(fs.statSync(file).size));
});
test('a save after the admin session expired says so next to the Save button and keeps the form',async t=>{
    const store=path.join(site.dir,'data/riffs.json'),original=fs.readFileSync(store);t.after(()=>fs.writeFileSync(store,original));
    const page=await pageFor(t);const [name,value]=(await site.adminCookie()).split('=');await page.context().addCookies([{name,value,url:site.base}]);
    await page.goto(site.base+'/admin/riffs.html',{waitUntil:'domcontentloaded'});await page.click('.admin-tab[data-tab="edit"]');
    await page.waitForSelector('#collChecks input');
    await page.fill('#song','Iron Man');await page.fill('#artist','Black Sabbath');
    await page.context().clearCookies();
    const save=page.waitForResponse(r=>r.url().endsWith('/api/riffs/save.php'));await page.click('#submitBtn');
    assert.equal((await save).status(),403);
    await page.waitForFunction(()=>/Вход в админку истёк/.test(document.getElementById('edStatus').textContent));
    assert.ok(await page.locator('#edStatus').isVisible());
    assert.equal(await page.inputValue('#song'),'Iron Man');
    assert.equal(fs.readFileSync(store,'utf8'),original.toString());
});
test('collection banner: a wide picture fills the header, a small one is flagged, none shows the card picture whole',async t=>{
    const store=path.join(site.dir,'data/collections.json'),original=fs.readFileSync(store);t.after(()=>fs.writeFileSync(store,original));
    const tmp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'banner-'));const wide=path.join(tmp,'wide.png');
    require('node:child_process').execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=0x335577:s=2400x400','-frames:v','1',wide]);
    const page=await pageFor(t);const [name,value]=(await site.adminCookie()).split('=');await page.context().addCookies([{name,value,url:site.base}]);
    const uploaded=[];page.on('response',r=>{if(r.url().endsWith('/api/upload.php'))uploaded.push(r.json().then(d=>d.path,()=>null))});
    t.after(async()=>{for(const f of await Promise.all(uploaded))if(f){const stem=path.join(site.dir,f).replace(/\.\w+$/,'');for(const v of [path.join(site.dir,f),...[400,428,600,800,1200,2400].map(w=>stem+'.w'+w+'.webp')])fs.rmSync(v,{force:true})}});
    await page.goto(site.base+'/admin/collections.html',{waitUntil:'domcontentloaded'});await page.click('.admin-tab[data-tab="edit"]');
    await page.waitForFunction(()=>document.querySelectorAll('#colSelect option').length>1);await page.selectOption('#colSelect','1');
    assert.ok(await page.locator('#colImagePreview').isVisible(),'card picture preview');
    await page.setInputFiles('#colBannerUpload',path.join(site.dir,'assets/img/collections-2.png'));
    await page.waitForFunction(()=>/600×360/.test(document.getElementById('colBannerNote').textContent));
    assert.match(await page.locator('#colBannerNote').getAttribute('class'),/warn/);
    await page.setInputFiles('#colBannerUpload',wide);
    await page.waitForFunction(()=>/Загружено 2400×400/.test(document.getElementById('colBannerNote').textContent));
    assert.doesNotMatch(await page.locator('#colBannerNote').getAttribute('class'),/warn/);
    const banner=await page.inputValue('#colBannerUrl');assert.match(banner,/^assets\/img\/collections\/led-zeppelin-banner-[a-z0-9]+\.png$/);
    let save=page.waitForResponse(r=>r.url().endsWith('/api/collections/save.php'));await page.click('#colSubmit');assert.equal((await save).status(),200);
    assert.equal(JSON.parse(fs.readFileSync(store)).find(c=>c.id===1).bannerUrl,banner);
    const view=await pageFor(t);await view.goto(site.base+'/collection.html?id=1',{waitUntil:'domcontentloaded'});
    await view.waitForSelector('#collectionBanner .collection-banner-image');
    assert.equal(await view.getAttribute('#collectionBanner .collection-banner-image','src'),banner);
    assert.match(await view.getAttribute('#collectionBanner .collection-banner-image','srcset'),/\.w800\.webp 800w, .*\.w2400\.webp 2400w$/);
    assert.equal(await view.locator('#collectionBanner.collection-banner--fit').count(),0);
    await page.click('#colBannerClear');save=page.waitForResponse(r=>r.url().endsWith('/api/collections/save.php'));await page.click('#colSubmit');await save;
    assert.equal(JSON.parse(fs.readFileSync(store)).find(c=>c.id===1).bannerUrl,undefined);
    await view.reload({waitUntil:'domcontentloaded'});await view.waitForSelector('#collectionBanner.collection-banner--fit .collection-banner-backdrop');
    const img=await view.locator('#collectionBanner .collection-banner-image').boundingBox(),box=await view.locator('#collectionBanner').boundingBox();
    assert.ok(Math.abs(img.width/img.height-600/360)<0.02&&img.width<box.width,'card picture keeps its shape: '+JSON.stringify(img));
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


test('practice tour: first visit lights up one control at a time, skips hidden ones, ? starts it again',async t=>{
    for(const [width,height] of [[1440,900],[390,844]]){
        const context=await browser.newContext({viewport:{width,height}});t.after(()=>context.close());
        const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.route(/fonts\.(googleapis|gstatic)\.com/,route=>route.abort());
        await page.goto(site.base+'/practice.html?riff=1',{waitUntil:'domcontentloaded'});
        await page.waitForSelector('.tour .tour-card');
        const steps=[];
        for(let i=0;i<10&&await page.locator('.tour').count();i++){
            const title=await page.locator('.tour-title').innerText();steps.push(title);
            const card=await page.locator('.tour-card').boundingBox(),spot=await page.locator('.tour-spot').boundingBox();
            assert.ok(card.x>=0&&card.y>=0&&card.x+card.width<=width+1&&card.y+card.height<=height+1,title+' note on screen '+JSON.stringify(card));
            assert.ok(spot.width>20&&spot.height>10,title+' lit area '+JSON.stringify(spot));
            assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.tour-card')),true,'focus stays in the note');
            if(title==='Help'){
                // The drawn arrow's tip points at the small ? button, not past it.
                await page.waitForTimeout(400);
                const aim=await page.evaluate(()=>{const a=document.querySelector('.tour-arrow').getBoundingClientRect(),b=document.querySelector('#practiceHelp').getBoundingClientRect();
                    const tip=document.querySelector('.tour-card').classList.contains('tour-card--flip')?a.left+8:a.left+36;return {tip,mid:b.left+b.width/2,spotTop:document.querySelector('.tour-spot').getBoundingClientRect().top,top:b.top};});
                assert.ok(Math.abs(aim.tip-aim.mid)<=4,'arrow aims at ? '+JSON.stringify(aim));
                assert.ok(Math.abs(aim.spotTop+6-aim.top)<=2,'light sits on ? '+JSON.stringify(aim));
            }
            await page.click('.tour-next');
        }
        assert.deepEqual(steps.slice(0,2),['Riff parts','Parts on the video']);assert.equal(steps.at(-1),'Help');
        assert.ok(steps.length>=6,steps.join());
        assert.equal(await page.evaluate(()=>localStorage.getItem('rkPracticeTourSeen')),'1');
        await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelectorAll('#segmentControls .segment-btn').length>1);
        await page.waitForTimeout(300);assert.equal(await page.locator('.tour').count(),0,'shown once');
        await page.click('#practiceHelp');await page.waitForSelector('.tour .tour-card');
        await page.keyboard.press('Escape');assert.equal(await page.locator('.tour').count(),0);
        assert.deepEqual(errors,[]);
    }
});
test('Speed Trainer guide: shown once on the first tap, the i reopens it; a sheet from the bottom on a phone',async t=>{
    const page=await pageFor(t);await practice(page);
    await page.click('#modeSpeedBtn');await page.waitForSelector('#speedTrainerGuide[open]');
    assert.equal(await page.evaluate(()=>practiceMode),'normal','the guide comes first');
    assert.equal(await page.locator('#speedTrainerGuide .st-step').count(),3);
    await page.click('#speedTrainerGuideStart');
    assert.equal(await page.locator('#speedTrainerGuide[open]').count(),0);
    assert.equal(await page.evaluate(()=>practiceMode),'speed');
    await page.click('#modeNormalBtn');await page.click('#modeSpeedBtn');
    assert.equal(await page.locator('#speedTrainerGuide[open]').count(),0,'shown only once');
    await page.click('#speedTrainerInfo');await page.waitForSelector('#speedTrainerGuide[open]');
    assert.equal(await page.locator('#speedTrainerGuideStart').innerText(),'Got it');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#speedTrainerGuide[open]').count(),0);
    assert.equal(await page.evaluate(()=>practiceMode),'speed','closing the guide keeps the mode');
    const phone=await pageFor(t,390);await practice(phone);
    await phone.click('#speedTrainerInfo');await phone.waitForSelector('#speedTrainerGuide[open]');await phone.waitForFunction(()=>!document.getElementById('speedTrainerGuide').getAnimations().length);
    const box=await phone.locator('#speedTrainerGuide').boundingBox();const vh=await phone.evaluate(()=>innerHeight);
    assert.ok(Math.abs(box.y+box.height-vh)<2&&box.width>=389,JSON.stringify(box));
    await phone.click('#speedTrainerGuideStart');assert.equal(await phone.evaluate(()=>practiceMode),'speed');
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
    assert.equal(await page.evaluate(()=>Math.abs(rightVideo.playbackRate/leftVideo.playbackRate-1)<=.1),true);
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
test('on desktop every part sits beside the video without scrolling; on phones parts stay under the player',async t=>{
    const page=await pageFor(t);
    for(const [width,height] of [[1366,768],[1440,900],[1920,1080]]) {
        await page.setViewportSize({width,height});await practice(page);
        const g=await page.evaluate(()=>{
            const video=document.getElementById('videoWrapper').getBoundingClientRect();
            const parts=[...document.querySelectorAll('#segmentControls .segment-btn')].map(b=>b.getBoundingClientRect());
            const dna=document.getElementById('dnaLab').getBoundingClientRect();
            return {left:Math.min(...parts.map(r=>r.left)),videoRight:video.right,bottom:Math.max(...parts.map(r=>r.bottom)),height:innerHeight,dnaTop:dna.top,videoBottom:video.bottom,overflow:document.documentElement.scrollWidth-innerWidth};
        });
        assert.ok(g.left>g.videoRight,'parts are to the right of the video '+JSON.stringify(g));
        assert.ok(g.bottom<=g.height,'all parts are on the first screen '+JSON.stringify(g));
        assert.ok(g.dnaTop>g.videoBottom,'Riff DNA moves under the player '+JSON.stringify(g));
        assert.ok(g.overflow<=1,JSON.stringify(g));
    }
    await page.setViewportSize({width:390,height:844});
    const m=await page.evaluate(()=>({video:document.getElementById('videoWrapper').getBoundingClientRect().bottom,parts:document.querySelector('#segmentControls .segment-btn').getBoundingClientRect().top,dna:document.getElementById('dnaLab').getBoundingClientRect().top}));
    assert.ok(m.video<m.parts && m.parts<m.dna,JSON.stringify(m));
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
    await page.evaluate(()=>{window.__samePage=true;});
    await page.click('.rk-lang-option[data-lang=ru]');
    assert.equal(await page.locator('.rk-lang-code').textContent(),'RU','The switch shows the new language at once');
    await page.waitForFunction(()=>document.querySelector('.topbar-links [data-page=practice]').textContent.trim()==='Практика');
    assert.equal(await page.evaluate(()=>window.__samePage),true,'Switching does not reload the page');
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
    await mobile.click('.rk-lang-chip[data-lang=en]');
    assert.equal(await mobile.locator('.rk-lang-chip.is-active').textContent(),'EN');
    assert.equal(await mobile.evaluate(()=>[document.documentElement.lang,location.search].join('|')),'en|');
    assert.match(await mobile.locator('.home-hero-title').textContent(),/Kill every riff/,'English comes back from the remembered source text');
    await mobile.click('.rk-lang-chip[data-lang=ru]');
    await mobile.waitForFunction(()=>/Добей каждый рифф/.test(document.querySelector('.home-hero-title').textContent));
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
test('a riff with a tab file shows a live tab strip whose cursor follows the video',async t=>{
    const file=path.join(site.dir,'data/riffs.json');const original=fs.readFileSync(file,'utf8');t.after(()=>fs.writeFileSync(file,original));
    const riffs=JSON.parse(original);const riff=Array.isArray(riffs)?riffs[0]:Object.values(riffs)[0];
    riff.tab={tex:'\\tempo 171\n.\n\\ts 5 8 7.4.8 5.3.8 6.3.8 7.3.8 7.4.8 |\n\\ts 4 4 \\tempo 160 5.2.4{v} 7.3.4 5.3.8 7.4.8 5.4.4'};
    riff.segments.forEach((s,i)=>{s.tabBars=i%2?[2,2]:[1,1];});
    fs.writeFileSync(file,JSON.stringify(riffs));
    const page=await pageFor(t);await practice(page);
    await page.locator('.segment-btn').nth(1).click();await page.click('#toggleTabs');
    await page.waitForSelector('.tabs-overlay.is-live .tab-live.is-ready',{timeout:20000});
    assert.equal(await page.locator('.tabs-frame').isVisible(),false,'the picture gives way to the live tab');
    const x=()=>page.evaluate(()=>parseFloat(document.querySelector('.tab-live-cursor').style.transform.replace(/[^\d.]/g,''))||0);
    const first=await x();await page.waitForTimeout(400);
    assert.ok(await x()!==first,'cursor moves while the video plays');
    if(process.env.QA_SCREENSHOTS)await page.locator('.video-player-container').screenshot({path:path.join(process.env.QA_SCREENSHOTS,'practice-live-tab.png')});
});
test('on a phone, bars wider than the screen scroll so the last notes of a part stay in view',async t=>{
    const file=path.join(site.dir,'data/riffs.json');const original=fs.readFileSync(file,'utf8');t.after(()=>fs.writeFileSync(file,original));
    const riffs=JSON.parse(original);const riff=Array.isArray(riffs)?riffs[0]:Object.values(riffs)[0];
    riff.tab={tex:fs.readFileSync(path.join(__dirname,'../content/tabs/led-zeppelin/black-dog.tex'),'utf8')};
    // Four whole bars of Black Dog: more than the phone shows at once.
    riff.segments.forEach(s=>{s.tabBars=[5,8];s.tabSync=[[5,0,s.start],[7,0,(s.start+s.end)/2],[8,3840,s.end]];});
    fs.writeFileSync(file,JSON.stringify(riffs));
    const page=await pageFor(t,390);await practice(page);
    await page.locator('.segment-btn').nth(1).click();await page.click('#toggleTabs');
    await page.waitForSelector('.tabs-overlay.is-live .tab-live.is-ready',{timeout:20000});
    const seg=riff.segments[await page.evaluate(()=>currentSegment)]; // the part that plays, so the loop does not jump back
    await page.evaluate(t=>{const v=document.querySelector('#videoWrapper video');v.pause();v.currentTime=t;},seg.end-0.05);
    await page.waitForTimeout(600);
    const view=await page.evaluate(()=>{
        const host=document.querySelector('.tabs-overlay.is-live .tab-live'),score=host.querySelector('.tab-live-score'),cursor=host.querySelector('.tab-live-cursor');
        return {host:host.getBoundingClientRect().toJSON(),cursor:cursor.getBoundingClientRect().toJSON(),shifted:score.style.transform,content:score.scrollWidth};
    });
    const drawings=await page.evaluate(()=>[...document.querySelectorAll('.tab-live .at-surface > div')].filter(d=>d.style.top==='0px').length);
    assert.equal(drawings,1,'only the last render is on screen, not every scale it went through');
    assert.ok(view.content>view.host.width,'four bars are wider than the phone: '+JSON.stringify(view));
    assert.match(view.shifted,/translateX\(-/,'the bars scrolled: '+JSON.stringify(view));
    assert.ok(view.cursor.x>=view.host.x&&view.cursor.x<=view.host.x+view.host.width,'cursor in view: '+JSON.stringify(view));
    if(process.env.QA_SCREENSHOTS)await page.locator('.tabs-overlay.is-live .tab-live').screenshot({path:path.join(process.env.QA_SCREENSHOTS,'practice-live-tab-phone.png')});
});
test('on a phone a looped part turns back before its end even when the page is checked only every 250 ms',async t=>{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});t.after(()=>context.close());
    const page=await context.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com/,route=>route.abort());
    // iPhone Safari at its worst: no frame callbacks, coarse time checks. The jump must not depend on catching the end.
    await page.addInitScript(()=>{
        localStorage.setItem('rkPracticeTourSeen','1');
        window.requestAnimationFrame=fn=>setTimeout(()=>fn(performance.now()),250);
        delete HTMLVideoElement.prototype.requestVideoFrameCallback;
    });
    await practice(page);
    await page.locator('.segment-btn').nth(2).tap();
    await page.waitForFunction(()=>practiceTransport.intendedPlaying&&loopActive);
    const jumps=await page.evaluate(()=>new Promise(resolve=>{
        const seg=currentRiff.segments[currentSegment],out=[],loopTo=practiceTransport.loopTo.bind(practiceTransport);
        practiceTransport.loopTo=(time,hard)=>{out.push({at:leftVideo.currentTime,end:seg.end,hard});if(out.length===3)resolve(out);return loopTo(time,hard);};
        setTimeout(()=>resolve(out),15000);
    }));
    assert.equal(jumps.length,3,'three passes of the loop: '+JSON.stringify(jumps));
    for(const j of jumps){
        assert.ok(j.at<=j.end&&j.at>=j.end-0.08,'turned back just before the end, not past it: '+JSON.stringify(jumps));
    }
});
test('tab block reads alphaTex, maps bars to parts by role and length, and saves them with the riff',async t=>{
    const page=await editor(t);
    await page.click('#tabTexBox summary');
    await page.fill('#tabTex','\\tempo 171\n.\n\\ts 5 8 7.4.8 5.3.8 6.3.8 7.3.8 7.4.8 |\n\\ts 4 4 \\tempo 160 5.2.4{v} 7.3.4 5.3.8 7.4.8 5.4.4');
    await page.waitForFunction(()=>/Прочитано: 2 такта/.test(document.getElementById('tabStatus').textContent),null,{timeout:20000});
    await page.click('#tabAutoMap');
    const bars=await page.evaluate(()=>[...document.querySelectorAll('#segmentRows .tab-bars')].map(i=>i.value));
    assert.deepEqual(bars.slice(0,2),['1','2'],JSON.stringify(bars));
    assert.equal(bars[2],'1','a repeated role reuses its bars');
    if(process.env.QA_SCREENSHOTS)await page.locator('section[aria-labelledby="hTabs"]').screenshot({path:path.join(process.env.QA_SCREENSHOTS,'editor-tabs.png')});
    const saved=page.waitForResponse(r=>r.url().endsWith('/api/riffs/save.php'));
    await page.click('#submitBtn');
    if(await page.locator('#dnaLintDialog[open]').count())await page.click('#dnaLintSave');
    assert.equal((await saved).status(),200);
    const store=JSON.parse(fs.readFileSync(path.join(site.dir,'data/riffs.json'),'utf8'));const riff=(Array.isArray(store)?store:Object.values(store)).find(r=>r.id===1);
    assert.match(riff.tab.tex,/\\ts 5 8/);
    assert.deepEqual(riff.segments[0].tabBars,[1,1]);assert.deepEqual(riff.segments[1].tabBars,[2,2]);
});
test('DNA atoms are suggested from the tab at their moment in the part that plays the bar',async t=>{
    const page=await editor(t);
    await page.click('#tabTexBox summary');
    await page.fill('#tabTex','\\tempo 120\n.\n5.3{b (0 4)} 7.3{h} 9.3 5.6{pm} 5.6{pm} |\n7.3{sl} 9.3 r.2 |');
    await page.waitForFunction(()=>/Прочитано: 2 такта/.test(document.getElementById('tabStatus').textContent),null,{timeout:20000});
    await page.evaluate(()=>{document.getElementById('dnaAtomsEditor').replaceChildren();document.querySelectorAll('#segmentRows .tab-bars').forEach((i,k)=>{i.value=k===0?'1-2':''})});
    await page.click('#dnaTabAtoms');
    const atoms=await page.evaluate(()=>[...document.querySelectorAll('#dnaAtomsEditor > div')].map(c=>[c.querySelector('[data-field="technique"]').value,c.querySelector('[data-field="label"]').value,Number(c.querySelector('[data-field="time"]').value)]));
    const [start,end]=(await bounds(page))[0];
    assert.deepEqual(atoms.map(a=>a[0]),['bend','hammer','palm','slide'],JSON.stringify(atoms));
    assert.equal(atoms[0][1],'5 лад, струна G, на тон');
    assert.equal(atoms[0][2],start,'the first beat sits at the start of the part');
    assert.ok(atoms.every(a=>a[2]>=start&&a[2]<end),JSON.stringify([start,end,atoms]));
    assert.match(await page.textContent('#dnaTabAtomsStatus'),/Добавлено приёмов: 4/);
    await page.click('#dnaTabAtoms');
    assert.match(await page.textContent('#dnaTabAtomsStatus'),/Новых приёмов нет/);
    assert.equal(await page.locator('#dnaAtomsEditor > div').count(),4,'a second click adds nothing twice');
    if(process.env.QA_SCREENSHOTS)await page.locator('#dnaAtomsEditor').evaluate(e=>e.parentElement.scrollIntoView());
    if(process.env.QA_SCREENSHOTS)await page.locator('#dnaAtomsEditor').locator('..').screenshot({path:path.join(process.env.QA_SCREENSHOTS,'editor-tab-atoms.png')});
});
test('sound sync finds each part bars and note times in the video, skips silent parts and saves them',async t=>{
    const {render,perform,writeWav}=require('./guitar-synth.cjs');
    const alphaTab=require('../js/vendor/alphatab/alphaTab.min.js');
    const {barDurations}=require('../js/tab-live.js').TabLive;const {events,tabLength}=require('../js/tab-sync.js').TabSync;
    const tex='\\tempo 171\n.\n:8 5.3 7.3 5.4 7.4 5.3 7.3 5.4 7.4 |\n:8 0.6 3.6 5.6 0.6 3.5 5.5 3.5 0.6 |';
    const score=alphaTab.importer.ScoreLoader.loadAlphaTex(tex),d=barDurations(score.masterBars,score.tempo);
    const store=JSON.parse(fs.readFileSync(path.join(site.dir,'data/riffs.json'),'utf8'));
    const parts=(Array.isArray(store)?store:Object.values(store)).find(r=>r.id===1).segments;
    // Launch parts play bar 1, land parts bar 2, the two drill parts are silent.
    const notes=[],played=[];
    parts.forEach((p,i)=>{
        if(!p.role)return;const bar=p.role==='launch'?1:2,evs=events(score,0,bar,bar,d),len=tabLength(bar,bar,d);
        const take=perform(evs,len,p.start+0.1,Math.min(1.1,(p.end-p.start-0.2)/(len/1000)),0.01,i+1);
        notes.push(...take);played[i]=take;
    });
    const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'rk-sound-')),wav=path.join(dir,'riff.wav'),file=path.join(dir,'riff.webm');
    writeWav(wav,render(notes,18.6));
    require('node:child_process').execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-i',wav,'-t','18.57','-c:v','libvpx-vp9','-b:v','100k','-deadline','realtime','-c:a','libopus','-b:a','96k',file]);
    t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    const page=await editor(t,1440,file);
    await page.click('#tabTexBox summary');await page.fill('#tabTex',tex);
    await page.waitForFunction(()=>/Прочитано: 2 такта/.test(document.getElementById('tabStatus').textContent),null,{timeout:20000});
    await page.click('#tabSyncAudio');
    await page.waitForFunction(()=>/По звуку синхронизировано/.test(document.getElementById('tabStatus').textContent),null,{timeout:60000});
    const status=await page.textContent('#tabStatus');
    assert.match(status,/частей: 8 из 10/,status);assert.match(status,/частях 7, 8/,status);
    const bars=await page.evaluate(()=>[...document.querySelectorAll('#segmentRows .tab-bars')].map(i=>i.value));
    assert.deepEqual(bars,['1','2','1','2','1','2','','','1','2']);
    if(process.env.QA_SCREENSHOTS)await page.locator('section[aria-labelledby="hTabs"]').screenshot({path:path.join(process.env.QA_SCREENSHOTS,'editor-tab-sync.png')});
    const saved=page.waitForResponse(r=>r.url().endsWith('/api/riffs/save.php'));
    await page.click('#submitBtn');
    if(await page.locator('#dnaLintDialog[open]').count())await page.click('#dnaLintSave');
    assert.equal((await saved).status(),200);
    const after=JSON.parse(fs.readFileSync(path.join(site.dir,'data/riffs.json'),'utf8'));const riff=(Array.isArray(after)?after:Object.values(after)).find(r=>r.id===1);
    const sync=riff.segments[2].tabSync;
    assert.equal(sync.length,8);
    const worst=Math.max(...sync.map((a,k)=>Math.abs(a[2]-played[2][k].t)));
    assert.ok(worst<0.03,'every note within 30 ms of where it sounds, worst '+worst);
    assert.equal(riff.segments[6].tabSync,undefined);
});
