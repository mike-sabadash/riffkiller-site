// Opens the admin riff list with the riff store in data/riffs.json and prints page errors, the cards drawn
// and whether "+ Новый рифф" opens the editor. Prints no riff data. Used by the Loop debug workflow.
const {startSite}=require('./site-fixture.cjs');
const {chromium}=require('playwright');
(async()=>{
    const site=await startSite();const browser=await chromium.launch();
    try {
        const ctx=await browser.newContext();const [name,value]=(await site.adminCookie()).split('=');
        await ctx.addCookies([{name,value,url:site.base}]);
        const page=await ctx.newPage();
        page.on('pageerror',e=>console.log('page error:',e.stack||e.message));
        page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('console '+m.type()+':',m.text());});
        page.on('response',r=>{if(r.status()>=400)console.log('http',r.status(),new URL(r.url()).pathname);});
        await page.goto(site.base+'/admin/riffs.html',{waitUntil:'load'});await page.waitForTimeout(3000);
        console.log('cards drawn:',await page.locator('#riffListBody .riff-card').count(),'| empty note:',await page.locator('#riffListBody .riff-list-empty').count());
        await page.click('#btnNewRiff');await page.waitForTimeout(500);
        console.log('edit tab active after "+ Новый рифф":',await page.evaluate(()=>document.getElementById('tabEdit').classList.contains('active')));
    } finally {await browser.close();site.stop();}
})().catch(e=>{console.error(e);process.exit(1);});
