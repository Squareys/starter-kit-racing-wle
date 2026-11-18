/* Isometric-style follow camera: 45° azimuth, 35° elevation, distance 16,
 * with velocity lead and a dead-zone circle the car never leaves. */

const VERTICAL_FOV = 40;

export class FollowCamera {
    constructor(object, view) {
        this.object = object;
        this.view = view;
        this.offset = [9.27, 9.18, 9.27];

        const ox = this.offset[0], oz = this.offset[2];
        const lr = Math.hypot(oz, ox);
        this.camRight = [oz / lr, 0, -ox / lr];
        this.camForward = [-ox / lr, 0, -oz / lr];

        this.leadFactor = 3.0;
        this.cameraSmoothing = 2.0;
        this.deadzoneRadius = 5.0;
        this.screenShiftUp = 1.0;

        this.smoothed = [0, 0, 0];
        this.initialized = false;
        this._pos = new Float32Array(3);
        this._look = new Float32Array(3);
    }

    /** Keeps the original's 40° vertical field of view on any aspect ratio. */
    updateFov(aspect) {
        const v = (VERTICAL_FOV * Math.PI) / 180;
        this.view.fov = (2 * Math.atan(Math.tan(v / 2) * aspect) * 180) / Math.PI;
    }

    update(dt, target, velocity) {
        const r = this.deadzoneRadius;
        const R = this.camRight, F = this.camForward;
        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

        let leadX = dot(velocity, R) * this.leadFactor;
        let leadY = dot(velocity, F) * this.leadFactor;
        const leadSq = leadX * leadX + leadY * leadY;
        if (leadSq > r * r) {
            const k = r / Math.sqrt(leadSq);
            leadX *= k;
            leadY *= k;
        }

        const s = this.smoothed;
        const alpha = this.initialized ? 1 - Math.exp(-dt * this.cameraSmoothing) : 1;
        for (let i = 0; i < 3; i++) {
            const desired = target[i] + R[i] * leadX + F[i] * leadY;
            s[i] += (desired - s[i]) * alpha;
        }
        this.initialized = true;

        /* Hard clamp: the car must not escape the dead zone even if smoothing lags. */
        const delta = [target[0] - s[0], target[1] - s[1], target[2] - s[2]];
        const offX = dot(delta, R);
        const offY = dot(delta, F);
        const offSq = offX * offX + offY * offY;
        if (offSq > r * r) {
            const len = Math.sqrt(offSq);
            const k = (len - r) / len;
            for (let i = 0; i < 3; i++) s[i] += R[i] * offX * k + F[i] * offY * k;
        }

        const look = this._look;
        for (let i = 0; i < 3; i++) look[i] = s[i] - F[i] * this.screenShiftUp;
        for (let i = 0; i < 3; i++) this._pos[i] = look[i] + this.offset[i];
        this.object.setPositionWorld(this._pos);
        this.object.lookAt(look);
    }
}
