const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const wav = require('node-wav');

// Musical note frequencies (A4 = 440 Hz)
const NOTE_FREQUENCIES = {
    'C': 261.63, 'C#': 277.18, 'Db': 277.18, 'D': 293.66, 'D#': 311.13, 'Eb': 311.13,
    'E': 329.63, 'F': 349.23, 'F#': 369.99, 'Gb': 369.99, 'G': 392.00, 'G#': 415.30, 'Ab': 415.30,
    'A': 440.00, 'A#': 466.16, 'Bb': 466.16, 'B': 493.88
};

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Add the missing convertToWav function
async function convertToWav(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat('wav')
            .audioCodec('pcm_s16le')
            .save(outputPath)
            .on('end', () => {
                console.log('Conversion completed:', outputPath);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('Conversion error:', err);
                reject(err);
            });
    });
}

async function generateWaveform(filePath) {
    try {
        console.log('generateWaveform called with:', filePath);
        console.log('File exists check:', fs.existsSync(filePath));
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
        }

        const ext = path.extname(filePath).toLowerCase();
        let processedFilePath = filePath;

        // Convert to WAV if the file is not already in WAV format
        if (ext !== '.wav') {
            const outputPath = path.join(path.dirname(filePath), `${path.basename(filePath, ext)}.wav`);
            console.log('Converting to WAV:', outputPath);
            processedFilePath = await convertToWav(filePath, outputPath);
        }

        // Read the WAV file
        const buffer = fs.readFileSync(processedFilePath);
        const result = wav.decode(buffer);
        
        // Get the first channel data
        const channelData = result.channelData[0];
        const sampleRate = result.sampleRate;
        
        // Downsample for visualization (take every nth sample for performance)
        const downsampleFactor = Math.max(1, Math.floor(channelData.length / 4000));
        const waveformData = [];
        
        for (let i = 0; i < channelData.length; i += downsampleFactor) {
            waveformData.push(channelData[i]);
        }

        // Format the waveform data for rendering
        const formattedWaveform = waveformData.map((value, index) => ({
            x: index,
            y: value,
        }));

        // Perform audio analysis
        console.log('Performing audio analysis...');
        const bpmAnalysis = detectBPM(channelData, sampleRate);
        const keyAnalysis = detectKey(channelData, sampleRate);
        const audioStats = calculateAudioStats(channelData, sampleRate);

        // Combine all analysis results
        const analysisResults = {
            waveform: formattedWaveform,
            bpm: bpmAnalysis,
            key: keyAnalysis,
            stats: audioStats,
            fileName: path.basename(filePath),
            fileSize: fs.statSync(processedFilePath).size
        };

        console.log('Analysis completed:', {
            bpm: bpmAnalysis.bpm,
            key: keyAnalysis.note,
            duration: audioStats.duration
        });

        return analysisResults;
    } catch (error) {
        console.error('Error in generateWaveform:', error);
        throw new Error(`Failed to generate waveform: ${error.message}`);
    }
}

// FFT implementation for frequency analysis
function fft(signal) {
    const N = signal.length;
    if (N <= 1) return signal;
    
    // Simple DFT for small arrays (not optimized FFT, but sufficient for our use)
    const result = new Array(N);
    for (let k = 0; k < N; k++) {
        let real = 0, imag = 0;
        for (let n = 0; n < N; n++) {
            const angle = -2 * Math.PI * k * n / N;
            real += signal[n] * Math.cos(angle);
            imag += signal[n] * Math.sin(angle);
        }
        result[k] = Math.sqrt(real * real + imag * imag);
    }
    return result;
}

// Detect BPM using onset detection and autocorrelation
function detectBPM(channelData, sampleRate) {
    try {
        // Simple onset detection using energy changes
        const frameSize = Math.floor(sampleRate * 0.1); // 100ms frames
        const hopSize = Math.floor(frameSize / 2);
        const energies = [];
        
        // Calculate energy for each frame
        for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
            let energy = 0;
            for (let j = 0; j < frameSize; j++) {
                energy += channelData[i + j] * channelData[i + j];
            }
            energies.push(energy);
        }
        
        // Find onset times (peaks in energy)
        const onsets = [];
        for (let i = 1; i < energies.length - 1; i++) {
            if (energies[i] > energies[i-1] && energies[i] > energies[i+1] && energies[i] > 0.001) {
                onsets.push(i * hopSize / sampleRate); // Convert to time
            }
        }
        
        if (onsets.length < 2) return { bpm: 0, confidence: 0 };
        
        // Calculate intervals between onsets
        const intervals = [];
        for (let i = 1; i < onsets.length; i++) {
            intervals.push(onsets[i] - onsets[i-1]);
        }
        
        // Find most common interval (simple mode detection)
        const intervalCounts = {};
        intervals.forEach(interval => {
            const rounded = Math.round(interval * 10) / 10; // Round to 0.1s
            intervalCounts[rounded] = (intervalCounts[rounded] || 0) + 1;
        });
        
        let mostCommonInterval = 0;
        let maxCount = 0;
        Object.entries(intervalCounts).forEach(([interval, count]) => {
            if (count > maxCount) {
                maxCount = count;
                mostCommonInterval = parseFloat(interval);
            }
        });
        
        if (mostCommonInterval > 0) {
            const bpm = Math.round(60 / mostCommonInterval);
            const confidence = maxCount / intervals.length;
            
            // Validate BPM range (60-200 BPM is typical for music)
            if (bpm >= 60 && bpm <= 200) {
                return { bpm, confidence };
            }
        }
        
        return { bpm: 0, confidence: 0 };
    } catch (error) {
        console.error('Error detecting BPM:', error);
        return { bpm: 0, confidence: 0 };
    }
}

// Detect dominant frequency and musical key
function detectKey(channelData, sampleRate) {
    try {
        // Use middle section of audio for key detection (avoid intro/outro)
        const startSample = Math.floor(channelData.length * 0.25);
        const endSample = Math.floor(channelData.length * 0.75);
        const segment = channelData.slice(startSample, endSample);
        
        // Apply window function to reduce spectral leakage
        const windowed = segment.map((sample, i) => {
            const windowValue = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / segment.length);
            return sample * windowValue;
        });
        
        // Perform FFT
        const spectrum = fft(windowed);
        const nyquist = sampleRate / 2;
        const freqBinSize = nyquist / (spectrum.length / 2);
        
        // Find dominant frequency
        let maxMagnitude = 0;
        let dominantFreq = 0;
        
        for (let i = 1; i < spectrum.length / 2; i++) {
            const frequency = i * freqBinSize;
            if (frequency > 80 && frequency < 2000 && spectrum[i] > maxMagnitude) {
                maxMagnitude = spectrum[i];
                dominantFreq = frequency;
            }
        }
        
        // Convert frequency to musical note
        if (dominantFreq > 0) {
            const A4 = 440;
            const C0 = A4 * Math.pow(2, -4.75); // C0 frequency
            
            if (dominantFreq > C0) {
                const halfSteps = Math.round(12 * Math.log2(dominantFreq / C0));
                const noteIndex = halfSteps % 12;
                const octave = Math.floor(halfSteps / 12);
                const note = NOTES[noteIndex];
                
                return {
                    dominantFreq: Math.round(dominantFreq * 100) / 100,
                    note: `${note}${octave}`,
                    noteOnly: note,
                    octave: octave,
                    confidence: maxMagnitude
                };
            }
        }
        
        return {
            dominantFreq: 0,
            note: 'Unknown',
            noteOnly: 'Unknown',
            octave: 0,
            confidence: 0
        };
    } catch (error) {
        console.error('Error detecting key:', error);
        return {
            dominantFreq: 0,
            note: 'Unknown',
            noteOnly: 'Unknown',
            octave: 0,
            confidence: 0
        };
    }
}

// Calculate audio statistics
function calculateAudioStats(channelData, sampleRate) {
    try {
        const length = channelData.length;
        const duration = length / sampleRate;
        
        // RMS (Root Mean Square) for perceived loudness
        let rmsSum = 0;
        for (let i = 0; i < length; i++) {
            rmsSum += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(rmsSum / length);
        
        // Peak amplitude
        let peak = 0;
        for (let i = 0; i < length; i++) {
            peak = Math.max(peak, Math.abs(channelData[i]));
        }
        
        // Dynamic range (difference between peak and average)
        const dynamicRange = peak - rms;
        
        // Zero crossing rate (measure of noisiness)
        let zeroCrossings = 0;
        for (let i = 1; i < length; i++) {
            if ((channelData[i] >= 0) !== (channelData[i-1] >= 0)) {
                zeroCrossings++;
            }
        }
        const zeroCrossingRate = zeroCrossings / duration;
        
        // Spectral centroid (measure of brightness)
        const frameSize = 2048;
        let spectralCentroid = 0;
        let frameCount = 0;
        
        for (let i = 0; i < length - frameSize; i += frameSize) {
            const frame = channelData.slice(i, i + frameSize);
            const spectrum = fft(frame);
            
            let weightedFreqSum = 0;
            let magnitudeSum = 0;
            
            for (let j = 0; j < spectrum.length / 2; j++) {
                const freq = j * sampleRate / frameSize;
                const magnitude = spectrum[j];
                weightedFreqSum += freq * magnitude;
                magnitudeSum += magnitude;
            }
            
            if (magnitudeSum > 0) {
                spectralCentroid += weightedFreqSum / magnitudeSum;
                frameCount++;
            }
        }
        
        spectralCentroid = frameCount > 0 ? spectralCentroid / frameCount : 0;
        
        return {
            duration: Math.round(duration * 100) / 100,
            rms: Math.round(rms * 1000) / 1000,
            peak: Math.round(peak * 1000) / 1000,
            dynamicRange: Math.round(dynamicRange * 1000) / 1000,
            zeroCrossingRate: Math.round(zeroCrossingRate),
            spectralCentroid: Math.round(spectralCentroid),
            sampleRate: sampleRate
        };
    } catch (error) {
        console.error('Error calculating audio stats:', error);
        return {
            duration: 0,
            rms: 0,
            peak: 0,
            dynamicRange: 0,
            zeroCrossingRate: 0,
            spectralCentroid: 0,
            sampleRate: sampleRate
        };
    }
}

// Export the function
module.exports = {
    generateWaveform
};