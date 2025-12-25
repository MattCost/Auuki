import { xf, avg, clamp } from './functions.js';
import { ControlMode, } from './ble/enums.js';


// Do we need to subscribe to any of these? or is just triggering off power1s good enough?
// If we need to adjust PID process when starting or stopping, we can react to these events
// ui:watchPause  - auto pause activated (paused)
// ui:watchResume - auto pause deactivated (resumed)
// ui:workoutStart - workout starting
// Should we put the PID loop inside the onPower handler? As long as we always sub to 1second power, we get timing for 'free'
// Otherwise we need a timer tick we can subscribe to, 

class PowerMatch {
    constructor(args) {
        this.enabled = false;   // Is the Power Match option turned on in the Settings screen
        this.active = false;    // Is the trainer in erg mode with a power target and no slope target
        this.workoutActive = false; // Is the workout running (not auto-paused)
        this.currentTarget = 0;
        this.currentTargetTrainer = 0;
        this.Kp = 0.45;  // Expose PID gains via settings?
        this.Ki = 0.050;
        this.Kd = 0.0;
        this.previousError = 0;
        this.previousIntegral = 0;
        this.baseOffset = 0; // TODO: Expose via settings, for trainers that are off by a set offset. If your trainer reads low, this should be positive. If your trainer reads high, this should be negative. For example, power meter says 100 watts, trainer says 130 watts. The trainer reads high and this should be -30
        this.scaleOffset = 1.0; // TODO: Expose via settings, for trainers that are off by a fixed % across the range
        this.powerSamples = [];
        this.powerAvg = 0.0;
        this.powerAvgTime = 10; // in seconds
        this.integrationTime = 5; // Expose time via settings?
        this.integrationCounter = 0;
        this.init();
    }

    init() {
        console.log('PowerMatch: hello world');
        xf.sub('db:sources', this.onSources.bind(this));
        xf.sub('db:power1s', this.onPower.bind(this));
        xf.sub('db:powerTarget', this.onPowerTarget.bind(this));
        xf.sub('db:mode', this.onMode.bind(this));
        xf.sub('ui:watchPause', this.onWatchPause.bind(this));
        xf.sub('ui:watchResume', this.onWatchResume.bind(this));
        xf.sub('ui:workoutStart', this.onWorkoutStart.bind(this));

    }

    onSources(value) {
        this.enabled = value.powerMatch ?? this.enabled;
        // TODO add additional settings
    }
    onMode(mode) {
        this.active = mode == ControlMode.erg ? this.enabled : false;
        console.log('PowerMatch: onMode %s. active %s', mode, this.active);
    }
    onWorkoutStart() {
        console.log('PowerMatch: onWorkoutStart');
        this.workoutActive = true;
    }
    onWatchPause() {
        console.log('PowerMatch: onWatchPause');
        this.workoutActive = false;
    }
    onWatchResume() {
        console.log('PowerMatch: onWatchResume');
        this.workoutActive = true;
    }
    onPower(power) {
        // TODO clear history on large power change ?

        // Add power to samples, and trim samples to max of power calc time, then calc average
        this.powerSamples.push(power);

        while (this.powerSamples.length > this.powerAvgTime) {
            this.powerSamples.shift();
        }
    
        this.powerAvg = Math.round(avg(this.powerSamples));

        if(this.active && this.workoutActive) {
            this.integrationCounter++;
            if(this.integrationCounter >= this.integrationTime) {
                this.processPID(this.integrationCounter);
                this.integrationCounter = 0;
            }
        }
    }

    onPowerTarget(target) {
        if (!this.active) {
            this.currentTarget = target;
            this.currentTargetTrainer = target;
            console.log('PowerMatch: onPowerTarget. Power Match not active. Passing on target %d as is.', target);
            xf.dispatch('powerTargetTrainer', this.currentTargetTrainer);

        } else {
            // if new target is more than XX% above current target, reset pid vars
            var delta = this.currentTarget - target;
            console.log('PowerMatch: onPowerTarget new Target %d currentTarget %d delta %d', target, this.currentTarget, delta);
            if ((Math.abs(delta) / this.currentTarget) > 0.10) {
                console.log('PowerMatch: Target Change > 10%. Resetting PID vars');
                this.previousError = 0;
                this.previousIntegral = 0;
                this.integrationCounter = 0;
            }
            // increase the target based on static offsets
            this.currentTarget = target;
            this.currentTargetTrainer = target * this.scaleOffset + this.baseOffset;
            console.log('PowerMatch: onPowerTarget. Power Match active. Adjusting target %d to %d with static offsets', target, this.currentTargetTrainer);
            xf.dispatch('powerTargetTrainer', this.currentTargetTrainer);
            
            // Calling processPID is weird, this.powerAvg is NaN which causes the processPID to barf silently and poison the power numbers and break the workout simulation.
            // console.log('PowerMatch: onPowerTarget. Power Match active. Calling processPID()');
            // this.processPID(this.integrationCounter);
            // this.integrationCounter = 0;
        }

    }

    processPID(secondsSinceLast) {
        var error =  this.currentTarget - this.powerAvg;
        var integral = clamp(-2500, 2500, this.previousIntegral + (error * secondsSinceLast));
        var derivative = (error - this.previousError) / secondsSinceLast;
        console.log('PowerMatch: processPID error %d integral %d derivative %d', error, integral, derivative);

        this.currentTargetTrainer = (this.currentTarget*this.scaleOffset+this.baseOffset) + Math.round( this.Kp * error + this.Ki * integral + this.Kd * derivative);
        this.previousError = error;
        this.previousIntegral = integral;
        console.log('PowerMatch: processPID target %d trainer Target %d',this.currentTarget, this.currentTargetTrainer)

        xf.dispatch('powerTargetTrainer', this.currentTargetTrainer);
    }
}


const powerMatch = new PowerMatch();

export { powerMatch };