import {MeshAttribute, MeshIndexType} from '@wonderlandengine/api';

const POOL_SIZE = 1280;
const PARTICLES_PER_EMIT = 3;
const EMIT_JITTER = 0.15;
const MAX_LIFE = 2.5;
const INV_MAX_LIFE = 1 / MAX_LIFE;
/* The original draws point sprites; this converts their size to meters for a
 * 40° vertical field of view. */
const SPRITE_TO_WORLD = Math.tan((20 * Math.PI) / 180);

/* Tyre smoke on asphalt and dust kicked up on grass; lighter than the
 * original grey because the Flat pipeline tonemaps. */
const SMOKE_COLOR = [0.78, 0.79, 0.84];
const DUST_COLOR = [0.86, 0.76, 0.58];

const _bl = new Float32Array(3);
const _br = new Float32Array(3);
const _right = new Float32Array(3);
const _up = new Float32Array(3);

/**
 * Smoke and dust trails from the rear wheels. All particles live in one
 * dynamic mesh of camera-facing quads; per-vertex colour carries tint and alpha.
 */
export class SmokeTrails {
    constructor(engine, material) {
        const indices = new Uint16Array(POOL_SIZE * 6);
        for (let i = 0; i < POOL_SIZE; i++) {
            const v = i * 4, o = i * 6;
            indices.set([v, v + 1, v + 2, v, v + 2, v + 3], o);
        }
        this.mesh = engine.meshes.create({
            vertexCount: POOL_SIZE * 4,
            indexData: indices,
            indexType: MeshIndexType.UnsignedShort,
        });
        const uvs = new Float32Array(POOL_SIZE * 8);
        for (let i = 0; i < POOL_SIZE; i++) uvs.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
        this.mesh.attribute(MeshAttribute.TextureCoordinate).set(0, uvs);
        this.posAttr = this.mesh.attribute(MeshAttribute.Position);
        this.colorAttr = this.mesh.attribute(MeshAttribute.Color);
        this.vertexPositions = new Float32Array(POOL_SIZE * 12);
        this.vertexColors = new Float32Array(POOL_SIZE * 16);
        this.posAttr.set(0, this.vertexPositions);
        this.colorAttr.set(0, this.vertexColors);
        this.mesh.update();

        const object = engine.scene.addObject();
        object.name = 'Smoke';
        object.addComponent('mesh', {mesh: this.mesh, material});
        this.object = object;

        this.positions = new Float32Array(POOL_SIZE * 3);
        this.velocities = new Float32Array(POOL_SIZE * 3);
        this.life = new Float32Array(POOL_SIZE);
        this.initialSize = new Float32Array(POOL_SIZE);
        this.color = new Float32Array(POOL_SIZE * 3);
        this.emitIndex = 0;
        this.alive = 0;
    }

    update(dt, vehicle, camera, onRoad) {
        const smoking = vehicle.driftIntensity > 0.7;
        const dusty = !onRoad && Math.abs(vehicle.linearSpeed) > 0.6;
        if (smoking || dusty) {
            const roadY = vehicle.position[1] + 0.05;
            const bl = vehicle.wheelBL ? vehicle.wheelBL.getPositionWorld(_bl) : null;
            const br = vehicle.wheelBR ? vehicle.wheelBR.getPositionWorld(_br) : null;
            const color = smoking && onRoad ? SMOKE_COLOR : DUST_COLOR;
            const count = smoking ? PARTICLES_PER_EMIT : 1;
            for (let i = 0; i < count; i++) {
                if (bl) this.emitAt(bl[0], roadY, bl[2], color);
                if (br) this.emitAt(br[0], roadY, br[2], color);
            }
        }

        if (this.alive === 0) return;

        camera.getRightWorld(_right);
        camera.getUpWorld(_up);
        const damping = 1 - dt;
        const P = this.vertexPositions, C = this.vertexColors;
        let alive = 0;

        for (let i = 0; i < POOL_SIZE; i++) {
            if (this.life[i] <= 0) continue;
            this.life[i] -= dt;
            const v = i * 12, c = i * 16;
            if (this.life[i] <= 0) {
                P.fill(0, v, v + 12);
                C.fill(0, c, c + 16);
                continue;
            }
            alive++;
            const t = 1 - this.life[i] * INV_MAX_LIFE;
            const p = i * 3;
            for (let k = 0; k < 3; k++) {
                this.velocities[p + k] *= damping;
                this.positions[p + k] += this.velocities[p + k] * dt;
            }
            const half = 0.5 * SPRITE_TO_WORLD * this.initialSize[i] * (0.5 + t * 2.5);
            const x = this.positions[p], y = this.positions[p + 1], z = this.positions[p + 2];
            const rx = _right[0] * half, ry = _right[1] * half, rz = _right[2] * half;
            const ux = _up[0] * half, uy = _up[1] * half, uz = _up[2] * half;
            P[v] = x - rx - ux; P[v + 1] = y - ry - uy; P[v + 2] = z - rz - uz;
            P[v + 3] = x + rx - ux; P[v + 4] = y + ry - uy; P[v + 5] = z + rz - uz;
            P[v + 6] = x + rx + ux; P[v + 7] = y + ry + uy; P[v + 8] = z + rz + uz;
            P[v + 9] = x - rx + ux; P[v + 10] = y - ry + uy; P[v + 11] = z - rz + uz;
            const a = (1 - t) * 0.25;
            for (let k = 0; k < 4; k++) {
                C[c + k * 4] = this.color[p];
                C[c + k * 4 + 1] = this.color[p + 1];
                C[c + k * 4 + 2] = this.color[p + 2];
                C[c + k * 4 + 3] = a;
            }
        }

        this.alive = alive;
        this.posAttr.set(0, P);
        this.colorAttr.set(0, C);
        this.mesh.update();
    }

    emitAt(x, y, z, color) {
        const i = this.emitIndex;
        this.emitIndex = (i + 1) % POOL_SIZE;
        const p = i * 3;
        this.positions[p] = x + (Math.random() - 0.5) * EMIT_JITTER;
        this.positions[p + 1] = y + Math.random() * EMIT_JITTER;
        this.positions[p + 2] = z + (Math.random() - 0.5) * EMIT_JITTER;
        this.velocities[p] = (Math.random() - 0.5) * 0.2;
        this.velocities[p + 1] = 0.5 + Math.random() * 0.5;
        this.velocities[p + 2] = (Math.random() - 0.5) * 0.2;
        this.color.set(color, p);
        this.initialSize[i] = 0.5 + Math.random() * 0.5;
        if (this.life[i] <= 0) this.alive++;
        this.life[i] = MAX_LIFE;
    }
}
