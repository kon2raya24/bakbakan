# Bakbakan sa Kanto

A street fighting game, Pinoy style, in 3D. Two fighters on a Filipino street: the jeepney terminal in Cubao, a barangay covered court at night, the palengke in Divisoria, and, at the end of the arcade ladder, the balete tree where the Kapre lives.

**Play:** https://bakbakan.vercel.app

## The fighters

| | Style | |
| --- | --- | --- |
| **Lakan**, ang Arnisador (Batangas) | Arnis | Balanced: twin baston, the Sinawali rush, the Pasok uppercut, and a thrown stick |
| **Dalisay**, ang Sikaran (Baras, Rizal) | Sikaran | Fast kicks, no projectile: the flying Sikad, Lipad na Sipa, and the spinning Ikot |
| **Mang Tanod**, ang Bantay ng Barangay (Tondo) | Batuta at flashlight | Slow and tough: a flashlight beam, a whistle that clears the air, and an overhead batuta |
| **Boy Balut**, ang Magbabalut (Pateros) | Diskarte sa kalye | Tricky: lobbed balut, a spinning basket, and a low slide |
| **The Kapre**, ang Higante ng Balete | Lakas ng gubat | The boss: huge, slow, smoke from his tabako, and a grab you can't break |

The Kapre is the last fight in Arcade. Beat him once and you can pick him in Arcade too; he's always there in Versus and Training.

## How to fight

- **Guard** by holding away from your opponent. Crouch to guard **lows** (sweeps, slides); stand to guard **overheads** and jump-ins.
- **Specials:** a motion and then special, like ↓↘→ S or →↓↘ S. Or the easy way: S alone, ↓ + S, or ← + S.
- **Combos:** a light can chain into another light or a heavy, and a normal that connects (hit or guarded) can cancel into a special. Later hits in a combo do less damage.
- **Throws:** light + heavy up close. Press them back straight away to break a throw.
- **Super:** fill the bar by fighting, then heavy + special. Only a super can finish a guarding opponent.
- **Rounds:** 99 seconds, best of three. Counter hits (catching someone starting an attack) hurt more.

### Controls

| | |
| --- | --- |
| Player 1 | **A**/**D** walk (back guards) · **W** jump · **S** crouch · **J** light · **K** heavy · **L** special · **I** throw · **U** super |
| Player 2 | **arrows** · **1** light · **2** heavy · **3** special · **4** throw · **5** super (number row or numpad) |
| Controller | Any gamepad, PlayStation included: stick or d-pad · **□** light · **△** heavy · **○**/**✕** special · **L1** throw · **R1** super · **Options** pause. Two controllers for two players. |
| Phone | The pad on the left; **L**, **H**, **S**, **HAGIS** (throw) and **SUPER** on the right |

**Modes:** Arcade (four fights, the Kapre last, with a score), Versus (against a friend on one keyboard or two controllers, or against the CPU), and Ensayo, or Training (a dummy that stands, crouches, jumps, guards or fights back; hitboxes with **B**; an always-full super bar).

**CPU:** Madali, Katamtaman or Mahirap. The CPU reacts to what it sees a few frames late (about a third of a second on Madali, a tenth on Mahirap). It guards, anti-airs jump-ins, punishes whiffs, breaks throws and confirms its combos, all more often the harder it gets. It uses the same inputs a player has, and it never reads your buttons.

## How it's made

- **The rules:** `src/fight.mjs` is a frame-exact fighting engine at 60 frames a second, with no DOM and no randomness. It covers:
  - hurtboxes and hitboxes (scaled to each fighter's build), pushboxes and walls
  - startup, active and recovery frames, hitstun and blockstun, and hit-freeze
  - high, mid and low guards, chains, special and super cancels, and counter hits
  - throws and breaking them, projectiles that trade, juggles with a limit, and knockdowns with a moment of safety on waking
  - combo scaling, chip damage, the super meter, the round clock, and best-of-three rounds
- **The fighters:** `src/roster.mjs` holds every fighter as data, including every move's frame data.
- **The CPU:** `src/ai.mjs` holds the CPU, with its reaction delay and its plans.
- **The 3D:** `src/view3d.mjs` is [three.js](https://threejs.org), bundled into `src/vendor/` so the game works offline.
  - The fighters are blocks on a jointed rig (hips, spine, shoulders, elbows, knees), posed every frame from the fight state. Each move has a wind-up, a strike and a return.
  - No model or image files: the faces, signs and walls are small canvas textures painted pixel by pixel.
- **Sound:** all synthesized with Web Audio, including a little loop for each stage.

Tests (Node 20+): `node --test test/*.test.mjs`.
- The engine: hits, the three guards, chains and cancels, motions and shortcuts, projectiles, throws and breaking them, knockdowns, the juggle limit, counter hits, chip, the super, walls, rounds, time-up, and exact replays.
- CPU against CPU: the harder level beats the easier one, fights end by KO with guarding and specials, and every fighter wins between a quarter and three quarters of their matchups.
- The offline cache.

Made by [Lemmuel Turaya](https://kon2raya.netlify.app). three.js is MIT licensed (`src/vendor/THREE-LICENSE`).

## License

MIT
