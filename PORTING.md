# Porting plan

This project ports [Starter Kit Racing](https://github.com/mrdoob/Starter-Kit-Racing)
by mrdoob (MIT), itself a three.js port of
[Kenney's Starter Kit Racing](https://github.com/KenneyNL/Starter-Kit-Racing) for Godot
(MIT code, CC0 assets), to Wonderland Engine 1.6.

## What the original is

- Plain JavaScript, three.js r185, no build step, about 4,500 lines including the
  track editor page.
- **Track:** a GridMap of 7.49 m cells (Kenney's 9.99 units, scaled by 0.75). Every
  cell holds one of four road pieces (`track-straight`, `track-corner`, `track-bump`,
  `track-finish`) in one of four orientations. The default track is a list in
  `Track.js`; around it the game fills an "empty" grass ring with a few tents and a
  forest ring further out, plus three parked trucks.
- **URL-encoded tracks:** `?map=<base64url>` holds three bytes per cell
  (x + 128, z + 128, type << 2 | orientation).
- **Track editor** (`editor.html`): a top-down orthographic view; draw roads with the
  mouse or a finger, auto-tiling picks straight or corner pieces from the neighbours,
  a ghost preview shows the piece and its changed neighbours before placing, the
  finish tile flips when clicked. Pan with the middle mouse button, space or ctrl +
  drag, the pan tool, two fingers or the trackpad; zoom with pinch or ctrl + wheel.
  The track is stored in `localStorage` and "Play" opens the game with `?map=`.
- **Physics** with [crashcat](https://github.com/isaac-mason/crashcat) (MIT): the car
  is a 0.5 m sphere rolled by setting its angular velocity; the visual truck follows
  the sphere. Road walls are static boxes (corner arcs as box segments), the ground
  is one large static box.
- **Vehicle:** arcade steering and throttle, body pitch and roll, wheel spin and
  steer, drift intensity that drives smoke, skid marks and the skid sound.
- **Camera:** fixed 45° azimuth / 35° elevation follow camera with velocity lead
  and a dead-zone circle.
- **Input:** keyboard (WASD, arrows), gamepad (left stick, triggers), touch joystick
  that steers towards a world direction with automatic throttle.
- **Effects:** smoke trails from the rear wheels (point sprites), skid marks that
  persist per track in `localStorage`, light probe grid, bloom.
- **Audio:** synthesized engine (AudioWorklet), synthesized impacts, skid sample,
  positional sources and an outdoor reverb.
- **Lap timer:** DOM overlay with lap, current, last and best time (best per track
  in `localStorage`); a lap counts when every road cell was visited.

## Mapping to Wonderland Engine

| Original | Wonderland Engine |
| --- | --- |
| GLB models loaded at runtime | Imported once into the project in the editor; one template object per model under a `Templates` root |
| `buildTrack()` creating meshes and instanced decorations | `js/track.js`: clones the templates at runtime into a `Track` root (scale 0.75, y = -0.5), for the default track and for `?map=` tracks alike. Templates are switched off afterwards |
| crashcat physics (`Physics.js`) | Kept: crashcat 0.0.3 as an npm dependency, bundled by the editor's esbuild. PhysX stays off: the handling depends on crashcat's sphere friction and damping, which PhysX would need retuning for |
| `Vehicle.js` (three.js Object3D) | `js/vehicle.js`: same model, drives a container object and the `body` and `wheel-*` child objects of the imported truck |
| `Camera.js` (PerspectiveCamera, vertical fov 40°) | `js/follow-camera.js` on the object with the `view` component; the horizontal fov is computed from the aspect ratio to keep the vertical 40° |
| `Controls.js` | `js/controls.js`, unchanged logic (keyboard, gamepad, touch joystick DOM) |
| `Particles.js` (Points with custom shader) | `js/smoke.js`: one dynamic mesh of camera-facing quads with vertex alpha, drawn with a transparent Flat pipeline with vertex colours |
| `DriftMarks.js` | `js/drift-marks.js`: same ring buffer and storage format, as a dynamic mesh |
| `Audio.js`, `EngineWorklet.js`, `ImpactSound.js` | `js/audio.js` on the raw Web Audio API (PannerNode per source, listener on the camera); the worklet file is served from `static/` |
| `LapTimer.js` | `js/lap-timer.js`, same DOM overlay |
| `editor.html` | Same app in editor mode (`?edit`, optionally with `&map=`): `js/track-editor.js` with an orthographic top-down view, the same auto-tiling, ghost preview, tools and toolbar |
| `main.js` loop | `js/game.js`: one component that owns the update order (input, physics step, vehicle, camera, effects, audio, lap timer) |
| Hemisphere + directional light, fog, light probe grid, weak bloom | Atmospheric sky, image-based environment lighting baked from the sky, a low late-afternoon sun with cascaded PCF shadows, ACES tonemapping, bloom, SSAO, a large ground plane to the horizon |

## Visual upgrade

- Kenney materials imported as PBR (Physical), roughness tuned per material.
- Sky: AtmosphericSky material, also used for the environment bake.
- Sun: about 30° above the horizon, from the original light's azimuth, with
  `shadowRange` fitted to the follow camera's view.
- Tonemapping ACES, bloom with a threshold above 1, SSAO.
- Tyre smoke and dust from the rear wheels while drifting, skid marks.
- No GI probe volume: the scene is outdoors, the track changes at runtime with
  `?map=`, so a static bake would not match custom tracks.

## Not ported or changed

- The light probe grid helper and the camera dead-zone debug circle (debug only).
- The GitHub corner link.
