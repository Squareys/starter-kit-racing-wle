import {CELL_RAW, DECO_CELLS, NPC_TRUCKS, ORIENT_DEG, TRACK_CELLS} from './track-data.js';
import {quatYaw} from './math.js';

const _q = new Float32Array(4);

/** Enables or disables every component in a hierarchy. */
export function setActiveRecursive(object, active) {
    for (const c of object.getComponents()) c.active = active;
    for (const child of object.children) setActiveRecursive(child, active);
}

/* Deterministic pseudo-random hash, kept bit-exact with the original. */
function hash(gx, gz) {
    let h = gx * 374761393 + gz * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return (h ^ (h >> 16)) >>> 0;
}

/**
 * Spawns track pieces and decorations by cloning the imported model
 * templates. Positions are in the space of the track root, which is scaled
 * by GRID_SCALE and lowered by 0.5 m like the original's track group.
 */
export class TrackBuilder {
    constructor(templatesRoot, trackRoot) {
        this.trackRoot = trackRoot;
        this.templates = {};
        for (const child of templatesRoot.children) {
            this.templates[child.name.replace(/\.glb$/, '')] = child;
        }
    }

    /** Clones the template `key` into `parent` at grid cell (gx, gz). */
    placePiece(key, gx, gz, orient, parent = this.trackRoot) {
        const src = this.templates[key];
        if (!src) return null;
        const piece = src.clone(parent);
        piece.setPositionLocal([(gx + 0.5) * CELL_RAW, 0.5, (gz + 0.5) * CELL_RAW]);
        piece.setRotationLocal(quatYaw(_q, ((ORIENT_DEG[orient] ?? 0) * Math.PI) / 180));
        setActiveRecursive(piece, true);
        return piece;
    }

    placeDecoration(key, x, z, quarterTurns) {
        const src = this.templates[key];
        if (!src) return;
        const piece = src.clone(this.trackRoot);
        piece.setPositionLocal([x, 0.5, z]);
        piece.setRotationLocal(quatYaw(_q, (quarterTurns * Math.PI) / 2));
        setActiveRecursive(piece, true);
    }

    /** Builds the default track, or `customCells` from a `?map=` URL. */
    build(customCells) {
        const cells = customCells || TRACK_CELLS;
        for (const [gx, gz, key, orient] of cells) this.placePiece(key, gx, gz, orient);

        const occupied = new Set();
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        const extend = (gx, gz) => {
            occupied.add(gx + ',' + gz);
            minX = Math.min(minX, gx);
            maxX = Math.max(maxX, gx);
            minZ = Math.min(minZ, gz);
            maxZ = Math.max(maxZ, gz);
        };
        for (const [gx, gz] of cells) extend(gx, gz);

        if (!customCells) {
            for (const [gx, gz, key, orient] of DECO_CELLS) {
                extend(gx, gz);
                this.placeDecoration(key, (gx + 0.5) * CELL_RAW, (gz + 0.5) * CELL_RAW, ((ORIENT_DEG[orient] ?? 0) / 90) | 0);
            }
        }

        /* Grass ring with a few tents next to the track, forest further out. */
        const pad = 3;
        for (let gz = minZ - pad; gz <= maxZ + pad; gz++) {
            for (let gx = minX - pad; gx <= maxX + pad; gx++) {
                if (occupied.has(gx + ',' + gz)) continue;
                const distX = gx < minX ? minX - gx : gx > maxX ? gx - maxX : 0;
                const distZ = gz < minZ ? minZ - gz : gz > maxZ ? gz - maxZ : 0;
                const dist = Math.max(distX, distZ);
                const x = (gx + 0.5) * CELL_RAW;
                const z = (gz + 0.5) * CELL_RAW;
                if (dist <= 1) {
                    if (hash(gx, gz) % 7 === 0) this.placeDecoration('decoration-tents', x, z, hash(gx, gz) % 4);
                    else this.placeDecoration('decoration-empty', x, z, 0);
                } else {
                    this.placeDecoration('decoration-forest', x, z, 0);
                }
            }
        }

        if (!customCells) {
            const root = this.trackRoot.parent;
            for (const [key, x, y, z, rotDeg] of NPC_TRUCKS) {
                const src = this.templates[key];
                if (!src) continue;
                const npc = src.clone(root);
                npc.setScalingLocal([0.5, 0.5, 0.5]);
                npc.setPositionLocal([x, y, z]);
                npc.setRotationLocal(quatYaw(_q, ((rotDeg + 180) * Math.PI) / 180));
                setActiveRecursive(npc, true);
            }
        }

        return {minX, maxX, minZ, maxZ, pad};
    }
}
