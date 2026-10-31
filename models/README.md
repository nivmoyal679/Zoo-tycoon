# Custom 3D models

Drop realistic `.glb` (binary glTF) models in this folder and the game uses them
instead of the built-in procedural models. No code changes are needed.

| File           | Replaces            |
|----------------|---------------------|
| `lion.glb`     | Lion                |
| `elephant.glb` | Elephant            |
| `zebra.glb`    | Zebra               |
| `keeper.glb`   | Zookeeper           |
| `guest.glb`    | Guests (all of them)|

## How it works

- Models are scaled automatically to the game's size for that animal and placed
  on the ground. They are assumed to face **+Z** (the glTF convention).
- Animations are picked by clip name: a clip whose name contains `walk`, `run`,
  `trot`, `gallop` or `move` plays while the animal moves; one containing `idle`,
  `stand`, `breath` or `rest` plays while it stands still. Rigged (skinned) and
  morph-target animations both work.
- Loading only works when the game is served over **http(s)** (for example
  `python3 -m http.server`), not when `index.html` is opened as a local file.
  Without models the game falls back to its built-in animals.

## Optional `manifest.json`

Override the file name, size or orientation per model:

```json
{
  "lion":     { "file": "african_lion.glb", "height": 0.6, "rotationY": 90 },
  "elephant": { "height": 1.25 },
  "zebra":    { "rotationY": -90 }
}
```

- `height`: total height in tiles (defaults: lion 0.6, elephant 1.2, zebra 0.86,
  people 0.62).
- `rotationY`: degrees to turn the model so it faces its walking direction
  (default 90, which suits models facing +Z).

Only use models you have the rights to use (check each model's licence, for
example CC-BY models need attribution).
