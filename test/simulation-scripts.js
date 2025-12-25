import { xf, equals, rand } from '../src/functions.js';

const PowerErrorMode = Object.freeze({
    None: 0,
    Offset: 1,
    Scale: 2,
    OffsetAndScale: 3,
    Ranged: 4,
});

class TrainerMock {
    constructor() {
        this.defaults = {
            powerTarget: 220,
            slope: 0,
            ftp: 256,
        };
        this.powerTarget = this.defaults.powerTarget;
        this.powerTargetTrainer = this.defaults.powerTarget;
        this.slope = this.defaults.slope;
        this.ftp = this.defaults.ftp;

        this.cadence = 80;
        this.power = 0;
        this.speed = 20;
        this.heartRate = 140;

        this.zones = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
        this.percentages = {
            'one': 0.54, 'two': 0.75, 'three': 0.87,
            'four': 0.94, 'five': 1.05, 'six': 1.20,
        };

        this.powerErrorMode = PowerErrorMode.Scale;
        this.powerErrorOffset = 0;
        this.powerErrorScale = 0.85;
        this.powerErrorRange = [
            { 'low': 0, 'high': 100, 'offset': 20, 'scale': 1.0 },
            { 'low': 100, 'high': 200, 'offset': 35, 'scale': 1.0 },
            { 'low': 200, 'high': 999, 'offset': 40, 'scale': 1.0 },
        ];
        // this.init();
    }
    init() {
        const self = this;

        xf.sub('db:powerTarget', self.onPowerTarget.bind(self));
        xf.sub('db:powerTargetTrainer', self.onPowerTargetTrainer.bind(self));
        xf.sub('db:slopeTarget', self.onSlopeTarget.bind(self));
        xf.sub('db:ftp', self.onFTP.bind(self));

        xf.sub('ui:workoutStart', self.run.bind(self));
        xf.sub('ui:watchStart', self.run.bind(self));
        xf.sub('ui:watchResume', self.run.bind(self));
        xf.sub('ui:watchPause', self.stop.bind(self));

        self.id = 'ble:controllable';
        self.name = 'Tacx Flux 46731';

        xf.dispatch(`${self.id}:connected`);
        xf.dispatch(`${self.id}:name`, self.name);

        self.hrId = 'ble:hrm';
        self.hrName = 'Tacx HRB 20483';

        xf.dispatch(`${self.hrId}:connected`);
        xf.dispatch(`${self.hrId}:name`, self.hrName);

        console.warn('|------------------------|');
        console.warn('|Trainer Mock Data is ON!|');
        console.warn('|------------------------|');
    }
    run() {
        const self = this;
        self.interval = self.broadcast(self.indoorBikeData.bind(self));
    }
    stop() {
        const self = this;
        clearInterval(self.interval);
    }
    broadcast(handler) {
        // broadcast interval in ms
        const interval = setInterval(handler, 250);
        // const interval = setInterval(handler, 1000);
        return interval;
    }
    indoorBikeData() {
        const self = this;
        self.power = this.powerNext(self.power);
        self.heartRate = this.heartRateNext(self.heartRate);
        self.cadence = this.cadenceNext(self.cadence);
        self.speed = 20;

        xf.dispatch('power', self.power);
        xf.dispatch('heartRate', self.heartRate);
        xf.dispatch('cadence', self.cadence);
        xf.dispatch('speed', self.speed);
    }
    onPowerTarget(powerTarget) {
        this.powerTarget = powerTarget;
        // this.power = powerTarget > 0 ? powerTarget : this.defaults.powerTarget;
        this.heartRate = this.powerToHeartRate(powerTarget, this.ftp, this.zones);
    }
    onPowerTargetTrainer(powerTarget) {
        this.powerTargetTrainer = powerTarget;
        this.power = this.addErrorToPower(powerTarget);
    }
    onSlopeTarget(slope) {
        this.slope = slope;
    }
    onFTP(ftp) {
        this.ftp = ftp;
    }
    powerNext(prev) {
        return this.power;
    }
    cadenceNext(prev) {
        return prev + rand(-1, 1);
    }
    heartRateNext(prev) {
        return prev + rand(-1, 1);
    }
    powerToHeartRate(power, ftp, zones) {
        let base = 90;
        if (equals(this.powerToZone(power, ftp, zones).name, 'one')) {
            base = 100;
        }
        if (equals(this.powerToZone(power, ftp, zones).name, 'two')) {
            base = 130;
        }
        if (equals(this.powerToZone(power, ftp, zones).name, 'three')) {
            base = 150;
        }
        if (equals(this.powerToZone(power, ftp, zones).name, 'four')) {
            base = 160;
        }
        if (equals(this.powerToZone(power, ftp, zones).name, 'five')) {
            base = 170;
        }
        if (equals(this.powerToZone(power, ftp, zones).name, 'six')) {
            base = 180;
        }
        if (equals(this.powerToZone(power, ftp, zones).name, 'seven')) {
            base = 190;
        }
        return base;
    }
    powerToZone(value, ftp, zones) {
        const self = this;

        let index = 0;
        let name = zones[index];
        if (value < (ftp * self.percentages.one)) {
            index = 0;
            name = zones[index];
        } else if (value < (ftp * self.percentages.two)) {
            index = 1;
            name = zones[index];
        } else if (value < (ftp * self.percentages.three)) {
            index = 2;
            name = zones[index];
        } else if (value < (ftp * self.percentages.four)) {
            index = 3;
            name = zones[index];
        } else if (value < (ftp * self.percentages.five)) {
            index = 4;
            name = zones[index];
        } else if (value < (ftp * self.percentages.six)) {
            index = 5;
            name = zones[index];
        } else {
            index = 6;
            name = zones[index];
        }
        return { name, index };
    }

    addErrorToPower(powerTarget) {
        switch (this.powerErrorMode) {
            case PowerErrorMode.None:
                return powerTarget;

            case PowerErrorMode.Offset:
                return powerTarget + this.powerErrorOffset;

            case PowerErrorMode.Scale:
                return powerTarget * this.powerErrorScale;

            case PowerErrorMode.OffsetAndScale:
                return (powerTarget * this.powerErrorScale) + this.powerErrorOffset;

            case PowerErrorMode.Ranged:
                for (let i = 0; i < this.powerErrorRange.length; i++) {
                    if (powerTarget >= this.powerErrorRange[i].low && powerTarget < this.powerErrorRange[i].high)
                        return (powerTarget * this.powerErrorRange[i].scale) + this.powerErrorRange[i].offset;
                }
                return (powerTarget * this.powerErrorRange[ this.powerErrorRange.length-1].scale) + this.powerErrorRange[this.powerErrorRange.length-1].offset;

            default:
                return powerTarget;

        }


    }
}

const trainerMock = new TrainerMock();

export { trainerMock };
