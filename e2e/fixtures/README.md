# Fixtures

Checked in rather than generated, so the suite needs nothing but a browser.
They are small, deterministic, and the assertions quote their exact contents.

Regenerate with ffmpeg only if one of them has to change, and update the
constants in `e2e/helpers.ts` when you do.

`clip.mp4` — 6s, 640x360, 30fps, 180 frames. One flat colour a second, so a
cut is provable by reading the colours that survive it. A continuous 440Hz
tone underneath, so a join is provable by finding no silence at it.

```
ffmpeg -y \
 -f lavfi -i "color=c=0xE00000:s=640x360:r=30:d=1" \
 -f lavfi -i "color=c=0x00C000:s=640x360:r=30:d=1" \
 -f lavfi -i "color=c=0x0000E0:s=640x360:r=30:d=1" \
 -f lavfi -i "color=c=0xE0E000:s=640x360:r=30:d=1" \
 -f lavfi -i "color=c=0xE000E0:s=640x360:r=30:d=1" \
 -f lavfi -i "color=c=0x00E0E0:s=640x360:r=30:d=1" \
 -f lavfi -i "sine=frequency=440:duration=6" \
 -filter_complex "[0:v][1:v][2:v][3:v][4:v][5:v]concat=n=6:v=1:a=0[v]" \
 -map "[v]" -map 6:a -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest clip.mp4
```

`track.mp3` — 6s, 440Hz for its first half and 880Hz for its second. The step
is what proves where a laid soundtrack landed.

```
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=3" \
 -f lavfi -i "sine=frequency=880:duration=3" \
 -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[a]" \
 -map "[a]" -c:a libmp3lame -b:a 128k track.mp3
```

`shot.png` — 480x300, flat. A still, for the PNG export's own truths.

```
ffmpeg -y -f lavfi -i "color=c=0x00A0FF:s=480x300:d=1" -frames:v 1 shot.png
```
