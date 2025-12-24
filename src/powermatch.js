import { xf, avg } from './functions.js';
import { ControlMode, } from './ble/enums.js';

// Need to respond to
//     sources - for settings
//     power - to update our internal average power reading
//     target - to update out PID target
//     erg mode on/off - need to know if our logic is active
//     1 second step - when the workout is active, we need a 1second tick

// need to broadcast
//     trainerPowerTarget - this will get sent to the trainer erg mode

// Other code dispatches the powerTarget first, then switches to erg mode. That is one edge case we need to deal with.
// Can we subscribe to start? auto-start? 
// ui:watchPause  - auto pause activated (paused)
// ui:watchResume - auto pause deactivated (resumed)
// ui:workoutStart - workout starting
// Should we put the PID loop inside the onPower handler? As long as we always sub to 1second power, we get timing for 'free'
// Otherwise we need a timer tick we can subscribe to, 

class PowerMatch {
    constructor(args) {
        this.active = false;
        this.enabled = false;
        this.currentTarget = 0;
        this.currentTargetTrainer = 0;
        this.Kp = 0.15;
        this.Ki = 0.025;
        this.Kd = 0.0;
        this.previousError = 0;
        this.previousIntegral = 0;
        this.baseOffset = 30; // Expose via settings, for trainers that are off by a set offset. 
        this.scaleOffset = 1.0; // Expose via settings, for trainers that are off by a fixed % across the range
        this.powerSamples = [];
        this.power10s = 0.0;
        this.init();
    }

    init() {
        console.log('PowerMatch: hello world');
        xf.sub('db:sources', this.onSources.bind(this));
        xf.sub('db:power1s', this.onPower.bind(this));
        xf.sub('db:powerTarget', this.onPowerTarget.bind(this));
        xf.sub('db:mode', this.onMode.bind(this));
        // xf.sub('ui:mode-set', this.onModeSet.bind(this));

    }

    onSources(value) {
        this.enabled = value.powerMatch ?? this.enabled;
    }
    
    onMode(mode) {
        this.active = mode == ControlMode.erg ? this.enabled : false;
        console.log('PowerMatch: onMode %s. active %s', mode, this.active);
    }

    onModeSet(mode) {
        this.active = mode == ControlMode.erg ? this.enabled : false;
        console.log('PowerMatch: onModeSet %s. active %s', mode, this.active);
    }

    onPower(power) {
        this.powerSamples.push(power);
        while (this.powerSamples.length > 10) {
            this.powerSamples.shift();
        }
        this.power10s = Math.round(avg(this.powerSamples));
        console.log('PowerMatch: internal 10 sec average power %d', this.power10s);

    }

    onPowerTarget(target) {
        if (!this.active) {
            this.currentTarget = target;
            this.currentTargetTrainer = target;
            console.log('PowerMatch: onPowerTarget. Power Match not active. Passing on target %d as is.', target);
        } else {
            // if new target is more than 10% above current target, reset pid vars
            var delta = this.currentTarget - target;
            console.log('PowerMatch: onPowerTarget new Target %d currentTarget %d delta %d', target, this.currentTarget, delta);
            if ((Math.abs(delta) / this.currentTarget) > 0.10) {
                console.log('PowerMatch: Target Change > 10%. Resetting PID vars');
                this.previousError = 0;
                this.previousIntegral = 0;
            }
            this.currentTarget = target;

            // increase the target based on static offsets
            this.currentTargetTrainer = target * this.scaleOffset + this.baseOffset;
            console.log('PowerMatch: onPowerTarget. Power Match active. Adjusting target %d to %d with static offsets', target, this.currentTargetTrainer);
        }

        console.log('calling xf.dispatch powerTargetTrainer');
        xf.dispatch('powerTargetTrainer', this.currentTargetTrainer);

    }
}


const powerMatch = new PowerMatch();

export { powerMatch };