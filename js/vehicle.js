import {rigidBody} from 'crashcat';
import {
    clamp,
    cross,
    lerp,
    lerpAngle,
    normalize,
    quatFromBasis,
    quatFromEulerYXZ,
    quatMul,
    quatSlerp,
    quatYaw,
    rotateVec,
} from './math.js';

export const MAX_SPEED = 1.5;
const LINEAR_DAMP = 0.1;

const UP = [0, 1, 0];
const Z = [0, 0, 1];
const X = [1, 0, 0];
const _v = new Float32Array(3);
const _forward = new Float32Array(3);
const _right = new Float32Array(3);
const _zAxis = new Float32Array(3);
const _xAxis = new Float32Array(3);
const _newZ = new Float32Array(3);
const _q = new Float32Array(4);
const _q2 = new Float32Array(4);

/**
 * Arcade vehicle: a physics sphere rolls along the ground, and the visual
 * truck (`container`) follows it with its own heading, body lean and wheels.
 */
export class Vehicle {
    constructor(container) {
        this.container = container;
        this.quat = new Float32Array([0, 0, 0, 1]);
        this.position = new Float32Array(3);

        this.linearSpeed = 0;
        this.angularSpeed = 0;
        this.acceleration = 0;

        this.spherePos = new Float32Array([3.5, 0.5, 5]);
        this.sphereVel = new Float32Array(3);
        this.spawn = {position: [3.5, 0.5, 5], angle: 0};

        this.rigidBody = null;
        this.physicsWorld = null;

        this.modelVelocity = new Float32Array(3);
        this.prevModelPos = new Float32Array([3.5, 0, 5]);

        this.inputX = 0;
        this.inputZ = 0;
        this.driftIntensity = 0;

        this.bodyNode = null;
        this.bodyRest = [0, 0.4, 0];
        this.bodyRotX = 0;
        this.bodyRotZ = 0;
        this.bodyPosY = 0.4;
        this.wheels = [];
        this.wheelFL = null;
        this.wheelFR = null;
        this.wheelBL = null;
        this.wheelBR = null;
        this.wheelSpin = 0;
        this.steerAngle = 0;

        const find = (object) => {
            for (const child of object.children) {
                const name = child.name.toLowerCase();
                if (name === 'body') {
                    this.bodyNode = child;
                    const t = child.getPositionLocal();
                    this.bodyRest = [t[0], t[1], t[2]];
                    this.bodyPosY = t[1];
                } else if (name.includes('wheel')) {
                    this.wheels.push(child);
                    if (name.includes('front') && name.includes('left')) this.wheelFL = child;
                    if (name.includes('front') && name.includes('right')) this.wheelFR = child;
                    if (name.includes('back') && name.includes('left')) this.wheelBL = child;
                    if (name.includes('back') && name.includes('right')) this.wheelBR = child;
                }
                find(child);
            }
        };
        find(container);
    }

    setSpawn(spawn) {
        this.spawn = spawn;
        const [sx, sy, sz] = spawn.position;
        this.spherePos.set([sx, sy, sz]);
        this.prevModelPos.set([sx, 0, sz]);
        quatYaw(this.quat, spawn.angle);
    }

    update(dt, input) {
        this.inputX = input.x;
        this.inputZ = input.z;
        const q = this.quat;

        if (input.touchActive && (this.inputX !== 0 || this.inputZ !== 0)) {
            /* Touch: the joystick sets a world-space direction, throttle is automatic. */
            const targetAngle = Math.atan2(this.inputX, this.inputZ);
            quatSlerp(q, q, quatYaw(_q, targetAngle), 1 - Math.exp(-3 * dt));
            rotateVec(_forward, q, Z);
            const c = _forward[0] * this.inputZ - _forward[2] * this.inputX;
            this.inputX = clamp(-c * 2, -1, 1);
            this.linearSpeed = lerp(this.linearSpeed, MAX_SPEED, dt * 1.5);
        } else {
            let direction = Math.sign(this.linearSpeed);
            if (direction === 0) direction = Math.abs(this.inputZ) > 0.1 ? Math.sign(this.inputZ) : 1;
            const steeringGrip = clamp(Math.abs(this.linearSpeed), 0.2, 1.0);
            const targetAngular = -this.inputX * steeringGrip * 4 * direction;
            this.angularSpeed = lerp(this.angularSpeed, targetAngular, dt * 4);
            quatMul(q, q, quatYaw(_q, this.angularSpeed * dt));

            const targetSpeed = this.inputZ;
            if (targetSpeed < 0 && this.linearSpeed > 0.01) {
                this.linearSpeed = lerp(this.linearSpeed, 0.0, dt * 8);
            } else if (targetSpeed < 0) {
                this.linearSpeed = lerp(this.linearSpeed, targetSpeed / 2, dt * 2);
            } else {
                this.linearSpeed = lerp(this.linearSpeed, targetSpeed * MAX_SPEED, dt * 1.5);
            }
        }

        rotateVec(_v, q, UP);
        if (_v[1] > 0.5) quatSlerp(q, q, this.alignWithY(q, UP), 0.2);

        this.linearSpeed *= Math.max(0, 1 - LINEAR_DAMP * dt);

        if (this.rigidBody) {
            rotateVec(_forward, q, Z);
            _forward[1] = 0;
            normalize(_forward);
            rotateVec(_right, q, X);
            _right[1] = 0;
            normalize(_right);

            const angvel = this.rigidBody.motionProperties.angularVelocity;
            const drive = this.linearSpeed * 100 * dt;
            rigidBody.setAngularVelocity(this.physicsWorld, this.rigidBody, [
                angvel[0] + _right[0] * drive,
                angvel[1],
                angvel[2] + _right[2] * drive,
            ]);

            const pos = this.rigidBody.position;
            this.spherePos.set([pos[0], pos[1], pos[2]]);
            const vel = this.rigidBody.motionProperties.linearVelocity;
            this.sphereVel.set([vel[0], vel[1], vel[2]]);
        }

        this.acceleration = lerp(this.acceleration, this.linearSpeed + 0.25 * this.linearSpeed * Math.abs(this.linearSpeed), dt);

        if (this.spherePos[1] < -10) this.respawn();

        this.position[0] = this.spherePos[0];
        this.position[1] = this.spherePos[1] - 0.5;
        this.position[2] = this.spherePos[2];

        if (dt > 0) {
            for (let i = 0; i < 3; i++) {
                this.modelVelocity[i] = (this.position[i] - this.prevModelPos[i]) / dt;
                this.prevModelPos[i] = this.position[i];
            }
        }

        this.container.setPositionWorld(this.position);
        this.container.setRotationWorld(q);

        this.updateBody(dt);
        this.updateWheels(dt);

        this.driftIntensity = Math.abs(this.linearSpeed - this.acceleration) + (this.bodyNode ? Math.abs(this.bodyRotZ) * 2 : 0);
    }

    respawn() {
        const p = this.spawn.position;
        if (this.rigidBody) {
            rigidBody.setPosition(this.physicsWorld, this.rigidBody, [p[0], p[1], p[2]], false);
            rigidBody.setLinearVelocity(this.physicsWorld, this.rigidBody, [0, 0, 0]);
            rigidBody.setAngularVelocity(this.physicsWorld, this.rigidBody, [0, 0, 0]);
        }
        this.spherePos.set(p);
        this.sphereVel.fill(0);
        this.linearSpeed = 0;
        this.angularSpeed = 0;
        this.acceleration = 0;
        quatYaw(this.quat, this.spawn.angle);
    }

    /** Rotation with the given up axis that keeps the current heading. */
    alignWithY(q, newY) {
        rotateVec(_zAxis, q, Z);
        cross(_xAxis, _zAxis, newY);
        _xAxis[0] = -_xAxis[0];
        _xAxis[1] = -_xAxis[1];
        _xAxis[2] = -_xAxis[2];
        normalize(_xAxis);
        normalize(cross(_newZ, _xAxis, newY));
        return quatFromBasis(_q2, _xAxis, newY, _newZ);
    }

    updateBody(dt) {
        if (!this.bodyNode) return;
        this.bodyRotX = lerpAngle(this.bodyRotX, -(this.linearSpeed - this.acceleration) / 6, dt * 10);
        this.bodyRotZ = lerpAngle(this.bodyRotZ, -(this.inputX / 5) * this.linearSpeed, dt * 5);
        this.bodyPosY = lerp(this.bodyPosY, 0.3, dt * 5);
        this.bodyNode.setRotationLocal(quatFromEulerYXZ(_q, this.bodyRotX, 0, this.bodyRotZ));
        this.bodyNode.setPositionLocal([this.bodyRest[0], this.bodyPosY, this.bodyRest[2]]);
    }

    updateWheels(dt) {
        this.wheelSpin = (this.wheelSpin + this.acceleration) % (Math.PI * 2);
        this.steerAngle = lerpAngle(this.steerAngle, -this.inputX / 1.5, dt * 10);
        for (const wheel of this.wheels) {
            const steer = wheel === this.wheelFL || wheel === this.wheelFR ? this.steerAngle : 0;
            wheel.setRotationLocal(quatFromEulerYXZ(_q, this.wheelSpin, steer, 0));
        }
    }
}
