const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cropBox}=require('../js/tab-strip.js').TabStrip;

// A w×h picture: black frame, white card, grey "ink" rectangle inside the card.
function picture(w,h,card,ink){
    const data=new Uint8ClampedArray(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const inside=(b)=>b&&x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h;
        const v=inside(ink)?90:inside(card)?255:0;const i=(y*w+x)*4;
        data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
    }
    return data;
}
test('a framed tab card is cropped to its ink plus padding, inside the card',()=>{
    const box=cropBox(picture(320,180,{x:30,y:40,w:260,h:100},{x:60,y:70,w:200,h:40}),320,180);
    assert.ok(box.x>=30&&box.x<60,JSON.stringify(box));
    assert.ok(box.y>=40&&box.y<70,JSON.stringify(box));
    assert.ok(box.x+box.w>260&&box.x+box.w<=290,JSON.stringify(box));
    assert.ok(box.y+box.h>110&&box.y+box.h<=140,JSON.stringify(box));
    assert.equal(box.background,'rgb(255,255,255)');
});
test('a picture with no margins is kept whole',()=>{
    const box=cropBox(picture(100,40,{x:0,y:0,w:100,h:40},null),100,40);
    assert.deepEqual([box.x,box.y,box.w,box.h],[0,0,100,40]);
});
