// Plucked-string (Karplus-Strong) recordings of known notes for the tab-to-sound sync tests.
const fs=require('node:fs');
const RATE=22050;
function random(seed){let s=seed%2147483647||1;return()=>{s=(s*48271)%2147483647;return s/2147483647;};}
function pluck(out,at,midi,dur,rnd){
    const n=Math.max(2,Math.round(RATE/(440*Math.pow(2,(midi-69)/12)))),buf=new Float32Array(n);
    for(let i=0;i<n;i++)buf[i]=(rnd()*2-1)*0.4;
    const start=Math.round(at*RATE),len=Math.round(dur*RATE);
    for(let i=0,k=0;i<len&&start+i<out.length;i++,k=(k+1)%n){
        const v=buf[k];buf[k]=0.996*0.5*(v+buf[(k+1)%n]);
        if(start+i>=0)out[start+i]+=v*(i>len-200?(len-i)/200:1);
    }
}
/** notes: [{ t, midis, dur }] → mono samples at 22050 Hz with a little noise and amp distortion. */
function render(notes,seconds,seed=7){
    const out=new Float32Array(Math.ceil(seconds*RATE)),rnd=random(seed);
    notes.forEach(n=>n.midis.forEach(m=>pluck(out,n.t,m,n.dur,rnd)));
    for(let i=0;i<out.length;i++)out[i]=Math.tanh(3*(out[i]+(rnd()-0.5)*0.01))/1.5;
    return out;
}
/** Tab events played from `start`, stretched by `scale`, with human timing (±jitter s). */
function perform(evs,totalMs,start,scale,jitter,seed=3){
    const rnd=random(seed);
    return evs.map((e,i)=>{
        const next=i+1<evs.length?evs[i+1].ms:totalMs;
        // Timing wanders slowly by up to 30 ms on top of the per-note jitter.
        return {t:start+e.ms/1000*scale+0.03*Math.sin(i/5)+(rnd()-0.5)*2*jitter,midis:e.midis,dur:Math.max(0.08,(next-e.ms)/1000*scale)};
    });
}
function writeWav(file,samples){
    const b=Buffer.alloc(44+samples.length*2);
    b.write('RIFF',0);b.writeUInt32LE(36+samples.length*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
    b.writeUInt32LE(RATE,24);b.writeUInt32LE(RATE*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);
    samples.forEach((v,i)=>b.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(v*32767))),44+i*2));
    fs.writeFileSync(file,b);
}
module.exports={RATE,render,perform,writeWav};
