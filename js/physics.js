import {
    addBroadphaseLayer,
    addObjectLayer,
    box,
    createWorld,
    createWorldSettings,
    enableCollision,
    MotionQuality,
    MotionType,
    registerAll,
    rigidBody,
    sphere,
} from 'crashcat';
import {CELL_RAW, GRID_SCALE, ORIENT_DEG, TRACK_CELLS} from './track-data.js';

let registered = false;

/** Creates the crashcat world with a moving and a static layer. */
export function createPhysicsWorld() {
    if (!registered) {
        registerAll();
        registered = true;
    }
    const settings = createWorldSettings();
    settings.gravity = [0, -9.81, 0];
    const bplMoving = addBroadphaseLayer(settings);
    const bplStatic = addBroadphaseLayer(settings);
    const olMoving = addObjectLayer(settings, bplMoving);
    const olStatic = addObjectLayer(settings, bplStatic);
    enableCollision(settings, olMoving, olStatic);
    enableCollision(settings, olMoving, olMoving);
    const world = createWorld(settings);
    world._OL_MOVING = olMoving;
    world._OL_STATIC = olStatic;
    return world;
}

function addStaticBox(world, halfExtents, position, quaternion, friction, restitution) {
    return rigidBody.create(world, {
        shape: box.create({halfExtents}),
        motionType: MotionType.STATIC,
        objectLayer: world._OL_STATIC,
        position,
        quaternion,
        friction,
        restitution,
    });
}

/**
 * Road walls approximated with boxes, as in the original: two straight walls
 * per straight or finish piece, an outer and an inner arc of segments per corner.
 */
export function buildWallColliders(world, customCells) {
    const S = GRID_SCALE;
    const CELL_HALF = CELL_RAW / 2;
    const WALL_HALF_THICK = 0.25;
    const WALL_X = 4.75;
    const WALL_HALF_H = 1.5;

    const wallY = (0.5 + WALL_HALF_H) * S - 0.5;
    const hThick = WALL_HALF_THICK * S;
    const hHeight = WALL_HALF_H * S;
    const hLen = CELL_HALF * S;

    const ARC_SPAN = -Math.PI / 2;
    const ARC_CENTER_X = -CELL_HALF;
    const ARC_CENTER_Z = CELL_HALF;
    const OUTER_R = 2 * CELL_HALF - WALL_HALF_THICK;
    const OUTER_SEG = 8;
    const OUTER_SEG_HALF_LEN = ((OUTER_R * (Math.PI / 2)) / OUTER_SEG / 2) * S;
    const INNER_R = WALL_HALF_THICK;
    const INNER_SEG = 3;
    const INNER_SEG_HALF_LEN = ((INNER_R * (Math.PI / 2)) / INNER_SEG / 2) * S;

    function addArcWall(wcx, wcz, arcStart, radius, numSeg, segHalfLen) {
        for (let i = 0; i < numSeg; i++) {
            const aMid = arcStart + ((i + 0.5) / numSeg) * ARC_SPAN;
            addStaticBox(
                world,
                [hThick, hHeight, segHalfLen],
                [wcx + radius * Math.cos(aMid) * S, wallY, wcz + radius * Math.sin(aMid) * S],
                [0, Math.sin(-aMid / 2), 0, Math.cos(-aMid / 2)],
                0.0,
                0.1
            );
        }
    }

    for (const [gx, gz, key, orient] of customCells || TRACK_CELLS) {
        if (key === 'track-bump') continue;
        const cx = (gx + 0.5) * CELL_RAW * S;
        const cz = (gz + 0.5) * CELL_RAW * S;
        const rad = ((ORIENT_DEG[orient] ?? 0) * Math.PI) / 180;
        const cr = Math.cos(rad), sr = Math.sin(rad);

        if (key === 'track-straight' || key === 'track-finish') {
            for (const side of [-1, 1]) {
                const lx = side * WALL_X;
                addStaticBox(
                    world,
                    [hThick, hHeight, hLen],
                    [cx + lx * cr * S, wallY, cz - lx * sr * S],
                    [0, Math.sin(rad / 2), 0, Math.cos(rad / 2)],
                    0.0,
                    0.1
                );
            }
        } else if (key === 'track-corner') {
            const wcx = cx + (ARC_CENTER_X * cr + ARC_CENTER_Z * sr) * S;
            const wcz = cz + (-ARC_CENTER_X * sr + ARC_CENTER_Z * cr) * S;
            addArcWall(wcx, wcz, -rad, OUTER_R, OUTER_SEG, OUTER_SEG_HALF_LEN);
            addArcWall(wcx, wcz, -rad, INNER_R, INNER_SEG, INNER_SEG_HALF_LEN);
        }
    }
}

export function addGround(world, centerX, centerZ, halfSize) {
    return addStaticBox(world, [halfSize, 0.01, halfSize], [centerX, -0.125, centerZ], [0, 0, 0, 1], 5.0, 0.0);
}

/** The car: a 0.5 m sphere that is rolled by its angular velocity. */
export function createSphereBody(world, spawnPos) {
    return rigidBody.create(world, {
        shape: sphere.create({radius: 0.5}),
        motionType: MotionType.DYNAMIC,
        objectLayer: world._OL_MOVING,
        position: spawnPos || [3.5, 0.5, 5],
        mass: 1000.0,
        friction: 5.0,
        restitution: 0.1,
        linearDamping: 0.1,
        angularDamping: 4.0,
        gravityFactor: 1.5,
        motionQuality: MotionQuality.LINEAR_CAST,
    });
}
