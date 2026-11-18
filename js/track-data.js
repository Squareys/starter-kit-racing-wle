/*
 * Track layout data and the URL codec, independent of the renderer.
 * Cells are [gx, gz, pieceName, godotOrientation]; Godot's GridMap orientation
 * indices map to yaw angles through ORIENT_DEG.
 */

export const ORIENT_DEG = {0: 0, 10: 180, 16: 90, 22: 270};

export const CELL_RAW = 9.99;
export const GRID_SCALE = 0.75;
export const CELL_SIZE = CELL_RAW * GRID_SCALE;

export const TRACK_CELLS = [
    [-3, -3, 'track-corner', 16],
    [-2, -3, 'track-straight', 22],
    [-1, -3, 'track-straight', 22],
    [0, -3, 'track-corner', 0],
    [-3, -2, 'track-straight', 0],
    [0, -2, 'track-straight', 0],
    [-3, -1, 'track-corner', 10],
    [-2, -1, 'track-corner', 0],
    [0, -1, 'track-straight', 0],
    [-2, 0, 'track-straight', 10],
    [0, 0, 'track-finish', 0],
    [-2, 1, 'track-straight', 10],
    [0, 1, 'track-straight', 0],
    [-2, 2, 'track-corner', 10],
    [-1, 2, 'track-straight', 16],
    [0, 2, 'track-corner', 22],
];

export const DECO_CELLS = [
    [-4, -2, 'decoration-tents', 10],
    [-1, -4, 'decoration-tents', 22],
    [-1, 1, 'decoration-tents', 22],
    [-8, -9, 'decoration-forest', 0], [-7, -9, 'decoration-forest', 0],
    [-6, -9, 'decoration-forest', 0], [-5, -9, 'decoration-forest', 0],
    [-4, -9, 'decoration-forest', 0], [-3, -9, 'decoration-forest', 0],
    [-2, -9, 'decoration-forest', 0], [-1, -9, 'decoration-forest', 0],
    [0, -9, 'decoration-forest', 0], [1, -9, 'decoration-forest', 0],
    [2, -9, 'decoration-forest', 0],
    [-8, -8, 'decoration-forest', 0], [-7, -8, 'decoration-forest', 0],
    [-6, -8, 'decoration-forest', 0], [-5, -8, 'decoration-forest', 0],
    [-4, -8, 'decoration-forest', 0], [-3, -8, 'decoration-forest', 0],
    [-2, -8, 'decoration-forest', 0], [-1, -8, 'decoration-forest', 0],
    [0, -8, 'decoration-forest', 0], [1, -8, 'decoration-forest', 0],
    [2, -8, 'decoration-forest', 0],
    [-8, -7, 'decoration-forest', 0], [-7, -7, 'decoration-forest', 0],
    [-6, -7, 'decoration-forest', 0], [-5, -7, 'decoration-forest', 0],
    [-4, -7, 'decoration-forest', 0], [-3, -7, 'decoration-forest', 0],
    [-2, -7, 'decoration-forest', 0], [-1, -7, 'decoration-forest', 0],
    [0, -7, 'decoration-forest', 0], [1, -7, 'decoration-forest', 0],
    [2, -7, 'decoration-forest', 0],
    [-8, -6, 'decoration-forest', 0], [-7, -6, 'decoration-forest', 0],
    [-6, -6, 'decoration-forest', 0], [-5, -6, 'decoration-forest', 0],
    [-4, -6, 'decoration-forest', 0], [-3, -6, 'decoration-empty', 0],
    [-2, -6, 'decoration-empty', 0], [-1, -6, 'decoration-empty', 0],
    [0, -6, 'decoration-empty', 0], [1, -6, 'decoration-forest', 0],
    [2, -6, 'decoration-forest', 0],
    [-8, -5, 'decoration-forest', 0], [-7, -5, 'decoration-forest', 0],
    [-6, -5, 'decoration-forest', 0], [-5, -5, 'decoration-forest', 0],
    [-4, -5, 'decoration-empty', 0], [-3, -5, 'decoration-empty', 0],
    [-2, -5, 'decoration-empty', 0], [-1, -5, 'decoration-empty', 0],
    [0, -5, 'decoration-empty', 0], [1, -5, 'decoration-forest', 0],
    [2, -5, 'decoration-forest', 0],
    [-8, -4, 'decoration-forest', 0], [-7, -4, 'decoration-forest', 0],
    [-6, -4, 'decoration-forest', 0], [-5, -4, 'decoration-forest', 0],
    [-4, -4, 'decoration-empty', 0],
    [1, -4, 'decoration-forest', 0],
    [2, -4, 'decoration-forest', 0],
    [-8, -3, 'decoration-forest', 0], [-7, -3, 'decoration-forest', 0],
    [-6, -3, 'decoration-forest', 0], [-5, -3, 'decoration-forest', 0],
    [-4, -3, 'decoration-empty', 0],
    [1, -3, 'decoration-forest', 0],
    [2, -3, 'decoration-forest', 0],
    [-8, -2, 'decoration-forest', 0], [-7, -2, 'decoration-forest', 0],
    [-6, -2, 'decoration-forest', 0], [-5, -2, 'decoration-forest', 0],
    [1, -2, 'decoration-forest', 0],
    [2, -2, 'decoration-forest', 0],
    [-8, -1, 'decoration-forest', 0], [-7, -1, 'decoration-forest', 0],
    [-6, -1, 'decoration-forest', 0], [-5, -1, 'decoration-forest', 0],
    [-4, -1, 'decoration-empty', 0], [-1, -1, 'decoration-empty', 0],
    [1, -1, 'decoration-forest', 0],
    [2, -1, 'decoration-forest', 0],
    [-8, 0, 'decoration-forest', 0], [-7, 0, 'decoration-forest', 0],
    [-6, 0, 'decoration-forest', 0], [-5, 0, 'decoration-forest', 0],
    [-4, 0, 'decoration-empty', 0], [-3, 0, 'decoration-empty', 0],
    [-1, 0, 'decoration-empty', 0],
    [1, 0, 'decoration-forest', 0],
    [2, 0, 'decoration-forest', 0],
    [-8, 1, 'decoration-forest', 0], [-7, 1, 'decoration-forest', 0],
    [-6, 1, 'decoration-forest', 0], [-5, 1, 'decoration-forest', 0],
    [-4, 1, 'decoration-empty', 0], [-3, 1, 'decoration-empty', 0],
    [1, 1, 'decoration-forest', 0],
    [2, 1, 'decoration-forest', 0],
    [-8, 2, 'decoration-forest', 0], [-7, 2, 'decoration-forest', 0],
    [-6, 2, 'decoration-forest', 0], [-5, 2, 'decoration-forest', 0],
    [-4, 2, 'decoration-empty', 0], [-3, 2, 'decoration-empty', 0],
    [1, 2, 'decoration-forest', 0],
    [2, 2, 'decoration-forest', 0],
    [-8, 3, 'decoration-forest', 0], [-7, 3, 'decoration-forest', 0],
    [-6, 3, 'decoration-forest', 0], [-5, 3, 'decoration-forest', 0],
    [-4, 3, 'decoration-forest', 0], [-3, 3, 'decoration-forest', 0],
    [-2, 3, 'decoration-forest', 0], [-1, 3, 'decoration-forest', 0],
    [0, 3, 'decoration-forest', 0], [1, 3, 'decoration-forest', 0],
    [2, 3, 'decoration-forest', 0],
    [-8, 4, 'decoration-forest', 0], [-7, 4, 'decoration-forest', 0],
    [-6, 4, 'decoration-forest', 0], [-5, 4, 'decoration-forest', 0],
    [-4, 4, 'decoration-forest', 0], [-3, 4, 'decoration-forest', 0],
    [-2, 4, 'decoration-forest', 0], [-1, 4, 'decoration-forest', 0],
    [0, 4, 'decoration-forest', 0], [1, 4, 'decoration-forest', 0],
    [2, 4, 'decoration-forest', 0],
];

/* Parked trucks of the default track: [model, x, y, z, yawDegrees]. */
export const NPC_TRUCKS = [
    ['vehicle-truck-green', -3.51, -0.01, 12.7, 98.0],
    ['vehicle-truck-purple', -23.78, -0.14, -13.56, 0.0],
    ['vehicle-truck-red', -1.36, -0.15, -23.8, 155.9],
];

export const TYPE_NAMES = ['track-straight', 'track-corner', 'track-bump', 'track-finish'];
const TYPE_INDEX = {};
for (let i = 0; i < TYPE_NAMES.length; i++) TYPE_INDEX[TYPE_NAMES[i]] = i;

const ORIENT_TO_GODOT = [0, 16, 10, 22];
const GODOT_TO_ORIENT = {0: 0, 16: 1, 10: 2, 22: 3};

/* Three bytes per cell: x + 128, z + 128, type << 2 | orientation, base64url. */
export function encodeCells(cells) {
    const bytes = new Uint8Array(cells.length * 3);
    for (let i = 0; i < cells.length; i++) {
        const [gx, gz, name, godotOrient] = cells[i];
        bytes[i * 3] = gx + 128;
        bytes[i * 3 + 1] = gz + 128;
        bytes[i * 3 + 2] = ((TYPE_INDEX[name] ?? 0) << 2) | (GODOT_TO_ORIENT[godotOrient] ?? 0);
    }
    return bytesToBase64url(bytes);
}

export function decodeCells(str) {
    const bytes = base64urlToBytes(str);
    const cells = [];
    for (let i = 0; i + 2 < bytes.length; i += 3) {
        const packed = bytes[i + 2];
        cells.push([bytes[i] - 128, bytes[i + 1] - 128, TYPE_NAMES[(packed >> 2) & 0x03], ORIENT_TO_GODOT[packed & 0x03]]);
    }
    return cells;
}

export function computeSpawnPosition(cells) {
    let cell = cells[0];
    for (const c of cells) {
        if (c[2] === 'track-finish') {
            cell = c;
            break;
        }
    }
    if (!cell) return {position: [3.5, 0.5, 5], angle: 0};
    const x = (cell[0] + 0.5) * CELL_SIZE;
    const z = (cell[1] + 0.5) * CELL_SIZE;
    const angle = ((ORIENT_DEG[cell[3]] || 0) * Math.PI) / 180;
    return {position: [x, 0.5, z], angle};
}

export function computeTrackBounds(cells) {
    if (!cells || cells.length === 0) return {centerX: 0, centerZ: 0, halfWidth: 30, halfDepth: 30};
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [gx, gz] of cells) {
        minX = Math.min(minX, gx);
        maxX = Math.max(maxX, gx);
        minZ = Math.min(minZ, gz);
        maxZ = Math.max(maxZ, gz);
    }
    const S = CELL_SIZE;
    return {
        centerX: ((minX + maxX + 1) / 2) * S,
        centerZ: ((minZ + maxZ + 1) / 2) * S,
        halfWidth: ((maxX - minX + 1) / 2) * S + S,
        halfDepth: ((maxZ - minZ + 1) / 2) * S + S,
    };
}

function bytesToBase64url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(str) {
    const binary = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}
