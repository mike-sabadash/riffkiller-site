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
    assert.ok((await page.locator('body').innerText()).includes('Riffs & collections'));
    await page.getByText('Sign up',{exact:true}).first().click();
    await page.fill('#authModalNameInput','Browser Practice');await page.fill('#authModalEmailInput','browser-test@example.com');await page.fill('#authModalPasswordInput','browser-test-password');
    await page.click('#authModalEmailBtn');await page.waitForFunction(()=>window.authManager.isAuthenticated);
    const id=await page.evaluate(()=>window.authManager.userData.id);
    await page.reload();await page.evaluate(()=>window.authManager.ready);
    assert.equal(await page.evaluate(()=>window.authManager.userData.id),id);
    fs.mkdirSync(path.join(site.dir,'data/subscriptions'),{recursive:true});
    fs.writeFileSync(path.join(site.dir,'data/subscriptions',id+'.json'),JSON.stringify({status:'active',source:'patreon',plan:'monthly',expires:Math.floor(Date.now()/1000)+3600}));
    await page.reload();await page.evaluate(()=>window.authManager.ready);
    assert.equal(await page.evaluate(()=>window.authManager.hasActiveSubscription()),true);
    await page.evaluate(()=>window.authManager.logout());await page.waitForURL('**/index.html');
    await page.getByText('Log in',{exact:true}).first().click();await page.fill('#authModalEmailInput','browser-test@example.com');await page.fill('#authModalPasswordInput','browser-test-password');await page.click('#authModalEmailBtn');
    await page.waitForFunction(()=>window.authManager.isAuthenticated && window.authManager.hasActiveSubscription());
    if(process.env.QA_SCREENSHOTS)await page.screenshot({path:path.join(process.env.QA_SCREENSHOTS,'library-desktop.png'),fullPage:true});
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
    const page=await pageFor(t);await page.goto(site.base+'/admin/riffs.html',{waitUntil:'domcontentloaded'});await page.click('.admin-tab[data-tab="edit"]');await page.selectOption('#riffSelect','1');
    await page.waitForFunction(()=>document.querySelectorAll('#segmentRows .segment-row').length===10);
    assert.equal(await page.locator('#dnaAtomsEditor > div').count(),4);
    await page.waitForFunction(()=>document.getElementById('segmentEditorVideo').readyState>=2);
    await page.evaluate(()=>{segmentEditorVideo.currentTime=.1;});await page.waitForFunction(()=>!segmentEditorVideo.seeking);await page.click('#segmentSetStart');
    assert.equal(Number(await page.locator('#segmentRows .start').first().inputValue()),.1);
    await page.locator('#segmentRows .name').first().fill('Edited in browser');
    await page.locator('#dnaAtomsEditor [data-field="label"]').first().fill('Edited Atom');
    var firstSave = page.waitForResponse(r=>r.url().endsWith('/api/riffs/save.php'));
    await page.click('#submitBtn');assert.equal((await firstSave).status(),200);
    await page.waitForSelector('#saveFeedback.show');
    await page.waitForFunction(()=>document.querySelector('#riffForm').dataset.editId==='1' && document.querySelector('#riffSelect').value==='1');
    await page.waitForTimeout(200);
    var secondSave = page.waitForResponse(r=>r.url().endsWith('/api/riffs/save.php'));
    await page.click('#submitBtn');assert.equal((await secondSave).status(),200);
    await page.reload();await page.click('.admin-tab[data-tab="edit"]');await page.selectOption('#riffSelect','1');await page.waitForFunction(()=>document.querySelectorAll('#segmentRows .segment-row').length===10);
    assert.equal(await page.locator('#segmentRows .name').first().inputValue(),'Edited in browser');
    assert.equal(await page.locator('#segmentRows .molecule').first().inputValue(),'A');
    assert.equal(await page.locator('#dnaAtomsEditor [data-field="label"]').first().inputValue(),'Edited Atom');
    assert.match(await page.locator('#segmentRows .tab-image').first().inputValue(),/1\.png$/);
    if(process.env.QA_SCREENSHOTS)await page.screenshot({path:path.join(process.env.QA_SCREENSHOTS,'editor-desktop.png'),fullPage:true});
    await practice(page);assert.match(await page.locator('.segment-btn').nth(1).innerText(),/Edited in browser/);
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
