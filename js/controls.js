/* Keyboard, gamepad and touch joystick input, merged into {x, z, touchActive}. */

const OWNED_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Controls {
    constructor() {
        this.keys = {};
        this.x = 0;
        this.z = 0;
        this.touchActive = false;
        this.touchDirX = 0;
        this.touchDirY = 0;
        this.steerPointerId = null;
        this.steerStartX = 0;
        this.steerStartY = 0;

        window.addEventListener('keydown', (e) => {
            if (OWNED_KEYS.has(e.code)) e.preventDefault();
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => (this.keys[e.code] = false));
        /* Without this, switching tabs leaves keys held and the car drives off. */
        window.addEventListener('blur', () => (this.keys = {}));

        this.setupTouchUI();
    }

    setupTouchUI() {
        if (!('ontouchstart' in window)) return;

        const css = document.createElement('style');
        css.textContent = `
            .touch-controls { position: absolute; inset: 0; pointer-events: none; z-index: 10; }
            .steer-zone { position: absolute; inset: 0; pointer-events: auto; touch-action: none; }
            .steer-base { position: absolute; width: 140px; height: 140px; margin: -70px 0 0 -70px; border-radius: 50%; background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); display: none; }
            .steer-knob { position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%; background: rgba(255,255,255,0.35); }
        `;
        document.head.appendChild(css);

        const container = document.createElement('div');
        container.className = 'touch-controls';
        const steerZone = document.createElement('div');
        steerZone.className = 'steer-zone';
        const base = document.createElement('div');
        base.className = 'steer-base';
        const knob = document.createElement('div');
        knob.className = 'steer-knob';
        base.appendChild(knob);
        steerZone.appendChild(base);
        container.appendChild(steerZone);
        document.body.appendChild(container);

        const steerRange = 40;

        steerZone.addEventListener('pointerdown', (e) => {
            if (this.steerPointerId !== null) return;
            steerZone.setPointerCapture(e.pointerId);
            this.steerPointerId = e.pointerId;
            this.steerStartX = e.clientX;
            this.steerStartY = e.clientY;
            this.touchActive = true;
            this.touchDirX = 0;
            this.touchDirY = 0;
            base.style.left = `${e.clientX}px`;
            base.style.top = `${e.clientY}px`;
            base.style.display = 'block';
        });

        steerZone.addEventListener('pointermove', (e) => {
            if (e.pointerId !== this.steerPointerId) return;
            let dx = (e.clientX - this.steerStartX) / steerRange;
            let dy = (e.clientY - this.steerStartY) / steerRange;
            const mag = Math.hypot(dx, dy);
            if (mag > 1) {
                dx /= mag;
                dy /= mag;
            }
            this.touchDirX = dx;
            this.touchDirY = dy;
            knob.style.transform = `translate(${dx * 60}px, ${dy * 60}px)`;
        });

        const endSteer = (e) => {
            if (e.pointerId !== this.steerPointerId) return;
            this.steerPointerId = null;
            this.touchActive = false;
            this.touchDirX = 0;
            this.touchDirY = 0;
            knob.style.transform = '';
            base.style.display = 'none';
        };
        steerZone.addEventListener('pointerup', endSteer);
        steerZone.addEventListener('pointercancel', endSteer);
    }

    update() {
        let x = 0, z = 0;
        const k = this.keys;
        if (k.KeyA || k.ArrowLeft) x -= 1;
        if (k.KeyD || k.ArrowRight) x += 1;
        if (k.KeyW || k.ArrowUp) z += 1;
        if (k.KeyS || k.ArrowDown) z -= 1;

        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const gp of pads) {
            if (!gp) continue;
            const stickX = gp.axes[0] || 0;
            if (Math.abs(stickX) > 0.15) x = stickX;
            const rt = gp.buttons[7] ? gp.buttons[7].value : 0;
            const lt = gp.buttons[6] ? gp.buttons[6].value : 0;
            if (rt > 0.1 || lt > 0.1) z = rt - lt;
            break;
        }

        /* Touch joystick mapped to world space (the camera looks along a 45° azimuth). */
        if (this.touchActive) {
            const jx = this.touchDirX, jy = this.touchDirY;
            const mag = Math.hypot(jx, jy);
            if (mag > 0.15) {
                x = ((jx + jy) * Math.SQRT1_2) / mag;
                z = ((-jx + jy) * Math.SQRT1_2) / mag;
            }
        }

        this.x = x;
        this.z = z;
        return {x, z, touchActive: this.touchActive};
    }
}
