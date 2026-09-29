# Converting the Mixamo fighters

The real fighters are Mixamo characters and animations. Mixamo lets games use them royalty-free but not hand out the raw files, so the converted files live in `assets/fighters/` (git-ignored) and ship only inside the Vercel deploy. Without them, the game uses its own procedural fighters.

1. Put the Mixamo downloads in one folder: `lakan.fbx`, `dalisay.fbx`, `tanod.fbx`, `balut.fbx` and `kapre.fbx` (with skin), and the animations (without skin, keeping Mixamo's file names).
2. Write a job file listing them, like `{ "dir": "/raw/", "maxTexture": 1024, "chars": [{ "id": "lakan", "file": "lakan.fbx" }], "anims": [{ "file": "Fighting Idle.fbx" }] }`, and serve the project root on port 5471 (`python3 -m http.server 5471 --bind 127.0.0.1`).
3. Run `node tools/convert-run.mjs <job.json path> assets/fighters`. This writes one GLB per fighter and `clips.json`, with every animation rebound to standard bone names, rotations only plus the hips scaled to each fighter, and the moment each strike lands.

`src/mocap.mjs` matches clips to moves by name (SLOTS) and time-warps each strike onto its move's active frames.

## The crowd

`tools/crowd.html` (run by `node tools/crowd-run.mjs <job.json> assets/fighters`) takes Mixamo people and crowd animations and bakes each character into still poses:
- sitting and clapping (hands apart, hands together)
- sitting and cheering
- the same three standing

Each pose is thinned with meshoptimizer to about 2,200 triangles and written into `crowd.glb` with `crowd.json`. The job lists characters with their real heights, and poses as `{ id, file, want: open | closed | up }`.

## The stages

`tools/env.html` (run by `node tools/env-run.mjs <job.json> assets/env`) converts Poly Haven glTFs (1k) into small GLBs:
- textures shrunk and stored as JPEG
- heavy meshes thinned to a budget per prop
- sets split into pieces (`id~0`, `id~1`...)

The runner also resizes the scanned surface materials, shrinks the HDR skies to 512 × 256, and writes `env.json`. Everything from Poly Haven is CC0.

1. `node tools/ph-get.mjs model:<id> texture:<id> hdri:<id> ...` fetches the raw assets into `.scratch/ph/`.
2. `python3 tools/env-job.py` writes the job.
3. Then run `env-run.mjs` as above.

The crowd and stage converters thin meshes with meshoptimizer: `npm install --prefix .scratch meshoptimizer`.
