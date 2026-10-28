const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const crypto=require('node:crypto');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');
const {startSite}=require('./site-fixture.cjs');

// One fake server stands in for lava.top, the YooKassa API, Robokassa's recurring endpoint and TronGrid.
const calls=[];const lavaInvoices={};const ykPayments={};let ykSeq=0;const tronTransfers=[];
const WALLET='T'+'A'.repeat(33);const USDT='TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const fake=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://fake');let body='';req.on('data',c=>body+=c);req.on('end',()=>{
        const call={method:req.method,path:url.pathname,query:url.searchParams,headers:req.headers,body};calls.push(call);
        const json=(code,obj)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(obj));};
        if(url.pathname==='/api/v3/invoice'){
            if(req.headers['x-api-key']!=='lava-key')return json(401,{error:'bad key'});
            if(JSON.parse(body).email==='seller@example.com')return json(400,{error:'Incorrect email to purchase'});
            const id=crypto.randomUUID();lavaInvoices[id]='NEW';
            return json(201,{id,status:'NEW',amountTotal:{currency:'USD',amount:9},paymentUrl:'https://app.lava.top/pay/'+id});
        }
        if(url.pathname.startsWith('/api/v2/invoices/'))return json(200,{id:url.pathname.split('/').pop(),status:lavaInvoices[url.pathname.split('/').pop()]||'FAILED'});
        if(url.pathname==='/api/v1/subscriptions'&&req.method==='DELETE'){res.statusCode=204;return res.end();}
        if(url.pathname==='/v3/payments'&&req.method==='POST'){
            const b=JSON.parse(body);const id='yk-'+(++ykSeq)+'-0000';
            ykPayments[id]={id,status:b.payment_method_id?'succeeded':'pending',paid:!!b.payment_method_id,amount:b.amount,metadata:b.metadata,
                payment_method:{id:b.payment_method_id||'pm-saved-1',saved:!!(b.save_payment_method||b.payment_method_id)}};
            return json(200,{...ykPayments[id],confirmation:{type:'redirect',confirmation_url:'https://yoomoney.ru/checkout/'+id}});
        }
        if(url.pathname.startsWith('/v3/payments/')){const p=ykPayments[url.pathname.split('/').pop()];return p?json(200,p):json(404,{});}
        if(url.pathname==='/v1/accounts/'+WALLET+'/transactions/trc20'){
            const since=Number(url.searchParams.get('min_timestamp'));
            assert.equal(url.searchParams.get('only_to'),'true');assert.equal(url.searchParams.get('only_confirmed'),'true');
            return json(200,{success:true,data:tronTransfers.filter(t=>t.block_timestamp>=since)});
        }
        if(url.pathname==='/Merchant/Recurring'){res.end('OK'+new URLSearchParams(body).get('InvoiceID'));return;}
        json(404,{});
    });
});
let site;
before(async()=>{
    await new Promise(r=>fake.listen(0,'127.0.0.1',r));
    const base='http://127.0.0.1:'+fake.address().port;
    site=await startSite({env:[
        'LAVA_API_KEY=lava-key','LAVA_OFFER_ID=11111111-2222-3333-4444-555555555555','LAVA_WEBHOOK_SECRET=lava-hook','LAVA_API_BASE='+base,
        'BILLING_RUB_MONTHLY=900','BILLING_RUB_YEARLY=9000',
        'ROBOKASSA_LOGIN=riffkiller','ROBOKASSA_PASSWORD1=pass-one','ROBOKASSA_PASSWORD2=pass-two','ROBOKASSA_RECURRING_URL='+base+'/Merchant/Recurring',
        'YOOKASSA_SHOP_ID=12345','YOOKASSA_SECRET_KEY=yk-secret','YOOKASSA_API_BASE='+base,
        'USDT_TRC20_ADDRESS='+WALLET,'TRONGRID_API_BASE='+base,'',
    ].join('\n')});
});
after(()=>{site?.stop();fake.close()});

const md5=s=>crypto.createHash('md5').update(s).digest('hex');
const day=86400;const now=()=>Math.floor(Date.now()/1000);
const subOf=id=>JSON.parse(fs.readFileSync(path.join(site.dir,'data/subscriptions',id+'.json'),'utf8'));
const renewals=()=>JSON.parse(fs.readFileSync(path.join(site.dir,'data/billing/renewals.json'),'utf8'));
let userSeq=0;
async function signUp() {
    const email=`buyer${++userSeq}@example.com`;
    const r=await fetch(site.base+'/api/auth/email-register.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123'})});
    const body=await r.json();assert.equal(body.success,true);
    return {id:body.user.id,email,cookie:r.headers.getSetCookie().at(-1).split(';')[0]};
}
const api=(user,file,body)=>fetch(site.base+'/api/billing/'+file,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body&&JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json()}));
const lavaHook=(event,key='lava-hook')=>fetch(site.base+'/api/billing/lava-webhook.php',{method:'POST',headers:{'Content-Type':'application/json','X-Api-Key':key},body:JSON.stringify(event)});
// Async, so the fake APIs in this process can answer the cron run; any HTTP proxy of the environment is bypassed.
const runRenewals=async()=>(await promisify(execFile)(process.env.PHP_BIN||'php',[path.join(site.dir,'config/billing-renew.php')],{encoding:'utf8',env:{...process.env,no_proxy:'127.0.0.1',NO_PROXY:'127.0.0.1'}})).stdout;
function dueNow(userId){
    const f=path.join(site.dir,'data/billing/renewals.json');const all=JSON.parse(fs.readFileSync(f,'utf8'));
    all[userId].paid_until=now()+3600;fs.writeFileSync(f,JSON.stringify(all));
}

test('the billing page learns which methods are on; paying needs an account',async()=>{
    const {body}=await api(null,'options.php');
    assert.deepEqual([body.providers.lava,body.providers.robokassa,body.providers.yookassa,body.providers.stripe,body.providers.cryptomus],[true,true,true,false,false]);
    assert.deepEqual(body.providers.rub,{monthly:'900.00',quarterly:null,yearly:'9000.00'});
    assert.equal(body.signedIn,false);
    assert.equal((await api(null,'create.php',{provider:'lava',plan:'monthly'})).status,401);
});

test('lava.top: invoice, confirmed payment, monthly renewal, cancellation',async()=>{
    const user=await signUp();
    const created=await api(user,'create.php',{provider:'lava',plan:'monthly',lang:'ru'});
    assert.equal(created.status,200);assert.match(created.body.paymentUrl,/^https:\/\/app\.lava\.top\/pay\//);
    const inv=JSON.parse(calls.filter(c=>c.path==='/api/v3/invoice').at(-1).body);
    assert.equal(inv.offerId,'11111111-2222-3333-4444-555555555555');assert.equal(inv.periodicity,'MONTHLY');
    assert.equal(inv.email,user.email);assert.equal(inv.buyerLanguage,'RU');assert.equal(inv.currency,'USD');
    const contractId=created.body.paymentUrl.split('/').pop();

    const success={eventType:'payment.success',contractId,amount:9,currency:'USD',status:'completed',buyer:{email:user.email}};
    assert.equal((await lavaHook(success,'wrong')).status,401,'a forged webhook is refused');
    assert.equal((await lavaHook(success)).status,409,'unconfirmed by lava.top: retried later, nothing granted');
    assert.equal(fs.existsSync(path.join(site.dir,'data/subscriptions',user.id+'.json')),false);
    lavaInvoices[contractId]='COMPLETED';
    assert.equal((await lavaHook(success)).status,200);
    let sub=subOf(user.id);assert.equal(sub.status,'active');assert.equal(sub.source,'lava');
    assert.ok(Math.abs(sub.expires-(now()+33*day))<60);
    await lavaHook(success);assert.equal(subOf(user.id).expires,sub.expires,'a repeated webhook does not extend twice');

    await lavaHook({eventType:'subscription.recurring.payment.success',contractId:crypto.randomUUID(),parentContractId:contractId,amount:9,currency:'USD'});
    assert.ok(Math.abs(subOf(user.id).expires-(sub.expires+30*day))<60,'renewal adds a month after the paid period');

    assert.equal((await api(user,'create.php',{provider:'lava',plan:'yearly'})).status,409,'no second subscription while one renews');
    const cancel=await api(user,'cancel.php',{});assert.equal(cancel.body.success,true);
    const del=calls.filter(c=>c.method==='DELETE').at(-1);assert.equal(del.query.get('contractId'),contractId);assert.equal(del.query.get('email'),user.email);
    const status=(await api(user,'status.php')).body;assert.equal(status.renewal.auto,false);assert.equal(status.subscription.status,'active','premium stays until the paid period ends');
});

test('Robokassa: signed payment link, ResultURL, renewal charge from cron',async()=>{
    const user=await signUp();
    const {body}=await api(user,'create.php',{provider:'robokassa',plan:'yearly'});
    const q=new URL(body.paymentUrl).searchParams;
    assert.equal(q.get('OutSum'),'9000.00');assert.equal(q.get('Recurring'),'true');assert.equal(q.get('Shp_user'),user.id);
    const inv=q.get('InvId');
    assert.equal(q.get('SignatureValue'),md5(`riffkiller:9000.00:${inv}:pass-one:Shp_plan=yearly:Shp_user=${user.id}`));
    const result=(form)=>fetch(site.base+'/api/billing/robokassa-result.php',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form)}).then(async r=>({status:r.status,text:await r.text()}));
    const sign=(sum,id)=>md5(`${sum}:${id}:pass-two:Shp_plan=yearly:Shp_user=${user.id}`).toUpperCase();
    assert.equal((await result({OutSum:'9000.000000',InvId:inv,SignatureValue:'00',Shp_plan:'yearly',Shp_user:user.id})).status,400);
    assert.equal((await result({OutSum:'90.000000',InvId:inv,SignatureValue:sign('90.000000',inv),Shp_plan:'yearly',Shp_user:user.id})).status,400,'a smaller sum does not count');
    const ok=await result({OutSum:'9000.000000',InvId:inv,SignatureValue:sign('9000.000000',inv),Shp_plan:'yearly',Shp_user:user.id});
    assert.equal(ok.text,'OK'+inv);
    const first=subOf(user.id);assert.equal(first.source,'robokassa');assert.equal(first.plan,'yearly');assert.ok(Math.abs(first.expires-(now()+368*day))<60);

    assert.equal(await runRenewals(),'','nothing is due yet');
    dueNow(user.id);
    assert.match(await runRenewals(),new RegExp(user.id+' robokassa charged'));
    const charge=new URLSearchParams(calls.filter(c=>c.path==='/Merchant/Recurring').at(-1).body);
    assert.equal(charge.get('PreviousInvoiceID'),inv);const next=charge.get('InvoiceID');
    assert.equal(charge.get('SignatureValue'),md5(`riffkiller:9000.00:${next}:pass-one:Shp_plan=yearly:Shp_user=${user.id}`));
    assert.equal(await runRenewals(),'','one attempt per 12 hours');
    await result({OutSum:'9000.000000',InvId:next,SignatureValue:sign('9000.000000',next),Shp_plan:'yearly',Shp_user:user.id});
    assert.ok(Math.abs(subOf(user.id).expires-(now()+3600+365*day+3*day))<60);
    assert.equal(renewals()[user.id].attempts,0);
});

test('YooKassa: payment re-read from the API, saved card renews',async()=>{
    const user=await signUp();
    const {body}=await api(user,'create.php',{provider:'yookassa',plan:'monthly'});
    assert.match(body.paymentUrl,/^https:\/\/yoomoney\.ru\/checkout\//);
    const created=calls.filter(c=>c.path==='/v3/payments'&&c.method==='POST').at(-1);
    assert.equal(created.headers.authorization,'Basic '+Buffer.from('12345:yk-secret').toString('base64'));
    const req=JSON.parse(created.body);assert.equal(req.amount.value,'900.00');assert.equal(req.save_payment_method,true);assert.equal(req.metadata.user_id,user.id);
    const id=body.paymentUrl.split('/').pop();
    const hook=()=>fetch(site.base+'/api/billing/yookassa-webhook.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'notification',event:'payment.succeeded',object:{id,status:'succeeded'}})}).then(r=>r.json());
    assert.equal((await hook()).result,'pending','a notification alone grants nothing');
    Object.assign(ykPayments[id],{status:'succeeded',paid:true});
    assert.equal((await hook()).result,'paid');
    const sub=subOf(user.id);assert.equal(sub.source,'yookassa');assert.equal(renewals()[user.id].token,'pm-saved-1');

    dueNow(user.id);
    assert.match(await runRenewals(),new RegExp(user.id+' yookassa charged'));
    const renew=JSON.parse(calls.filter(c=>c.path==='/v3/payments'&&c.method==='POST').at(-1).body);
    assert.equal(renew.payment_method_id,'pm-saved-1');assert.equal(renew.confirmation,undefined);
    assert.ok(Math.abs(subOf(user.id).expires-(now()+3600+33*day))<60);
});

test('renewal stops after three unpaid attempts',async()=>{
    const user=await signUp();
    const {body}=await api(user,'create.php',{provider:'robokassa',plan:'monthly'});
    const q=new URL(body.paymentUrl).searchParams;const inv=q.get('InvId');
    await fetch(site.base+'/api/billing/robokassa-result.php',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({OutSum:'900.00',InvId:inv,SignatureValue:md5(`900.00:${inv}:pass-two:Shp_plan=monthly:Shp_user=${user.id}`),Shp_plan:'monthly',Shp_user:user.id})});
    const f=path.join(site.dir,'data/billing/renewals.json');
    for(let i=0;i<3;i++){dueNow(user.id);const all=JSON.parse(fs.readFileSync(f,'utf8'));all[user.id].last_attempt=0;fs.writeFileSync(f,JSON.stringify(all));await runRenewals();}
    assert.equal(renewals()[user.id].attempts,3);
    const all=JSON.parse(fs.readFileSync(f,'utf8'));all[user.id].last_attempt=0;fs.writeFileSync(f,JSON.stringify(all));
    assert.match(await runRenewals(),/stopped/);assert.equal(renewals()[user.id].auto,false);
});

test('the renewal script only runs from cron',async()=>{
    assert.equal((await fetch(site.base+'/config/billing-renew.php')).status,404);
});

const transfer=(amount,extra={})=>{const t={transaction_id:crypto.randomBytes(32).toString('hex'),block_timestamp:Date.now(),from:'TBuyer'+'B'.repeat(28),to:WALLET,
    value:String(Math.round(Number(amount)*1e6)),token_info:{address:USDT,symbol:'USDT',decimals:6},type:'Transfer',...extra};tronTransfers.push(t);return t;};
const tronCalls=()=>calls.filter(c=>c.path.includes('/transactions/trc20')).length;

test('USDT: unique amount per order, matched to the transfer, one-off premium that extends',async()=>{
    const {body:opts}=await api(null,'options.php');
    assert.equal(opts.providers.usdt,true);assert.deepEqual(opts.providers.usdtPrice,{monthly:9,quarterly:20,yearly:90});
    const user=await signUp();const other=await signUp();
    const order=(await api(user,'create.php',{provider:'usdt',plan:'monthly'})).body.usdt;
    assert.match(order.amount,/^9\.(0[1-9]|[1-9]\d)$/);assert.equal(order.address,WALLET);assert.equal(order.state,'pending');
    assert.ok(order.expiresAt>now()+3000);
    assert.equal((await api(user,'create.php',{provider:'usdt',plan:'monthly'})).body.usdt.orderId,order.orderId,'the same open order is shown again');
    const theirs=(await api(other,'create.php',{provider:'usdt',plan:'monthly'})).body.usdt;
    assert.notEqual(theirs.amount,order.amount,'two open orders never share an amount');
    assert.equal((await api(other,'status.php?order='+order.orderId)).body.usdt,null,'an order is visible only to its owner');

    // Near misses do not count: a different amount, another token, another wallet, a transfer from before the order.
    transfer(Number(order.amount)+0.01);transfer(order.amount,{token_info:{address:'TFakeToken'+'C'.repeat(24)}});
    transfer(order.amount,{to:'T'+'D'.repeat(33)});transfer(order.amount,{block_timestamp:(order.expiresAt-3600-600)*1000});
    await runRenewals();
    assert.equal((await api(user,'status.php?order='+order.orderId)).body.usdt.state,'pending');

    // Polls within 15 s of the last check wait for the cron.
    const tx=transfer(order.amount);await runRenewals();
    const st=(await api(user,'status.php?order='+order.orderId)).body;
    assert.equal(st.usdt.state,'paid');
    const sub=subOf(user.id);assert.equal(sub.source,'usdt');assert.equal(sub.status,'active');
    assert.ok(Math.abs(sub.expires-(now()+30*day))<60,'a month, no grace days for a one-off payment');
    assert.equal(renewals()[user.id].auto,false);
    const orders=JSON.parse(fs.readFileSync(path.join(site.dir,'data/billing/orders.json'),'utf8'));
    assert.equal(orders[order.orderId].txid,tx.transaction_id);
    assert.equal((await api(other,'status.php?order='+theirs.orderId)).body.usdt.state,'pending','the other buyer still waits');

    // The same transaction never pays twice; paying again for a year adds to the month already paid.
    await runRenewals();assert.equal(subOf(user.id).expires,sub.expires);
    const yearly=(await api(user,'create.php',{provider:'usdt',plan:'yearly'})).body.usdt;
    assert.match(yearly.amount,/^90\.\d\d$/);
    transfer(yearly.amount);assert.match(await runRenewals(),/usdt paid/);
    assert.ok(Math.abs(subOf(user.id).expires-(sub.expires+365*day))<5);
});

test('USDT: the page polls at most every 15 s, the cron checks only while an order is open',async()=>{
    const user=await signUp();
    const order=(await api(user,'create.php',{provider:'usdt',plan:'monthly'})).body.usdt;
    const before=tronCalls();
    await api(user,'status.php?order='+order.orderId);await api(user,'status.php?order='+order.orderId);
    assert.ok(tronCalls()-before<=1,'two quick polls ask TronGrid once at most');
    transfer(order.amount);await runRenewals();
    assert.equal((await api(user,'status.php?order='+order.orderId)).body.usdt.state,'paid');
    // Leave no open orders behind (the first test's other buyer still has one): expire them.
    const f=path.join(site.dir,'data/billing/orders.json');const all=JSON.parse(fs.readFileSync(f,'utf8'));
    for(const o of Object.values(all))if(o.provider==='usdt'&&!o.paid)o.expires=now()-3*3600;
    fs.writeFileSync(f,JSON.stringify(all));
    const idle=tronCalls();await runRenewals();assert.equal(tronCalls(),idle,'no open orders, no TronGrid calls');
});

test('3 months: lava.top bills every 90 days, USDT asks 20.xx, rouble checkouts need their own price',async()=>{
    const user=await signUp();
    assert.equal((await api(user,'create.php',{provider:'robokassa',plan:'quarterly'})).status,400,'no BILLING_RUB_QUARTERLY, no rouble checkout');
    const created=await api(user,'create.php',{provider:'lava',plan:'quarterly'});
    assert.equal(created.status,200);
    const inv=JSON.parse(calls.filter(c=>c.path==='/api/v3/invoice').at(-1).body);
    assert.equal(inv.periodicity,'PERIOD_90_DAYS');assert.equal(inv.offerId,'11111111-2222-3333-4444-555555555555');
    const contractId=created.body.paymentUrl.split('/').pop();lavaInvoices[contractId]='COMPLETED';
    await lavaHook({eventType:'payment.success',contractId,amount:20,currency:'USD',status:'completed'});
    const sub=subOf(user.id);assert.equal(sub.plan,'quarterly');assert.ok(Math.abs(sub.expires-(now()+93*day))<60);
    assert.equal((await api(user,'status.php')).body.renewal.plan,'quarterly');
    const buyer=await signUp();
    assert.match((await api(buyer,'create.php',{provider:'usdt',plan:'quarterly'})).body.usdt.amount,/^20\.\d\d$/);
});

test('lava.top refuses an email: the page asks for another one and it is used',async()=>{
    const user=await signUp();
    const refused=await api(user,'create.php',{provider:'lava',plan:'monthly',email:'seller@example.com'});
    assert.equal(refused.status,400);assert.equal(refused.body.needEmail,true);
    assert.match(refused.body.error,/did not accept seller@example\.com/);assert.equal(refused.body.refusedEmail,'seller@example.com');
    const ok=await api(user,'create.php',{provider:'lava',plan:'monthly',email:'other@example.com'});
    assert.equal(ok.status,200);
    assert.equal(JSON.parse(calls.filter(c=>c.path==='/api/v3/invoice').at(-1).body).email,'other@example.com','the typed email wins over the account one');
});
