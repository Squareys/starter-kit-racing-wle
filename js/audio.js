import {createImpactBuffer} from './impact-sound.js';
/* The worklet file is served from static/; importing it here shares the RPM
 * range with the synth, so the gear model cannot drift from it. */
import {RPM_IDLE, RPM_MAX} from '../static/engine-worklet.js';
import {clamp, lerp} from './math.js';

function remap(value, inMin, inMax, outMin, outMax) {
    return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
}

const NUM_GEARS = 3;
const UPSHIFT_RPM = 0.92;
const DOWNSHIFT_RPM = 0.35;
const SHIFT_COOLDOWN = 0.35;
const SHIFT_CUT = 0.12;

const IMPACT_HARD_VELOCITY = 2.5;
const IMPACT_MAX_VELOCITY = 6;

/* The camera follows at about 16 m; a smaller reference distance makes the
 * world sound "over there". The engine keeps a larger one to stay present. */
const REF_DISTANCE = 7;
const ENGINE_REF_DISTANCE = 11;
const ENGINE_CUTOFF = 5500;

function distanceCutoff(distance) {
    return clamp(24000 * Math.pow(6 / Math.max(distance, 6), 1.9), 1200, 24000);
}

/* Outdoor impulse response: sparse early reflections and a short dark tail. */
function createOutdoorIR(context) {
    const sr = context.sampleRate;
    const length = Math.floor(1.1 * sr);
    const buffer = context.createBuffer(2, length, sr);
    for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        for (let r = 0; r < 8; r++) {
            const t = 0.015 + Math.random() * 0.08;
            data[Math.floor(t * sr)] += (Math.random() * 2 - 1) * (0.5 - r * 0.05);
        }
        let lp = 0;
        const lpCoeff = 1 - Math.exp((-2 * Math.PI * 2200) / sr);
        const start = Math.floor(0.05 * sr);
        for (let i = start; i < length; i++) {
            const t = (i - start) / sr;
            lp += (Math.random() * 2 - 1 - lp) * lpCoeff;
            data[i] += lp * Math.exp(-t / 0.32) * 0.35;
        }
    }
    return buffer;
}

/** source -> filters -> gain -> panner -> master, like three.js PositionalAudio. */
class PositionalSource {
    constructor(ctx, output, refDistance, filters) {
        this.ctx = ctx;
        this.filters = filters;
        this.gain = ctx.createGain();
        this.panner = ctx.createPanner();
        this.panner.panningModel = 'equalpower';
        this.panner.distanceModel = 'inverse';
        this.panner.refDistance = refDistance;
        for (let i = 1; i < filters.length; i++) filters[i - 1].connect(filters[i]);
        if (filters.length) filters[filters.length - 1].connect(this.gain);
        this.input = filters[0] || this.gain;
        this.gain.connect(this.panner);
        this.panner.connect(output);
        this.source = null;
        this.buffer = null;
        this.loop = false;
        this.playbackRate = 1;
        this.isPlaying = false;
    }

    setPosition(p) {
        const t = this.ctx.currentTime;
        this.panner.positionX.setValueAtTime(p[0], t);
        this.panner.positionY.setValueAtTime(p[1], t);
        this.panner.positionZ.setValueAtTime(p[2], t);
    }

    play() {
        if (!this.buffer) return;
        const src = this.ctx.createBufferSource();
        src.buffer = this.buffer;
        src.loop = this.loop;
        src.playbackRate.value = this.playbackRate;
        src.connect(this.input);
        src.onended = () => {
            if (this.source === src) this.isPlaying = false;
        };
        src.start();
        this.source = src;
        this.isPlaying = true;
    }

    stop() {
        if (this.source) {
            try {
                this.source.stop();
            } catch {
                /* Already stopped. */
            }
            this.source.disconnect();
        }
        this.source = null;
        this.isPlaying = false;
    }

    setPlaybackRate(rate) {
        this.playbackRate = rate;
        if (this.source) this.source.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.01);
    }
}

/**
 * Engine, skid and impact sounds on the player's car, with a distance
 * lowpass and a shared outdoor reverb. The listener follows the camera.
 */
export class GameAudio {
    constructor() {
        this.ctx = null;
        this.unlocked = false;
        this.distanceFilters = [];
        this.impactBuffers = [];
        this.impactPlayers = [];
        this.impactIndex = 0;
        this.engineGain = null;
        this.engineRpmParam = null;
        this.engineLoadParam = null;
        this.engineSource = null;
        this.skid = null;
        this.sources = [];
        this.rpm = 0;
        this.gear = 0;
        this.shiftCooldown = 0;
    }

    init() {
        const ctx = new AudioContext();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.connect(ctx.destination);

        const convolver = ctx.createConvolver();
        convolver.buffer = createOutdoorIR(ctx);
        convolver.connect(this.master);
        const send = (v) => {
            const g = ctx.createGain();
            g.gain.value = v;
            g.connect(convolver);
            return g;
        };
        this.reverbSend = send(0.15);
        this.impactReverbSend = send(0.35);
        this.engineReverbSend = send(0.11);

        this.initEngine().catch((e) => console.warn('Engine synth unavailable:', e));

        this.skid = this.createSampleSource(this.reverbSend);
        this.skid.source.loop = true;
        this.skid.source.gain.gain.value = 0;

        for (let i = 0; i < 3; i++) this.impactBuffers.push(createImpactBuffer(ctx, i + 1, 0.4));
        for (let i = 0; i < 3; i++) this.impactBuffers.push(createImpactBuffer(ctx, i + 4, 1.0));
        for (let i = 0; i < 3; i++) this.impactPlayers.push(this.createSampleSource(this.impactReverbSend));

        fetch('audio/skid.ogg')
            .then((r) => r.arrayBuffer())
            .then((data) => ctx.decodeAudioData(data))
            .then((buffer) => {
                this.skid.source.buffer = buffer;
                if (this.unlocked) this.startSounds();
            })
            .catch((e) => console.warn('Skid sound unavailable:', e));

        const unlock = () => {
            if (this.unlocked) return;
            this.unlocked = true;
            if (ctx.state === 'suspended') ctx.resume();
            this.startSounds();
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
            window.removeEventListener('pointerdown', unlock);
        };
        window.addEventListener('keydown', unlock);
        window.addEventListener('click', unlock);
        window.addEventListener('touchstart', unlock);
        window.addEventListener('pointerdown', unlock);

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (ctx.state === 'running') ctx.suspend();
            } else if (this.unlocked && ctx.state === 'suspended') {
                ctx.resume();
            }
        });
    }

    async initEngine() {
        const ctx = this.ctx;
        await ctx.audioWorklet.addModule('engine-worklet.js');
        const node = new AudioWorkletNode(ctx, 'engine-sound', {numberOfInputs: 0, outputChannelCount: [1]});
        this.engineGain = ctx.createGain();
        this.engineGain.gain.value = 0;
        node.connect(this.engineGain);

        const tone = this.neutralLowpass();
        tone.frequency.value = ENGINE_CUTOFF;
        const source = new PositionalSource(ctx, this.master, ENGINE_REF_DISTANCE, [tone]);
        this.engineGain.connect(source.input);
        this.engineGain.connect(this.engineReverbSend);
        this.sources.push(source);
        this.engineSource = source;

        this.engineRpmParam = node.parameters.get('rpm');
        this.engineLoadParam = node.parameters.get('load');
    }

    neutralLowpass() {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 0.0001;
        filter.frequency.value = 24000;
        return filter;
    }

    /* Sample player: distance filter, then a tone filter for per-sound variation;
     * the reverb is tapped after the gain so the send follows the volume. */
    createSampleSource(reverbSend) {
        const distance = this.neutralLowpass();
        const tone = this.neutralLowpass();
        const source = new PositionalSource(this.ctx, this.master, REF_DISTANCE, [distance, tone]);
        source.gain.connect(reverbSend);
        this.distanceFilters.push(distance);
        this.sources.push(source);
        return {source, tone};
    }

    startSounds() {
        const s = this.skid.source;
        if (s.buffer && !s.isPlaying) s.play();
    }

    /** `listener` is the camera object, `position` the car's world position. */
    update(dt, speed, throttle, driftIntensity, listener, position) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        const lp = listener.getPositionWorld();
        const fwd = listener.getForwardWorld(new Float32Array(3));
        const up = listener.getUpWorld(new Float32Array(3));
        const L = ctx.listener;
        if (L.positionX) {
            L.positionX.setValueAtTime(lp[0], now);
            L.positionY.setValueAtTime(lp[1], now);
            L.positionZ.setValueAtTime(lp[2], now);
            L.forwardX.setValueAtTime(fwd[0], now);
            L.forwardY.setValueAtTime(fwd[1], now);
            L.forwardZ.setValueAtTime(fwd[2], now);
            L.upX.setValueAtTime(up[0], now);
            L.upY.setValueAtTime(up[1], now);
            L.upZ.setValueAtTime(up[2], now);
        } else {
            L.setPosition(lp[0], lp[1], lp[2]);
            L.setOrientation(fwd[0], fwd[1], fwd[2], up[0], up[1], up[2]);
        }
        for (const s of this.sources) s.setPosition(position);

        const absSpeed = clamp(Math.abs(speed), 0, 1);
        /* Only forward throttle is engine load, so braking lets the RPM fall. */
        const load = clamp(Math.max(0, throttle), 0, 1);

        const gearWindow = 1 / NUM_GEARS;
        const inGear = clamp((absSpeed - this.gear * gearWindow) / gearWindow, 0, 1);
        const targetRpm = clamp(inGear * 0.85 + load * 0.2, 0, 1.05);
        const rate = targetRpm > this.rpm ? 4 * (0.3 + load) : 4;
        this.rpm = lerp(this.rpm, targetRpm, Math.min(1, dt * rate));

        this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
        if (this.shiftCooldown === 0) {
            if (this.rpm > UPSHIFT_RPM && this.gear < NUM_GEARS - 1 && load > 0.1) {
                this.gear++;
                this.rpm = 0.45;
                this.shiftCooldown = SHIFT_COOLDOWN;
            } else if (this.rpm < DOWNSHIFT_RPM && this.gear > 0) {
                this.gear--;
                this.rpm = 0.78;
                this.shiftCooldown = SHIFT_COOLDOWN;
            }
        }

        const dx = lp[0] - position[0], dy = lp[1] - position[1], dz = lp[2] - position[2];
        const cutoff = distanceCutoff(Math.hypot(dx, dy, dz));
        for (const filter of this.distanceFilters) filter.frequency.setTargetAtTime(cutoff, now, 0.1);

        if (this.engineRpmParam) {
            const shifting = this.shiftCooldown > SHIFT_COOLDOWN - SHIFT_CUT;
            this.engineRpmParam.value = RPM_IDLE + (RPM_MAX - RPM_IDLE) * this.rpm;
            this.engineLoadParam.value = shifting ? 0 : load;
            this.engineGain.gain.setTargetAtTime(remap(absSpeed + load * 0.5, 0, 1.5, 0.06, 0.3), now, 0.08);
        }

        const skid = this.skid.source;
        if (skid.buffer) {
            let skidVol = 0;
            if (driftIntensity > 0.5) skidVol = remap(clamp(driftIntensity, 0.5, 2.0), 0.5, 2.0, 0.08, 0.35);
            skid.gain.gain.setTargetAtTime(skidVol, now, 0.05);
            const skidPitch = clamp(Math.abs(speed), 1, 3);
            skid.setPlaybackRate(lerp(skid.playbackRate, skidPitch, 0.1));
            const intensity01 = clamp(remap(driftIntensity, 0.5, 1.6, 0, 1), 0, 1);
            this.skid.tone.frequency.setTargetAtTime(2500 + intensity01 * 7500, now, 0.1);
        }
    }

    playImpact(impactVelocity) {
        if (!this.unlocked || !this.ctx) return;
        const {source, tone} = this.impactPlayers[this.impactIndex % this.impactPlayers.length];
        this.impactIndex++;
        const set = impactVelocity < IMPACT_HARD_VELOCITY ? 0 : 3;
        if (source.isPlaying) source.stop();
        source.buffer = this.impactBuffers[set + ((Math.random() * 3) | 0)];
        source.gain.gain.value = clamp(remap(impactVelocity, 0, IMPACT_MAX_VELOCITY, 0.01, 1.0), 0.01, 1.0);
        source.playbackRate = 0.9 + Math.random() * 0.2;
        const brightness = clamp(impactVelocity / IMPACT_MAX_VELOCITY, 0, 1);
        tone.frequency.value = (2500 + brightness * 9000) * (0.8 + Math.random() * 0.4);
        source.play();
    }
}
