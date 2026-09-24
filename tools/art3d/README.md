# Slot 3D art

Offline pipeline that produces `src/components/slots/art/<machine>/*.webp`: every symbol, logo, SPIN
button and reel frame of the eight premium machines is built as real geometry (extruded glyphs, lathed
gems/coins/bells, 3D type in each machine's display face) with PBR materials under a photo-studio
environment, rendered to a transparent PNG and finished to WebP. The app only ships the WebP files;
three.js is never bundled.

```sh
cd tools/art3d
npm install                       # three, opentype.js, playwright (uses the system Chromium)
mkdir fonts                       # the TTFs of the machines' faces, all SIL OFL (Google Fonts):
                                  # anton bungee cinzel cormorant(700 italic) lilita limelight orbitron pirata
node -e '/* build specs.json from symbols.json + logo/spin/frame per machine, see drive.cjs */'
node drive.cjs specs.json out     # WebGL render -> out/<machine>/<name>.png
python3 post.py out ../../src/components/slots/art   # Pillow: shadow, glow, trim, WebP
```

`symbols.json` is each symbol's vector art as drawn by `SymbolArt` (the renderer extrudes it or swaps
in a hand-built model). Frames are 440×330 with a 36px ring: the CSS uses them as a 9-slice
`border-image` (slice 36), so corner ornaments never stretch.
