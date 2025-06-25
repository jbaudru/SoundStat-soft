const fs = require('fs')
const path = require('path')
const extractPeaks = require('webaudio-peaks');
const AudioContext = require('web-audio-api').AudioContext

if (process.argv.length > 2) {
    const context = new AudioContext()
    const fileName = process.argv[2]

    fs.readFile(path.resolve(__dirname, fileName), function (err, buf) {
        if (err) throw err
        context.decodeAudioData(toArrayBuffer(buf), function (audioBuffer) {
            if (audioBuffer.length) {
                const samplesPerPixel = 10000
                const sampleRate = 44100
                // extract peaks with AudioContext for now.
                const peaks = calculatePeaks(audioBuffer, samplesPerPixel, sampleRate);
                console.log(JSON.stringify(peaks))
            }
    
        }, function (err) {
            throw err
        })
    })
} else {
    console.log("Usage: waveform-generator <filename.mp3>")
}

process.on('uncaughtException', (err) => {
    console.error(err.message)
});
  

function calculatePeaks(buffer, samplesPerPixel, sampleRate) {
    const peakData = {
        type: 'WebAudio',
        mono: false,
    };

    const cueIn = secondsToSamples(0, sampleRate);
    const cueOut = secondsToSamples(buffer.duration, sampleRate);
    return extractPeaks(buffer, samplesPerPixel, peakData.mono, cueIn, cueOut);
}

function toArrayBuffer(buf) {
    var ab = new ArrayBuffer(buf.length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buf.length; ++i) {
        view[i] = buf[i];
    }
    return ab;
}

function samplesToSeconds(samples, sampleRate) {
    return samples / sampleRate;
}

function secondsToSamples(seconds, sampleRate) {
    return Math.ceil(seconds * sampleRate);
}

function samplesToPixels(samples, resolution) {
    return Math.floor(samples / resolution);
}

function pixelsToSamples(pixels, resolution) {
    return Math.floor(pixels * resolution);
}

function pixelsToSeconds(pixels, resolution, sampleRate) {
    return (pixels * resolution) / sampleRate;
}

function secondsToPixels(seconds, resolution, sampleRate) {
    return Math.ceil((seconds * sampleRate) / resolution);
}

