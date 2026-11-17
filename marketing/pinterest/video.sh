#!/bin/sh
# A chapter page-through video (silent: Pinterest autoplays muted). Needs ffmpeg and the pins from make.mjs.
#   sh video.sh                                   the chapter 1 video, pins/20-video.mp4
#   sh video.sh <story> <pages> <cover pin> <out> e.g. sh video.sh toby-4 3,4,5,6,7,8 14-book-4 27-video-book-4
# The cover pin opens the video and the tap-a-word pin closes it.
set -e
cd "$(dirname "$0")"
STORY=${1:-toby-1}; PAGES=${2:-0,1,3,4,5,6,8}; COVER=${3:-11-book-1}; OUT=${4:-20-video}
F=$(mktemp -d)
N=$(node video-frames.mjs "$F" "$STORY" "$PAGES" | tail -1)
python3 - "$F" "$N" "$COVER" "$OUT" <<'PY'
import subprocess, sys
S, N, cover, out = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
items = [(f'pins/{cover}.jpg', 3)] + [(f'{S}/{i:02d}.png', 3.2) for i in range(1, N + 1)] + [('pins/04-tap-a-word.jpg', 3.5)]
F = 0.5
args = ['ffmpeg', '-y', '-loglevel', 'error']
for f, d in items: args += ['-loop', '1', '-t', str(d + F), '-i', f]
fl = [f'[{i}:v]scale=1000:1500:force_original_aspect_ratio=decrease,pad=1000:1500:(ow-iw)/2:(oh-ih)/2:color=0xfbf5ea,setsar=1,fps=30,format=yuv420p[v{i}]' for i in range(len(items))]
prev, off = 'v0', 0
for i in range(1, len(items)):
    off += items[i - 1][1]
    fl.append(f'[{prev}][v{i}]xfade=transition=fade:duration={F}:offset={off:.2f}[x{i}]'); prev = f'x{i}'
args += ['-filter_complex', ';'.join(fl), '-map', f'[{prev}]', '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', f'pins/{out}.mp4']
subprocess.run(args, check=True)
PY
rm -r "$F"
