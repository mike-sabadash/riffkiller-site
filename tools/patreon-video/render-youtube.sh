cd /home/claude/im/comp
R() { node render2.cjs "$1" "../fr/$2" "$3"; }
R 1 p/pack '[["pack",0,180,{"yt":false}]]'
R 2 y/intro '[["intro",0,102,{}]]'
R 2 y/sect1 '[["sect",0,72,{"title":"MAIN<br>RIFF","from":4,"to":7,"note":"A rise to E, then a half-step shake above it that falls back home."}]]'
R 2 y/sect2 '[["sect",0,72,{"title":"VERSE","from":8,"to":11,"note":"The same melody as single notes — the vocal sings it in unison."}]]'
R 2 y/outro '[["outro",0,210,{}]]'
R 2 y/pack '[["pack",0,450,{"yt":true}]]'
R 2 y/loop '[["main",596,1395,{"chip":"Part by part"}]]'
R 2 y/full '[["main",0,2515,{"chip":"Full riff"}]]'
echo ALL_DONE
