import {MeshAttribute, MeshIndexType, ProjectionType} from '@wonderlandengine/api';
import {CELL_SIZE, ORIENT_DEG, decodeCells, encodeCells} from './track-data.js';
import {setActiveRecursive} from './track.js';

/* Auto-tiling. Exit bitmask: N = 8, S = 4, E = 2, W = 1.
 * Corner connectivity: 0° = S+W, 90° = S+E, 180° = N+E, 270° = N+W. */
const ORIENT_FLIP = {0: 10, 10: 0, 16: 22, 22: 16};
const AUTOTILE = [
    ['track-straight', 0], // 0: isolated
    ['track-straight', 16], // 1: W
    ['track-straight', 16], // 2: E
    ['track-straight', 16], // 3: E+W
    ['track-straight', 0], // 4: S
    ['track-corner', 0], // 5: S+W
    ['track-corner', 16], // 6: S+E
    ['track-straight', 16], // 7: S+E+W
    ['track-straight', 0], // 8: N
    ['track-corner', 22], // 9: N+W
    ['track-corner', 10], // 10: N+E
    ['track-straight', 16], // 11: N+E+W
    ['track-straight', 0], // 12: N+S
    ['track-straight', 0], // 13: N+S+W
    ['track-straight', 0], // 14: N+S+E
    ['track-straight', 0], // 15: N+S+E+W
];
const DIR_INFO = [
    {bit: 8, dx: 0, dz: -1},
    {bit: 4, dx: 0, dz: 1},
    {bit: 2, dx: 1, dz: 0},
    {bit: 1, dx: -1, dz: 0},
];

const STORAGE_KEY = 'racing-editor-cells';
const FRUSTUM = 30;
const CAMERA_HEIGHT = 25;
const GRID_CELLS = 30;

const ICONS = {
    pan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
    road: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    erase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
};

const CSS = `
    #toolbar { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: rgba(255,255,255,0.92); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-radius: 999px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 10px 30px rgba(0,0,0,0.18); z-index: 10; }
    #toolbar button { padding: 9px; border: none; border-radius: 999px; background: transparent; color: #4a5260; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
    #toolbar button svg { width: 20px; height: 20px; display: block; }
    #toolbar button:hover { background: rgba(0,0,0,0.05); color: #1f2430; }
    #toolbar button.active { background: #1f2430; color: #fff; box-shadow: 0 2px 6px rgba(31,36,48,0.25); }
    #toolbar .separator { width: 1px; height: 24px; background: rgba(0,0,0,0.1); margin: 0 2px; flex-shrink: 0; }
    #toolbar button.action { background: #4caf6a; color: #fff; box-shadow: 0 2px 6px rgba(76,175,106,0.3); }
    #toolbar button.action:hover { background: #3f9a5a; color: #fff; }
    #toolbar button.danger { color: #b3603a; }
    #toolbar button.danger:hover { background: rgba(220,100,60,0.12); color: #a64b25; }
    #toast { position: absolute; bottom: 90px; left: 50%; transform: translateX(-50%); padding: 10px 24px; background: rgba(255,255,255,0.95); color: #1f2430; border-radius: 999px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 6px 20px rgba(0,0,0,0.15); font: 400 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 20; }
    #toast.show { opacity: 1; }
`;

const cellKey = (gx, gz) => gx + ',' + gz;
const bitCount = (m) => ((m >> 3) & 1) + ((m >> 2) & 1) + ((m >> 1) & 1) + (m & 1);

/** Exits of a placed piece as a bitmask. */
function getCellExits(cell) {
    const o = cell.orient;
    if (cell.type === 'track-corner') {
        if (o === 0) return 5;
        if (o === 16) return 6;
        if (o === 10) return 10;
        if (o === 22) return 9;
    }
    return o === 0 || o === 10 ? 12 : 3;
}

/**
 * Top-down track editor: draw roads on the grid, auto-tiled into straights
 * and corners, with a ghost preview of the piece and its changed neighbours.
 */
export class TrackEditor {
    constructor(game, builder, mapParam) {
        this.game = game;
        this.engine = game.engine;
        this.builder = builder;
        this.grid = new Map();
        this.tool = 'road';
        this.ghostObjects = [];
        this.ghostHidden = [];

        const ghostRoot = this.engine.scene.addObject();
        ghostRoot.name = 'Ghost';
        ghostRoot.setPositionLocal([0, -0.5, 0]);
        ghostRoot.setScalingLocal([0.75, 0.75, 0.75]);
        this.ghostRoot = ghostRoot;
        this.ghostMaterials = {0.4: game.ghostMaterial, 0.7: game.ghostMaterial.clone()};
        this.ghostMaterials[0.4].setColor([1, 1, 1, 0.4]);
        this.ghostMaterials[0.7].setColor([1, 1, 1, 0.7]);

        this.view = game.camera.getComponent('view');
        this.view.projectionType = ProjectionType.Orthographic;
        this.view.near = 0.1;
        this.view.far = 200;
        game.camera.setRotationWorld([-0.7071068, 0, 0, 0.7071068]);
        this.zoom = 1;
        this.buildGrid(game.gridMaterial);

        this.buildUI();
        const cellCenter = 0.5 * CELL_SIZE;
        this.camOffsetZ = this.computeCamOffsetZ();
        this.camTarget = [cellCenter, 0, cellCenter + this.camOffsetZ];
        this.updateCamera();

        this.loadSaved(mapParam);
        if (this.grid.size === 0) this.placeFinish();
        this.setupInput();
    }

    buildGrid(material) {
        if (!material) return;
        const size = GRID_CELLS * CELL_SIZE;
        const half = size / 2;
        const w = 0.04;
        const lines = GRID_CELLS + 1;
        const quads = lines * 2;
        const positions = new Float32Array(quads * 12);
        let o = 0;
        for (let i = 0; i < lines; i++) {
            const c = -half + i * CELL_SIZE;
            positions.set([c - w, 0, -half, c + w, 0, -half, c + w, 0, half, c - w, 0, half], o);
            o += 12;
            positions.set([-half, 0, c - w, -half, 0, c + w, half, 0, c + w, half, 0, c - w], o);
            o += 12;
        }
        const indices = new Uint16Array(quads * 6);
        for (let i = 0; i < quads; i++) indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
        const mesh = this.engine.meshes.create({vertexCount: quads * 4, indexData: indices, indexType: MeshIndexType.UnsignedShort});
        mesh.attribute(MeshAttribute.Position).set(0, positions);
        mesh.attribute(MeshAttribute.Color).set(0, new Float32Array(quads * 16).fill(1));
        mesh.update();
        const object = this.engine.scene.addObject();
        object.name = 'Grid';
        object.setPositionLocal([0, -0.13, 0]);
        object.addComponent('mesh', {mesh, material});
    }

    buildUI() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);
        const bar = document.createElement('div');
        bar.id = 'toolbar';
        const button = (id, icon, title, cls = '') =>
            `<button id="${id}" class="${cls}" title="${title}" aria-label="${title.replace(/ \(\d\)$/, '')}">${ICONS[icon]}</button>`;
        bar.innerHTML =
            button('btn-pan', 'pan', 'View (3)') +
            button('btn-road', 'road', 'Road (1)', 'active') +
            button('btn-erase', 'erase', 'Erase (2)') +
            '<div class="separator"></div>' +
            button('btn-play', 'play', 'Play track', 'action') +
            '<div class="separator"></div>' +
            button('btn-clear', 'clear', 'Clear track', 'danger');
        document.body.appendChild(bar);
        const toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);
        this.toolbar = bar;
        this.toast = toast;

        this.btnRoad = bar.querySelector('#btn-road');
        this.btnErase = bar.querySelector('#btn-erase');
        this.btnPan = bar.querySelector('#btn-pan');
        this.btnRoad.addEventListener('click', () => this.selectTool('road'));
        this.btnErase.addEventListener('click', () => this.selectTool('erase'));
        this.btnPan.addEventListener('click', () => this.selectTool('pan'));
        bar.addEventListener('pointerenter', () => this.clearGhost());

        bar.querySelector('#btn-play').addEventListener('click', () => {
            if (this.grid.size === 0) {
                this.showToast('Draw some road first!');
                return;
            }
            window.open(location.pathname + '?map=' + encodeCells(this.getCellsArray()), '_blank');
        });
        bar.querySelector('#btn-clear').addEventListener('click', () => {
            if (!confirm('Clear the entire track?')) return;
            this.clearAll();
            this.showToast('Track cleared');
        });
    }

    showToast(msg) {
        this.toast.textContent = msg;
        this.toast.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => this.toast.classList.remove('show'), 2000);
    }

    selectTool(t) {
        this.tool = t;
        this.btnRoad.classList.toggle('active', t === 'road');
        this.btnErase.classList.toggle('active', t === 'erase');
        this.btnPan.classList.toggle('active', t === 'pan');
        if (t === 'pan') this.clearGhost();
        this.updateCursor();
    }

    /* Shift the view so the start cell sits in the middle of the area above the toolbar. */
    computeCamOffsetZ() {
        const rect = this.toolbar.getBoundingClientRect();
        const h = window.innerHeight;
        const pad = h - rect.bottom;
        const reserved = h - rect.top + pad;
        return (reserved / h) * FRUSTUM;
    }

    viewSize() {
        const canvas = this.engine.canvas;
        const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
        const height = (FRUSTUM * 2) / this.zoom;
        return {width: height * aspect, height};
    }

    updateCamera() {
        this.view.extent = this.viewSize().width;
        this.game.camera.setPositionWorld([this.camTarget[0], CAMERA_HEIGHT, this.camTarget[2]]);
    }

    onResize() {
        const offset = this.computeCamOffsetZ();
        this.camTarget[2] += offset - this.camOffsetZ;
        this.camOffsetZ = offset;
        this.updateCamera();
    }

    screenToGrid(clientX, clientY) {
        const rect = this.engine.canvas.getBoundingClientRect();
        const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
        const {width, height} = this.viewSize();
        const x = this.camTarget[0] + (nx * width) / 2;
        const z = this.camTarget[2] - (ny * height) / 2;
        return {gx: Math.floor(x / CELL_SIZE), gz: Math.floor(z / CELL_SIZE)};
    }

    /* ---- Auto-tiling ---- */

    getConnectivityMask(gx, gz) {
        let mask = 0;
        const n = this.grid.get(cellKey(gx, gz - 1));
        if (n && getCellExits(n) & 4) mask |= 8;
        const s = this.grid.get(cellKey(gx, gz + 1));
        if (s && getCellExits(s) & 8) mask |= 4;
        const e = this.grid.get(cellKey(gx + 1, gz));
        if (e && getCellExits(e) & 1) mask |= 2;
        const w = this.grid.get(cellKey(gx - 1, gz));
        if (w && getCellExits(w) & 2) mask |= 1;
        return mask;
    }

    getPresenceMask(gx, gz) {
        let mask = 0;
        if (this.grid.has(cellKey(gx, gz - 1))) mask |= 8;
        if (this.grid.has(cellKey(gx, gz + 1))) mask |= 4;
        if (this.grid.has(cellKey(gx + 1, gz))) mask |= 2;
        if (this.grid.has(cellKey(gx - 1, gz))) mask |= 1;
        return mask;
    }

    connectedExitCount(gx, gz) {
        const cell = this.grid.get(cellKey(gx, gz));
        if (!cell) return 0;
        return bitCount(getCellExits(cell) & this.getConnectivityMask(gx, gz));
    }

    /* With three or more neighbours, prefer corners, then the neighbours with more connections. */
    pickBestPair(mask, gx, gz) {
        const active = DIR_INFO.filter((d) => mask & d.bit);
        if (active.length <= 2) return mask;
        let bestMask = active[0].bit | active[1].bit;
        let bestScore = -1;
        let bestIsCorner = false;
        for (let i = 0; i < active.length; i++) {
            for (let j = i + 1; j < active.length; j++) {
                const pairMask = active[i].bit | active[j].bit;
                const isCorner = pairMask !== 3 && pairMask !== 12;
                const score =
                    this.connectedExitCount(gx + active[i].dx, gz + active[i].dz) +
                    this.connectedExitCount(gx + active[j].dx, gz + active[j].dz);
                if ((isCorner && !bestIsCorner) || (isCorner === bestIsCorner && score > bestScore)) {
                    bestMask = pairMask;
                    bestScore = score;
                    bestIsCorner = isCorner;
                }
            }
        }
        return bestMask;
    }

    /* Neighbours that can connect: they exit towards us, or have a free exit. */
    getAvailableMask(gx, gz) {
        let mask = 0;
        const dirs = [
            [0, -1, 8, 4],
            [0, 1, 4, 8],
            [1, 0, 2, 1],
            [-1, 0, 1, 2],
        ];
        for (const [dx, dz, bit, oppBit] of dirs) {
            const neighbor = this.grid.get(cellKey(gx + dx, gz + dz));
            if (!neighbor) continue;
            const exits = getCellExits(neighbor);
            if (exits & oppBit) {
                mask |= bit;
                continue;
            }
            if (bitCount(exits & this.getConnectivityMask(gx + dx, gz + dz)) < 2) mask |= bit;
        }
        return mask;
    }

    resolveNewTile(gx, gz) {
        const pMask = this.getAvailableMask(gx, gz);
        if (bitCount(pMask) >= 3) return AUTOTILE[this.pickBestPair(pMask, gx, gz)];
        return AUTOTILE[pMask];
    }

    resolveTile(gx, gz) {
        const cMask = this.getConnectivityMask(gx, gz);
        if (cMask !== 0) return AUTOTILE[cMask];
        /* Nothing connects towards us: run parallel to an adjacent road. */
        const pMask = this.getPresenceMask(gx, gz);
        if (pMask !== 0) {
            for (const [dx, dz, bit] of [[0, -1, 8], [0, 1, 4], [1, 0, 2], [-1, 0, 1]]) {
                if (!(pMask & bit)) continue;
                const neighbor = this.grid.get(cellKey(gx + dx, gz + dz));
                if (!neighbor) continue;
                const exits = getCellExits(neighbor);
                if (exits & 12) return ['track-straight', 0];
                if (exits & 3) return ['track-straight', 16];
            }
        }
        return AUTOTILE[0];
    }

    placeMesh(gx, gz, cell) {
        if (cell.object) cell.object.destroy();
        cell.object = this.builder.placePiece(cell.type, gx, gz, cell.orient);
    }

    resolveCell(gx, gz) {
        const cell = this.grid.get(cellKey(gx, gz));
        if (!cell) return;
        let baseType, orient;
        if (!cell.object) {
            [baseType, orient] = this.resolveNewTile(gx, gz);
        } else {
            /* Re-resolve an existing cell, but never break a current connection. */
            const currentConnected = getCellExits(cell) & this.getConnectivityMask(gx, gz);
            [baseType, orient] = this.resolveTile(gx, gz);
            const proposed = getCellExits({type: baseType, orient});
            if ((proposed & currentConnected) !== currentConnected) return;
        }
        const type = cell.isFinish && baseType === 'track-straight' ? 'track-finish' : baseType;
        if (cell.type === type && cell.orient === orient && cell.object) return;
        cell.type = type;
        cell.orient = orient;
        this.placeMesh(gx, gz, cell);
    }

    resolveCellAndNeighbors(gx, gz) {
        this.resolveCell(gx, gz);
        this.resolveCell(gx, gz - 1);
        this.resolveCell(gx, gz + 1);
        this.resolveCell(gx + 1, gz);
        this.resolveCell(gx - 1, gz);
    }

    /* ---- Cell operations ---- */

    placeRoad(gx, gz) {
        const key = cellKey(gx, gz);
        const existing = this.grid.get(key);
        if (existing) {
            /* Clicking the finish tile flips its direction. */
            if (existing.isFinish) {
                existing.orient = ORIENT_FLIP[existing.orient] ?? existing.orient;
                this.placeMesh(gx, gz, existing);
                this.save();
            }
            return;
        }
        this.grid.set(key, {type: 'track-straight', orient: 0, isFinish: false, object: null});
        this.resolveCellAndNeighbors(gx, gz);
        this.save();
    }

    placeFinish() {
        const cell = {type: 'track-finish', orient: 0, isFinish: true, object: null};
        this.grid.set(cellKey(0, 0), cell);
        this.placeMesh(0, 0, cell);
    }

    eraseRoad(gx, gz) {
        const key = cellKey(gx, gz);
        const cell = this.grid.get(key);
        if (!cell || cell.isFinish) return;
        if (cell.object) cell.object.destroy();
        this.grid.delete(key);
        this.resolveCell(gx, gz - 1);
        this.resolveCell(gx, gz + 1);
        this.resolveCell(gx + 1, gz);
        this.resolveCell(gx - 1, gz);
        this.save();
    }

    clearAll() {
        for (const cell of this.grid.values()) if (cell.object) cell.object.destroy();
        this.grid.clear();
        this.placeFinish();
        this.save();
    }

    /* ---- Ghost preview ---- */

    addGhostPiece(type, orient, gx, gz, opacity) {
        const piece = this.builder.placePiece(type, gx, gz, orient, this.ghostRoot);
        if (!piece) return;
        const material = this.ghostMaterials[opacity];
        const apply = (o) => {
            for (const m of o.getComponents('mesh')) m.material = material;
            for (const c of o.children) apply(c);
        };
        apply(piece);
        this.ghostObjects.push(piece);
    }

    updateGhost(gx, gz) {
        this.clearGhost();
        if (this.tool !== 'road') return;
        const key = cellKey(gx, gz);
        if (this.grid.has(key)) return;

        /* Insert the ghost cell temporarily so neighbours see its exits. */
        const ghostCell = {type: 'track-straight', orient: 0, isFinish: false, object: null};
        this.grid.set(key, ghostCell);
        const [type, orient] = this.resolveNewTile(gx, gz);
        ghostCell.type = type;
        ghostCell.orient = orient;
        this.addGhostPiece(type, orient, gx, gz, 0.4);

        for (const [nx, nz] of [[gx, gz - 1], [gx, gz + 1], [gx + 1, gz], [gx - 1, gz]]) {
            const nCell = this.grid.get(cellKey(nx, nz));
            if (!nCell) continue;
            const nConnected = getCellExits(nCell) & this.getConnectivityMask(nx, nz);
            const [newType, newOrient] = this.resolveTile(nx, nz);
            if ((getCellExits({type: newType, orient: newOrient}) & nConnected) !== nConnected) continue;
            const finalType = nCell.isFinish && newType === 'track-straight' ? 'track-finish' : newType;
            if (finalType !== nCell.type || newOrient !== nCell.orient) {
                if (nCell.object) {
                    setActiveRecursive(nCell.object, false);
                    this.ghostHidden.push(nCell);
                }
                this.addGhostPiece(finalType, newOrient, nx, nz, 0.7);
            }
        }
        this.grid.delete(key);
    }

    clearGhost() {
        for (const cell of this.ghostHidden) if (cell.object && !cell.object.isDestroyed) setActiveRecursive(cell.object, true);
        this.ghostHidden.length = 0;
        for (const o of this.ghostObjects) o.destroy();
        this.ghostObjects.length = 0;
    }

    /* ---- Persistence ---- */

    getCellsArray() {
        const arr = [];
        for (const [key, cell] of this.grid) {
            const [gx, gz] = key.split(',').map(Number);
            arr.push([gx, gz, cell.type, cell.orient]);
        }
        return arr;
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, encodeCells(this.getCellsArray()));
        } catch {
            /* Storage unavailable: the track still lives in the Play link. */
        }
    }

    loadSaved(mapParam) {
        let encoded = mapParam;
        if (!encoded) {
            try {
                encoded = localStorage.getItem(STORAGE_KEY);
            } catch {
                encoded = null;
            }
        }
        if (!encoded) return;
        try {
            for (const [gx, gz, type, orient] of decodeCells(encoded)) {
                const cell = {type, orient, isFinish: type === 'track-finish', object: null};
                this.grid.set(cellKey(gx, gz), cell);
                this.placeMesh(gx, gz, cell);
            }
        } catch (e) {
            console.warn('Failed to load saved map', e);
        }
    }

    /* ---- Input ---- */

    updateCursor() {
        const el = this.engine.canvas;
        if (this.isPanning) el.style.cursor = 'grabbing';
        else if (this.spaceDown || this.tool === 'pan') el.style.cursor = 'grab';
        else el.style.cursor = '';
    }

    setupInput() {
        const el = this.engine.canvas;
        const pointers = new Map();
        const panStart = {x: 0, y: 0};
        const camStart = {x: 0, z: 0};
        let pinchStartDist = 0;
        let pinchStartZoom = 1;
        let lastDrawCell = null;
        this.isPanning = false;
        this.spaceDown = false;
        let isDrawing = false;
        let isErasing = false;

        const pinch = () => {
            const [a, b] = [...pointers.values()];
            return {dist: Math.hypot(b.x - a.x, b.y - a.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
        };
        const startPan = (x, y) => {
            this.isPanning = true;
            panStart.x = x;
            panStart.y = y;
            camStart.x = this.camTarget[0];
            camStart.z = this.camTarget[2];
        };
        const handleDraw = (clientX, clientY) => {
            const cell = this.screenToGrid(clientX, clientY);
            if (lastDrawCell && lastDrawCell.gx === cell.gx && lastDrawCell.gz === cell.gz) return;
            lastDrawCell = cell;
            if (isErasing) this.eraseRoad(cell.gx, cell.gz);
            else if (isDrawing) this.placeRoad(cell.gx, cell.gz);
        };

        el.addEventListener('contextmenu', (e) => e.preventDefault());

        el.addEventListener('pointerdown', (e) => {
            el.setPointerCapture(e.pointerId);
            pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
            if (pointers.size === 2) {
                isDrawing = false;
                isErasing = false;
                const p = pinch();
                startPan(p.x, p.y);
                pinchStartDist = p.dist;
                pinchStartZoom = this.zoom;
                return;
            }
            if (pointers.size > 2) return;
            if (e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey || this.spaceDown || this.tool === 'pan'))) {
                startPan(e.clientX, e.clientY);
                this.updateCursor();
                return;
            }
            if (e.button === 0) {
                if (this.tool === 'erase') isErasing = true;
                else isDrawing = true;
                lastDrawCell = null;
                /* On touch, wait for a move or the release to rule out a two-finger gesture. */
                if (e.pointerType !== 'touch') handleDraw(e.clientX, e.clientY);
            } else if (e.button === 2) {
                isErasing = true;
                lastDrawCell = null;
                handleDraw(e.clientX, e.clientY);
            }
        });

        el.addEventListener('pointermove', (e) => {
            pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
            const {width, height} = this.viewSize();
            if (pointers.size === 2 && this.isPanning) {
                const p = pinch();
                const scale = height / el.clientHeight;
                this.camTarget[0] = camStart.x - (p.x - panStart.x) * scale;
                this.camTarget[2] = camStart.z - (p.y - panStart.y) * scale;
                this.zoom = Math.max(0.1, Math.min(10, pinchStartZoom * (p.dist / pinchStartDist)));
                this.updateCamera();
                return;
            }
            if (this.isPanning) {
                this.camTarget[0] = camStart.x - ((e.clientX - panStart.x) / el.clientWidth) * width;
                this.camTarget[2] = camStart.z - ((e.clientY - panStart.y) / el.clientHeight) * height;
                this.updateCamera();
                return;
            }
            if (isDrawing || isErasing) {
                handleDraw(e.clientX, e.clientY);
                return;
            }
            if (e.pointerType === 'mouse') {
                const cell = this.screenToGrid(e.clientX, e.clientY);
                this.updateGhost(cell.gx, cell.gz);
            }
        });

        window.addEventListener('pointerup', (e) => {
            pointers.delete(e.pointerId);
            if (pointers.size !== 0) return;
            /* A touch tap that never moved draws now. */
            if ((isDrawing || isErasing) && lastDrawCell === null && !this.isPanning) handleDraw(e.clientX, e.clientY);
            this.isPanning = false;
            isDrawing = false;
            isErasing = false;
            lastDrawCell = null;
            this.updateCursor();
        });
        window.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));

        /* Trackpad: two-finger scroll pans, pinch (ctrl + wheel) zooms. */
        el.addEventListener(
            'wheel',
            (e) => {
                e.preventDefault();
                if (e.ctrlKey) {
                    this.zoom *= e.deltaY > 0 ? 1 / 1.02 : 1.02;
                    this.zoom = Math.max(0.1, Math.min(10, this.zoom));
                } else {
                    const scale = this.viewSize().height / el.clientHeight;
                    this.camTarget[0] += e.deltaX * scale;
                    this.camTarget[2] += e.deltaY * scale;
                }
                this.updateCamera();
            },
            {passive: false}
        );

        window.addEventListener('keydown', (e) => {
            if (e.key === ' ') {
                if (!this.spaceDown) {
                    this.spaceDown = true;
                    this.updateCursor();
                }
                e.preventDefault();
            } else if (e.key === '1') this.selectTool('road');
            else if (e.key === '2') this.selectTool('erase');
            else if (e.key === '3') this.selectTool('pan');
        });
        window.addEventListener('keyup', (e) => {
            if (e.key === ' ') {
                this.spaceDown = false;
                this.updateCursor();
            }
        });
        window.addEventListener('resize', () => this.onResize());
    }
}
