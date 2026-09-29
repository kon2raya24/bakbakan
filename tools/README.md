# Converting the Mixamo fighters

The real fighters are Mixamo characters and animations. Mixamo lets games use them royalty-free but not hand out the raw files, so the converted files live in `assets/fighters/` (git-ignored) and ship only inside the Vercel deploy. Without them, the game uses its own procedural fighters.

1. Put the Mixamo downloads in one folder: `lakan.fbx`, `dalisay.fbx`, `tanod.fbx`, `balut.fbx` and `kapre.fbx` (with skin), and the animations (without skin, keeping Mixamo's file names).
2. Write a job file listing them, like `{ "dir": "/raw/", "maxTexture": 1024, "chars": [{ "id": "lakan", "file": "lakan.fbx" }], "anims": [{ "file": "Fighting Idle.fbx" }] }`, and serve the project root on port 5471 (`python3 -m http.server 5471 --bind 127.0.0.1`).
3. Run `node tools/convert-run.mjs <job.json path> assets/fighters`. This writes one GLB per fighter and `clips.json`, with every animation rebound to standard bone names, rotations only plus the hips scaled to each fighter, and the moment each strike lands.

`src/mocap.mjs` matches clips to moves by name (SLOTS) and time-warps each strike onto its move's active frames.
