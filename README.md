# Starter Kit Racing for Wonderland Engine

An arcade racer on a tile-based track, with a track editor that stores the track
in the URL. A port of [Starter Kit Racing](https://github.com/mrdoob/Starter-Kit-Racing)
by mrdoob (three.js), itself based on
[Kenney's Starter Kit Racing](https://github.com/KenneyNL/Starter-Kit-Racing) for Godot,
to [Wonderland Engine](https://wonderlandengine.com) 1.6.

Play it: https://starter-kit-racing-wle-145969.cloud.wonderland.dev

See [PORTING.md](PORTING.md) for how the original maps onto Wonderland Engine.

## Controls

| Input | Action |
| --- | --- |
| W / Up, S / Down | Accelerate, brake and reverse |
| A / Left, D / Right | Steer |
| Gamepad | Left stick steers, right trigger accelerates, left trigger brakes |
| Touch | Drag anywhere: the car drives towards the joystick direction |

A lap counts when you cross the finish line after driving over every road tile.
Best times and skid marks are kept per track in the browser.

## Track editor

Open the page with `?edit` (or use "Create new track" / "Edit this track").

- **Road (1):** click or drag to draw road; straights and corners are picked
  from the neighbours. Click the finish tile to flip its direction.
- **Erase (2)** or right mouse button: remove road.
- **View (3)**, middle mouse button, space or ctrl + drag, two fingers or the
  trackpad: pan. Ctrl + wheel or pinch: zoom.
- **Play** opens the track in a new tab as `?map=<encoded track>`; share that URL.

## Running

1. Install [Wonderland Editor](https://wonderlandengine.com/downloads/) 1.6.
2. `npm install`
3. Open `StarterKitRacing.wlp` in the editor and start the preview
   (the project serves on port 8082).

The sky environment is baked by an editor with a window during packaging; the
result is kept in `cache/starter-kit-racing/` so windowless packaging works too.

## Credits

- Game design, models, sprite and skid sound: [Kenney](https://kenney.nl)
  (assets CC0, code MIT).
- three.js version, engine and impact synthesis: mrdoob (MIT).
- Physics: [crashcat](https://github.com/isaac-mason/crashcat) by Isaac Mason (MIT).

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [LICENSE](LICENSE).
