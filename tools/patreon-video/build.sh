#!/bin/bash
# Horizontal Patreon breakdown (1920x1080): video + synced tab + technique tips + intro/outro.
# Usage: run from a work dir W with: src/orig.MOV (4K source from Drive), riff.json (content/riff-media/<riff>.json), tab.tex.
# Splice (Iron Man): frames 0-801 + 597-699 + 907-end — the same edit as the app video (see riffkiller-start-here).
set -e
W=${W:-$PWD}; T=$(cd "$(dirname "$0")" && pwd); R=$(cd "$T/../.." && pwd)
mkdir -p "$W/comp" "$W/fr/main" "$W/fr/intro" "$W/fr/outro"
cp "$T"/comp.html "$T"/comp.js "$T"/render.cjs "$T"/*.woff2 "$W/comp/"
cp "$R/js/vendor/alphatab/alphaTab.min.js" "$W/comp/"; cp -r "$R/js/vendor/alphatab/font" "$W/comp/"
sed 's/#12121a/#F4F4F6/' "$R/assets/logo-main.svg" > "$W/comp/logo.svg"
cp "$W/riff.json" "$W/tab.tex" "$W/comp/"
cd "$W"
# 1) 4K -> 1080 (HEVC 4K in one filter graph runs out of memory), then splice
ffmpeg -v error -y -i src/orig.MOV -vf "scale=1920:1080:flags=lanczos,format=yuv420p" -c:v libx264 -preset veryfast -crf 9 -c:a copy src/full1080.mov
ffmpeg -v error -y -i src/full1080.mov -filter_complex "[0:v]trim=start_frame=0:end_frame=802,setpts=PTS-STARTPTS[v1];[0:v]trim=start_frame=597:end_frame=700,setpts=PTS-STARTPTS[v2];[0:v]trim=start_frame=907,setpts=PTS-STARTPTS[v3];[v1][v2][v3]concat=n=3:v=1:a=0[v];[0:a]atrim=0:26.735333,asetpts=PTS-STARTPTS[a1];[0:a]atrim=19.898:23.335333,asetpts=PTS-STARTPTS[a2];[0:a]atrim=30.231333,asetpts=PTS-STARTPTS[a3];[a1][a2]acrossfade=d=0.004:c1=tri:c2=tri[a12];[a12][a3]acrossfade=d=0.004:c1=tri:c2=tri[a]" -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 9 -r 30 -c:a pcm_s16le base.mov
# 2) overlay frames (transparent PNG) from the page
(cd comp && python3 -m http.server 8765 >/dev/null 2>&1 &) ; sleep 1
N=$(ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 base.mov)
(cd comp && node render.cjs intro 0 102 ../fr/intro && node render.cjs outro 0 210 ../fr/outro && node render.cjs main 0 $N ../fr/main)
# 3) composite: intro (B&W fretting hand from 4K under the cover grid), main (video band y151 h810), outro
ffmpeg -v error -y -ss 19.874 -t 3.45 -i src/orig.MOV -an -vf "crop=1300:1712:1420:420,scale=820:1080:flags=lanczos,hue=s=0,eq=contrast=1.18:brightness=-0.03,format=yuv420p" -c:v libx264 -crf 12 -preset veryfast -r 30 introbw.mov
ffmpeg -v error -y -i introbw.mov -framerate 30 -i fr/intro/%05d.png -f lavfi -i "color=c=0x0B0B0F:s=1920x1080:r=30:d=3.4" -filter_complex "[2:v][0:v]overlay=0:0:shortest=1[b];[b][1:v]overlay=0:0:shortest=1,format=yuv420p[v]" -map "[v]" -frames:v 102 -c:v libx264 -crf 12 -preset veryfast intro.mov
ffmpeg -v error -y -framerate 30 -i fr/outro/%05d.png -vf format=yuv420p -c:v libx264 -crf 12 -preset veryfast outro.mov
ffmpeg -v error -y -i base.mov -framerate 30 -i fr/main/%05d.png -filter_complex "color=c=0x0B0B0F:s=1920x1080:r=30[bg];[0:v]crop=1920:810:0:151[vid];[bg][vid]overlay=0:0:shortest=1[b];[b][1:v]overlay=0:0:shortest=1,format=yuv420p[v]" -map "[v]" -map 0:a -frames:v $N -c:v libx264 -crf 12 -preset veryfast -c:a pcm_s16le main.mov
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 main.mov); O2=$(python3 -c "print(2.9+$D-0.6)")
ffmpeg -v error -y -i intro.mov -i main.mov -i outro.mov -ss 19.874 -t 3.4 -i base.mov -f lavfi -t 7 -i "anullsrc=r=44100:cl=stereo" -filter_complex "[0:v]settb=1/30,fps=30[v0];[1:v]settb=1/30,fps=30[v1];[2:v]settb=1/30,fps=30[v2];[v0][v1]xfade=transition=fade:duration=0.5:offset=2.9[x1];[x1][v2]xfade=transition=fade:duration=0.6:offset=$O2,format=yuv420p[v];[3:a]aformat=sample_rates=44100:channel_layouts=stereo,afade=t=in:d=0.3[a0];[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a1];[4:a]aformat=sample_rates=44100:channel_layouts=stereo[a2];[a0][a1]acrossfade=d=0.5[ax];[ax][a2]acrossfade=d=0.6[a]" -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 256k -movflags +faststart patreon.mp4
echo "done: $W/patreon.mp4"
