set -e
cd /home/claude/im
ENC="-c:v libx264 -preset veryfast -crf 15 -pix_fmt yuv420p -r 30"
AENC="-c:a pcm_s16le -ar 44100 -ac 2"
DARK=0x0B0B0F
# A+B: intro xfade full
ffmpeg -v error -y -ss 19.874 -t 3.45 -i src/orig.MOV -an -vf "crop=1300:1712:1420:420,scale=1640:2160:flags=lanczos,hue=s=0,eq=contrast=1.18:brightness=-0.03,format=yuv420p" $ENC yt/introbw.mov
ffmpeg -v error -y -i yt/introbw.mov -framerate 30 -i fr/y/intro/%05d.png -f lavfi -i "color=c=$DARK:s=3840x2160:r=30:d=3.4" -filter_complex "[2:v][0:v]overlay=0:0:shortest=1[b];[b][1:v]overlay=0:0:shortest=1,format=yuv420p[v]" -map "[v]" -frames:v 102 $ENC yt/intro.mov
ffmpeg -v error -y -i base4k.mov -framerate 30 -i fr/y/full/%05d.png -filter_complex "color=c=$DARK:s=3840x2160:r=30[bg];[bg][0:v]overlay=0:0:shortest=1[b];[b][1:v]overlay=0:0:shortest=1,format=yuv420p[v]" -map "[v]" -map 0:a -frames:v 2515 $ENC $AENC yt/full.mov
ffmpeg -v error -y -i yt/intro.mov -i yt/full.mov -ss 19.874 -t 3.4 -i base.mov -filter_complex "[0:v]settb=1/30,fps=30[v0];[1:v]settb=1/30,fps=30[v1];[v0][v1]xfade=transition=fade:duration=0.5:offset=2.9,fade=t=out:st=86.433:d=0.3:color=$DARK,format=yuv420p[v];[2:a]aformat=sample_rates=44100:channel_layouts=stereo,afade=t=in:d=0.3[a0];[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a1];[a0][a1]acrossfade=d=0.5,afade=t=out:st=86.433:d=0.3[a]" -map "[v]" -map "[a]" $ENC $AENC yt/c01.mov
# loop source: frames 596..1394
ffmpeg -v error -y -ss 19.8667 -i base4k.mov -start_number 596 -framerate 30 -i fr/y/loop/%05d.png -filter_complex "color=c=$DARK:s=3840x2160:r=30[bg];[bg][0:v]overlay=0:0:shortest=1[b];[b][1:v]overlay=0:0:shortest=1,format=yuv420p[v]" -map "[v]" -map 0:a -frames:v 799 $ENC $AENC yt/loopsrc.mov
# sections
mkcard() { ffmpeg -v error -y -framerate 30 -i fr/y/$1/%05d.png -f lavfi -t 2.4 -i anullsrc=r=44100:cl=stereo -vf "fade=t=in:d=0.25:color=$DARK,fade=t=out:st=2.15:d=0.25:color=$DARK,format=yuv420p" -frames:v 72 $ENC $AENC -shortest yt/$1.mov; }
mkcard sect1; mkcard sect2
# loops: part frame ranges (relative to frame 596)
python3 - <<'P'
import json,subprocess
d=json.load(open('/home/claude/im/comp/riff.json'))['riff']['segments']
def fr(t): return round(t*30)
for sec,(a,b) in {'l1':(3,7),'l2':(7,11)}.items():
    parts=list(range(a,b)); items=[]
    for k in parts:
        s,e=fr(d[k]['start'])-596, fr(d[k]['end'])-596
        items += [(s,e),(s,e)]
    files=[]
    for n,(s,e) in enumerate(items):
        dur=(e-s)/30; vf='format=yuv420p'; af='afade=t=in:d=0.008,afade=t=out:st=%.4f:d=0.012'%(dur-0.012)
        if n==0: vf='fade=t=in:d=0.25:color=0x0B0B0F,'+vf; af='afade=t=in:d=0.25,afade=t=out:st=%.4f:d=0.012'%(dur-0.012)
        if n==len(items)-1: vf='fade=t=out:st=%.4f:d=0.3:color=0x0B0B0F,'%(dur-0.3)+vf; af='afade=t=in:d=0.008,afade=t=out:st=%.4f:d=0.3'%(dur-0.3)
        f='/home/claude/im/yt/%s_%02d.mov'%(sec,n)
        subprocess.run(['ffmpeg','-v','error','-y','-i','/home/claude/im/yt/loopsrc.mov','-vf','select=between(n\\,%d\\,%d),setpts=N/30/TB,'%(s,e-1)+vf,'-af','atrim=%.6f:%.6f,asetpts=PTS-STARTPTS,'%(s/30,e/30)+af,'-frames:v',str(e-s),
          '-c:v','libx264','-preset','veryfast','-crf','15','-pix_fmt','yuv420p','-r','30','-c:a','pcm_s16le','-ar','44100','-ac','2',f],check=True)
        files.append(f)
    open('/home/claude/im/yt/%s.txt'%sec,'w').write(''.join("file '%s'\n"%f for f in files))
P
ffmpeg -v error -y -f concat -safe 0 -i yt/l1.txt -c copy yt/l1.mov
ffmpeg -v error -y -f concat -safe 0 -i yt/l2.txt -c copy yt/l2.mov
# outro + pack with riff bed
ffmpeg -v error -y -framerate 30 -i fr/y/outro/%05d.png -framerate 30 -i fr/y/pack/%05d.png -ss 19.874 -t 22 -i base.mov -filter_complex "[0:v]fade=t=in:d=0.3:color=$DARK,format=yuv420p[o];[1:v]format=yuv420p[p];[o][p]xfade=transition=fade:duration=0.5:offset=6.5,format=yuv420p[v];[2:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.4,afade=t=in:d=1,afade=t=out:st=19.5:d=2.5[a]" -map "[v]" -map "[a]" -t 21.5 $ENC $AENC yt/c09.mov
printf "file 'c01.mov'\nfile 'sect1.mov'\nfile 'l1.mov'\nfile 'sect2.mov'\nfile 'l2.mov'\nfile 'c09.mov'\n" > yt/all.txt
ffmpeg -v error -y -f concat -safe 0 -i yt/all.txt -c:v copy -c:a aac -b:a 256k -movflags +faststart iron-man-youtube-4k.mp4
echo YT_DONE
