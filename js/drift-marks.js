import {MeshAttribute, MeshIndexType} from '@wonderlandengine/api';
import {clamp} from './math.js';

const MAX_SEGMENTS = 4096;
const VERTS_PER_SEGMENT = 6;
const FLOATS_PER_SEGMENT = VERTS_PER_SEGMENT * 3;
const WIDTH = 0.08;
const Y_OFFSET = 0.05;
const MIN_SEGMENT_LENGTH = 0.02;
const INTENSITY_MIN = 0.5;
const INTENSITY_MAX = 2.0;
const INV_INTENSITY_RANGE = 1 / (INTENSITY_MAX - INTENSITY_MIN);

const STORAGE_PREFIX = 'racing.driftMarks.';
const STORAGE_VERSION = 1;
const QUANTIZE = 1000;

const _wheel = new Float32Array(3);

/** One skid mark ribbon behind a wheel, a ring buffer of quads in one mesh. */
class DriftTrail {
    constructor(engine, material) {
        const count = MAX_SEGMENTS * VERTS_PER_SEGMENT;
        const indices = new Uint16Array(count);
        for (let i = 0; i < count; i++) indices[i] = i;
        this.mesh = engine.meshes.create({vertexCount: count, indexData: indices, indexType: MeshIndexType.UnsignedShort});
        this.positions = new Float32Array(MAX_SEGMENTS * FLOATS_PER_SEGMENT);
        this.alphas = new Float32Array(MAX_SEGMENTS);
        this.colors = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) this.colors.fill(1, i * 4, i * 4 + 3);
        this.posAttr = this.mesh.attribute(MeshAttribute.Position);
        this.colorAttr = this.mesh.attribute(MeshAttribute.Color);
        this.posAttr.set(0, this.positions);
        this.colorAttr.set(0, this.colors);
        this.mesh.update();

        const object = engine.scene.addObject();
        object.name = 'Drift Marks';
        object.addComponent('mesh', {mesh: this.mesh, material});

        this.segmentIndex = 0;
        this.segmentCount = 0;
        this.prev = new Float32Array(3);
        this.active = false;
        this.dirty = false;
        this.meshDirty = false;
    }

    track(wheel, groundY, intensity, emit) {
        if (!wheel) return;
        wheel.getPositionWorld(_wheel);
        _wheel[1] = groundY;
        if (emit && this.active) {
            const alpha = clamp((intensity - INTENSITY_MIN) * INV_INTENSITY_RANGE, 0, 1);
            this.writeSegment(this.prev, _wheel, alpha, true);
        }
        this.prev.set(_wheel);
        this.active = emit;
    }

    writeSegment(prev, curr, alpha, live) {
        let dx = curr[0] - prev[0];
        let dz = curr[2] - prev[2];
        const len = Math.hypot(dx, dz);
        if (len < MIN_SEGMENT_LENGTH) return;
        dx /= len;
        dz /= len;
        const sx = dz * WIDTH, sz = -dx * WIDTH;

        const o = this.segmentIndex * FLOATS_PER_SEGMENT;
        const p = this.positions;
        const pLx = prev[0] + sx, pLz = prev[2] + sz;
        const pRx = prev[0] - sx, pRz = prev[2] - sz;
        const cLx = curr[0] + sx, cLz = curr[2] + sz;
        const cRx = curr[0] - sx, cRz = curr[2] - sz;
        const py = prev[1], cy = curr[1];
        p[o] = pLx; p[o + 1] = py; p[o + 2] = pLz;
        p[o + 3] = pRx; p[o + 4] = py; p[o + 5] = pRz;
        p[o + 6] = cLx; p[o + 7] = cy; p[o + 8] = cLz;
        p[o + 9] = pRx; p[o + 10] = py; p[o + 11] = pRz;
        p[o + 12] = cRx; p[o + 13] = cy; p[o + 14] = cRz;
        p[o + 15] = cLx; p[o + 16] = cy; p[o + 17] = cLz;

        this.alphas[this.segmentIndex] = alpha;
        const c = this.segmentIndex * VERTS_PER_SEGMENT * 4;
        for (let i = 0; i < VERTS_PER_SEGMENT; i++) this.colors[c + i * 4 + 3] = alpha;

        if (live) {
            const v = this.segmentIndex * VERTS_PER_SEGMENT;
            this.posAttr.set(v, p.subarray(o, o + FLOATS_PER_SEGMENT));
            this.colorAttr.set(v, this.colors.subarray(c, c + VERTS_PER_SEGMENT * 4));
            this.dirty = true;
            this.meshDirty = true;
        }

        this.segmentIndex = (this.segmentIndex + 1) % MAX_SEGMENTS;
        if (this.segmentCount < MAX_SEGMENTS) this.segmentCount++;
    }

    flush() {
        if (!this.meshDirty) return;
        this.mesh.update();
        this.meshDirty = false;
    }

    serialize() {
        const segCount = this.segmentCount;
        if (segCount === 0) return [];
        const start = segCount < MAX_SEGMENTS ? 0 : this.segmentIndex;
        const p = this.positions;
        const strokes = [];
        let stroke = null;
        let lastX = 0, lastY = 0, lastZ = 0;
        let havePrev = false;

        for (let i = 0; i < segCount; i++) {
            const slot = (start + i) % MAX_SEGMENTS;
            const o = slot * FLOATS_PER_SEGMENT;
            /* The midpoints of the quad's edges are the wheel positions. */
            const px = Math.round((p[o] + p[o + 3]) * 0.5 * QUANTIZE);
            const py = Math.round((p[o + 1] + p[o + 4]) * 0.5 * QUANTIZE);
            const pz = Math.round((p[o + 2] + p[o + 5]) * 0.5 * QUANTIZE);
            const cx = Math.round((p[o + 6] + p[o + 12]) * 0.5 * QUANTIZE);
            const cy = Math.round((p[o + 7] + p[o + 13]) * 0.5 * QUANTIZE);
            const cz = Math.round((p[o + 8] + p[o + 14]) * 0.5 * QUANTIZE);
            const aByte = Math.round(this.alphas[slot] * 255);
            const continued = havePrev && px === lastX && py === lastY && pz === lastZ;
            if (!continued) {
                stroke = {a: [px, py, pz], d: [], i: []};
                strokes.push(stroke);
                stroke.d.push(cx - px, cy - py, cz - pz);
            } else {
                stroke.d.push(cx - lastX, cy - lastY, cz - lastZ);
            }
            stroke.i.push(aByte);
            lastX = cx;
            lastY = cy;
            lastZ = cz;
            havePrev = true;
        }
        return strokes;
    }

    load(strokes) {
        const prev = new Float32Array(3);
        const curr = new Float32Array(3);
        for (const s of strokes) {
            let x = s.a[0], y = s.a[1], z = s.a[2];
            prev.set([x / QUANTIZE, y / QUANTIZE, z / QUANTIZE]);
            for (let n = 0; n < s.i.length; n++) {
                x += s.d[n * 3];
                y += s.d[n * 3 + 1];
                z += s.d[n * 3 + 2];
                curr.set([x / QUANTIZE, y / QUANTIZE, z / QUANTIZE]);
                this.writeSegment(prev, curr, s.i[n] / 255, false);
                prev.set(curr);
            }
        }
        this.posAttr.set(0, this.positions);
        this.colorAttr.set(0, this.colors);
        this.mesh.update();
    }
}

/** Skid marks of both rear wheels, kept per track in localStorage. */
export class DriftMarks {
    constructor(engine, material, trackId) {
        this.trails = [new DriftTrail(engine, material), new DriftTrail(engine, material)];
        this.storageKey = STORAGE_PREFIX + (trackId || 'default');
        this.load();
        window.addEventListener('pagehide', () => this.save());
    }

    update(dt, vehicle) {
        const emit = vehicle.driftIntensity > 0.5 && Math.abs(vehicle.linearSpeed) > 0.15;
        if (!emit && !this.trails[0].active && !this.trails[1].active) return;
        const groundY = vehicle.position[1] + Y_OFFSET;
        this.trails[0].track(vehicle.wheelBL, groundY, vehicle.driftIntensity, emit);
        this.trails[1].track(vehicle.wheelBR, groundY, vehicle.driftIntensity, emit);
        for (const trail of this.trails) trail.flush();
    }

    load() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || data.v !== STORAGE_VERSION || !Array.isArray(data.t)) return;
            for (let i = 0; i < this.trails.length; i++) {
                if (Array.isArray(data.t[i])) this.trails[i].load(data.t[i]);
            }
        } catch {
            /* Storage can be unavailable or hold stale data; start without marks. */
        }
    }

    save() {
        if (!this.trails.some((t) => t.dirty)) return;
        try {
            const t = this.trails.map((trail) => trail.serialize());
            if (t.every((s) => s.length === 0)) localStorage.removeItem(this.storageKey);
            else localStorage.setItem(this.storageKey, JSON.stringify({v: STORAGE_VERSION, t}));
            for (const trail of this.trails) trail.dirty = false;
        } catch {
            /* Ignore quota and privacy-mode errors. */
        }
    }
}
