set -e
cd /home/claude/im/comp
R() { node render2.cjs 2 "../fr/$1" "$2"; }
R y/sect1 '[["sect",0,72,{"title":"MAIN<br>RIFF","from":4,"to":7,"note":"A rise to E, then a half-step shake above it that falls back home."}]]'
R y/sect2 '[["sect",0,72,{"title":"VERSE","from":8,"to":11,"note":"The same melody as single notes — the vocal sings it in unison."}]]'
#R y/full '[["main",0,2515,{"chip":"Full riff"}]]'
R y/loopA '[["main",596,1395,{"chip":"Part by part","rep":1,"of":2}]]'
R y/loopB '[["main",596,1395,{"chip":"Part by part","rep":2,"of":2}]]'
echo FRAMES_DONE
cd /home/claude/im
ENC="-c:v libx264 -preset veryfast -crf 15 -pix_fmt yuv420p -r 30"
DARK=0x0B0B0F
for L in A B; do
ffmpeg -v error -y -ss 19.8667 -i base4k.mov -start_number 596 -framerate 30 -i fr/y/loop$L/%05d.png -filter_complex "color=c=$DARK:s=3840x2160:r=30[bg];[0:v]crop=3840:1400:0:78[c];[bg][c]overlay=0:0:shortest=1[b];[b][1:v]overlay=0:0:shortest=1,format=yuv420p[v]" -map "[v]" -an -frames:v 799 $ENC yt/loopsrc$L.mov
done
ffmpeg -v error -y -i base4k.mov -framerate 30 -i fr/y/full/%05d.png -filter_complex "color=c=$DARK:s=3840x2160:r=30[bg];[0:v]crop=3840:1400:0:78[c];[bg][c]overlay=0:0:shortest=1[b];[b][1:v]overlay=0:0:shortest=1,format=yuv420p[v]" -map "[v]" -an -frames:v 2515 $ENC yt/full_v2.mov
ffmpeg -v error -y -i yt/intro.mov -i yt/full_v2.mov -filter_complex "[0:v]settb=1/30,fps=30[v0];[1:v]settb=1/30,fps=30[v1];[v0][v1]xfade=transition=fade:duration=0.5:offset=2.9,fade=t=out:st=86.433:d=0.3:color=$DARK,format=yuv420p[v]" -map "[v]" -an $ENC yt/c01_v.mov
ffprobe -v error -show_entries format=duration -of csv=p=0 yt/c01_v.mov
for c in sect1 sect2; do ffmpeg -v error -y -framerate 30 -i fr/y/$c/%05d.png -vf "fade=t=in:d=0.25:color=$DARK,fade=t=out:st=2.15:d=0.25:color=$DARK,format=yuv420p" -frames:v 72 -an $ENC yt/${c}_v.mov; done
python3 - <<'P'
import json,subprocess
d=json.load(open('/home/claude/im/comp/riff.json'))['riff']['segments']
fr=lambda t: round(t*30)
for sec,(a,b) in {'l1':(3,7),'l2':(7,11)}.items():
    items=[]
    for k in range(a,b):
        s,e=fr(d[k]['start'])-596, fr(d[k]['end'])-596
        items += [(s,e,'A'),(s,e,'B')]
    files=[]
    for n,(s,e,L) in enumerate(items):
        dur=(e-s)/30; vf='format=yuv420p'
        if n==0: vf='fade=t=in:d=0.25:color=0x0B0B0F,'+vf
        if n==len(items)-1: vf='fade=t=out:st=%.4f:d=0.3:color=0x0B0B0F,'%(dur-0.3)+vf
        f='/home/claude/im/yt/%s_v%02d.mov'%(sec,n)
        subprocess.run(['ffmpeg','-v','error','-y','-ss','%.6f'%(s/30),'-i','/home/claude/im/yt/loopsrc%s.mov'%L,'-frames:v',str(e-s),'-vf',vf,'-an',
          '-c:v','libx264','-preset','veryfast','-crf','15','-pix_fmt','yuv420p','-r','30',f],check=True)
        files.append(f)
    open('/home/claude/im/yt/%s_v.txt'%sec,'w').write(''.join("file '%s'\n"%f for f in files))
P
ffmpeg -v error -y -f concat -safe 0 -i yt/l1_v.txt -c copy yt/l1_v.mov
ffmpeg -v error -y -f concat -safe 0 -i yt/l2_v.txt -c copy yt/l2_v.mov
ffmpeg -v error -y -i yt/c09.mov -map 0:v -c copy yt/c09_v.mov
for V in yt pat; do
  END=$([ $V = yt ] && echo c09_v.mov || echo c09p_v.mov)
  printf "file 'c01_v.mov'\nfile 'sect1_v.mov'\nfile 'l1_v.mov'\nfile 'sect2_v.mov'\nfile 'l2_v.mov'\nfile '$END'\n" > yt/$V-v2.txt
  ffmpeg -v error -y -f concat -safe 0 -i yt/$V-v2.txt -c copy yt/${V}4k_v2.mov
done
for V in yt pat; do
  A=$([ $V = yt ] && echo fix/yt_audio.wav || echo fix/pat2_audio.wav)
  ffmpeg -v error -y -i yt/${V}4k_v2.mov -vf scale=2560:1440:flags=lanczos -c:v libx264 -preset medium -b:v 4400k -pass 1 -passlogfile yt/q$V -an -f null /dev/null
  ffmpeg -v error -y -i yt/${V}4k_v2.mov -i $A -map 0:v -map 1:a -vf scale=2560:1440:flags=lanczos -c:v libx264 -preset medium -b:v 4400k -pass 2 -passlogfile yt/q$V -c:a aac -b:a 192k -shortest -movflags +faststart out_${V}_v2.mp4
  ffprobe -v error -show_entries stream=codec_type,duration -of csv=p=0 out_${V}_v2.mp4
done
echo ALL_V2_DONE
