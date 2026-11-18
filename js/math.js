/* Small vector and quaternion helpers. Quaternions are [x, y, z, w]. */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
}

export function quatMul(out, a, b) {
    const ax = a[0], ay = a[1], az = a[2], aw = a[3];
    const bx = b[0], by = b[1], bz = b[2], bw = b[3];
    out[0] = ax * bw + aw * bx + ay * bz - az * by;
    out[1] = ay * bw + aw * by + az * bx - ax * bz;
    out[2] = az * bw + aw * bz + ax * by - ay * bx;
    out[3] = aw * bw - ax * bx - ay * by - az * bz;
    return out;
}

export function quatAxisAngle(out, x, y, z, angle) {
    const s = Math.sin(angle / 2);
    out[0] = x * s;
    out[1] = y * s;
    out[2] = z * s;
    out[3] = Math.cos(angle / 2);
    return out;
}

export function quatYaw(out, angle) {
    return quatAxisAngle(out, 0, 1, 0, angle);
}

export function quatNormalize(q) {
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    q[0] /= l;
    q[1] /= l;
    q[2] /= l;
    q[3] /= l;
    return q;
}

export function quatSlerp(out, a, b, t) {
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
    if (cos < 0) {
        cos = -cos;
        bx = -bx;
        by = -by;
        bz = -bz;
        bw = -bw;
    }
    let s0, s1;
    if (1 - cos > 1e-6) {
        const omega = Math.acos(cos);
        const sin = Math.sin(omega);
        s0 = Math.sin((1 - t) * omega) / sin;
        s1 = Math.sin(t * omega) / sin;
    } else {
        s0 = 1 - t;
        s1 = t;
    }
    out[0] = s0 * a[0] + s1 * bx;
    out[1] = s0 * a[1] + s1 * by;
    out[2] = s0 * a[2] + s1 * bz;
    out[3] = s0 * a[3] + s1 * bw;
    return quatNormalize(out);
}

/** Rotates vector `v` by quaternion `q`. */
export function rotateVec(out, q, v) {
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    const vx = v[0], vy = v[1], vz = v[2];
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    out[0] = vx + qw * tx + qy * tz - qz * ty;
    out[1] = vy + qw * ty + qz * tx - qx * tz;
    out[2] = vz + qw * tz + qx * ty - qy * tx;
    return out;
}

/** Quaternion from an orthonormal basis (the columns of a rotation matrix). */
export function quatFromBasis(out, x, y, z) {
    const m00 = x[0], m10 = x[1], m20 = x[2];
    const m01 = y[0], m11 = y[1], m21 = y[2];
    const m02 = z[0], m12 = z[1], m22 = z[2];
    const trace = m00 + m11 + m22;
    if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1);
        out[3] = 0.25 / s;
        out[0] = (m21 - m12) * s;
        out[1] = (m02 - m20) * s;
        out[2] = (m10 - m01) * s;
    } else if (m00 > m11 && m00 > m22) {
        const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
        out[3] = (m21 - m12) / s;
        out[0] = 0.25 * s;
        out[1] = (m01 + m10) / s;
        out[2] = (m02 + m20) / s;
    } else if (m11 > m22) {
        const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
        out[3] = (m02 - m20) / s;
        out[0] = (m01 + m10) / s;
        out[1] = 0.25 * s;
        out[2] = (m12 + m21) / s;
    } else {
        const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
        out[3] = (m10 - m01) / s;
        out[0] = (m02 + m20) / s;
        out[1] = (m12 + m21) / s;
        out[2] = 0.25 * s;
    }
    return quatNormalize(out);
}

/** Euler angles in three.js 'YXZ' order: q = qY * qX * qZ. */
export function quatFromEulerYXZ(out, x, y, z) {
    const cx = Math.cos(x / 2), sx = Math.sin(x / 2);
    const cy = Math.cos(y / 2), sy = Math.sin(y / 2);
    const cz = Math.cos(z / 2), sz = Math.sin(z / 2);
    out[0] = sx * cy * cz + cx * sy * sz;
    out[1] = cx * sy * cz - sx * cy * sz;
    out[2] = cx * cy * sz - sx * sy * cz;
    out[3] = cx * cy * cz + sx * sy * sz;
    return out;
}

export function cross(out, a, b) {
    const ax = a[0], ay = a[1], az = a[2];
    const bx = b[0], by = b[1], bz = b[2];
    out[0] = ay * bz - az * by;
    out[1] = az * bx - ax * bz;
    out[2] = ax * by - ay * bx;
    return out;
}

export function normalize(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    v[0] /= l;
    v[1] /= l;
    v[2] /= l;
    return v;
}
