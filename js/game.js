import {Component, Property} from '@wonderlandengine/api';
import {updateWorld} from 'crashcat';
import {GameAudio} from './audio.js';
import {Controls} from './controls.js';
import {DriftMarks} from './drift-marks.js';
import {installErrorOverlay} from './error-overlay.js';
import {FollowCamera} from './follow-camera.js';
import {LapTimer} from './lap-timer.js';
import {addGround, buildWallColliders, createPhysicsWorld, createSphereBody} from './physics.js';
import {SmokeTrails} from './smoke.js';
import {TrackBuilder, setActiveRecursive} from './track.js';
import {CELL_SIZE, TRACK_CELLS, computeSpawnPosition, computeTrackBounds, decodeCells} from './track-data.js';
import {TrackEditor} from './track-editor.js';
import {MAX_SPEED, Vehicle} from './vehicle.js';
import {rotateVec} from './math.js';

const LINK_CSS = `
    .corner-link { position: absolute; color: #1f2430; font: 400 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-decoration: none; background: rgba(255,255,255,0.92); padding: 9px 18px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 4px 14px rgba(0,0,0,0.18); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 20; transition: background 0.15s; }
    .corner-link:hover { background: #fff; }
    #editor-link { bottom: 12px; right: 12px; }
`;

const _forward = new Float32Array(3);
const _lead = new Float32Array(3);
const Z = [0, 0, 1];

/**
 * Owns the game loop, in the original's order: input, physics step, vehicle,
 * camera, effects, audio, lap timer. With `?edit` in the URL it runs the
 * track editor instead.
 */
export class Game extends Component {
    static TypeName = 'game';
    static Properties = {
        camera: Property.object(),
        vehicle: Property.object(),
        templates: Property.object(),
        track: Property.object(),
        sun: Property.object(),
        smokeMaterial: Property.material(),
        skidMaterial: Property.material(),
        ghostMaterial: Property.material(),
        gridMaterial: Property.material(),
    };

    start() {
        installErrorOverlay();
        const params = new URLSearchParams(window.location.search);
        const mapParam = params.get('map');
        this.engine.scene.reserveObjects(2000, {mesh: 2000});
        this.builder = new TrackBuilder(this.templates, this.track);
        this.view = this.camera.getComponent('view');

        if (params.has('edit')) {
            setActiveRecursive(this.vehicle, false);
            const light = this.sun && this.sun.getComponent('light');
            if (light) light.shadowRange = 100;
            this.editor = new TrackEditor(this, this.builder, mapParam);
            setActiveRecursive(this.templates, false);
            return;
        }
        this.startGame(mapParam);
    }

    startGame(mapParam) {
        let customCells = null;
        let spawn = computeSpawnPosition(TRACK_CELLS);
        if (mapParam) {
            try {
                customCells = decodeCells(mapParam);
                spawn = computeSpawnPosition(customCells);
            } catch {
                customCells = null;
                console.warn('Invalid map parameter, using default track');
            }
        }
        this.roadCells = new Set((customCells || TRACK_CELLS).map((c) => c[0] + ',' + c[1]));

        const bounds = computeTrackBounds(customCells);
        const groundSize = Math.max(bounds.halfWidth, bounds.halfDepth) * 2 + 20;

        this.builder.build(customCells);
        setActiveRecursive(this.templates, false);

        const world = createPhysicsWorld();
        buildWallColliders(world, customCells);
        addGround(world, bounds.centerX, bounds.centerZ, groundSize / 2);
        const sphereBody = createSphereBody(world, spawn.position);
        this.world = world;

        const vehicle = new Vehicle(this.vehicle);
        vehicle.rigidBody = sphereBody;
        vehicle.physicsWorld = world;
        vehicle.setSpawn(spawn);
        this.vehicleState = vehicle;

        this.followCamera = new FollowCamera(this.camera, this.view);
        this.controls = new Controls();
        this.smoke = new SmokeTrails(this.engine, this.smokeMaterial);
        this.driftMarks = new DriftMarks(this.engine, this.skidMaterial, mapParam);
        this.audio = new GameAudio();
        this.audio.init();
        this.lapTimer = new LapTimer(customCells, mapParam);

        this.contactListener = {
            onContactAdded: (bodyA, bodyB) => {
                if (bodyA !== sphereBody && bodyB !== sphereBody) return;
                rotateVec(_forward, vehicle.quat, Z);
                _forward[1] = 0;
                const l = Math.hypot(_forward[0], _forward[2]) || 1;
                const mv = vehicle.modelVelocity;
                this.audio.playImpact(Math.abs((mv[0] * _forward[0] + mv[2] * _forward[2]) / l));
            },
        };

        this.addEditorLink(mapParam);
        this.running = true;
    }

    addEditorLink(mapParam) {
        const style = document.createElement('style');
        style.textContent = LINK_CSS;
        document.head.appendChild(style);
        const link = document.createElement('a');
        link.id = 'editor-link';
        link.className = 'corner-link';
        link.href = '?edit' + (mapParam ? '&map=' + mapParam : '');
        link.textContent = mapParam ? 'Edit this track' : 'Create new track';
        document.body.appendChild(link);
    }

    update(dt) {
        if (!this.running) return;
        dt = Math.min(dt, 1 / 30);
        const canvas = this.engine.canvas;
        this.followCamera.updateFov(canvas.clientWidth / Math.max(1, canvas.clientHeight));

        const input = this.controls.update();
        updateWorld(this.world, this.contactListener, dt);
        const vehicle = this.vehicleState;
        vehicle.update(dt, input);

        const mv = vehicle.modelVelocity;
        rotateVec(_lead, vehicle.quat, Z);
        const speed = Math.hypot(mv[0], mv[2]);
        for (let i = 0; i < 3; i++) _lead[i] *= speed;
        this.followCamera.update(dt, vehicle.spherePos, _lead);

        const p = vehicle.spherePos;
        const onRoad = this.roadCells.has(Math.floor(p[0] / CELL_SIZE) + ',' + Math.floor(p[2] / CELL_SIZE));
        this.smoke.update(dt, vehicle, this.camera, onRoad);
        this.driftMarks.update(dt, vehicle);
        this.audio.update(dt, vehicle.linearSpeed / MAX_SPEED, input.z, vehicle.driftIntensity, this.camera, vehicle.position);

        const hasInput = input.touchActive || Math.abs(input.x) > 0.05 || Math.abs(input.z) > 0.05;
        this.lapTimer.update(dt, vehicle.spherePos, hasInput);
    }
}
