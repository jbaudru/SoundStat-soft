const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const wav = require('node-wav');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { exec } = require('child_process');
const FFmpegInstaller = require('./ffmpegInstaller');

// Musical note frequencies (A4 = 440 Hz)
const NOTE_FREQUENCIES = {
    'C': 261.63, 'C#': 277.18, 'Db': 277.18, 'D': 293.66, 'D#': 311.13, 'Eb': 311.13,
    'E': 329.63, 'F': 349.23, 'F#': 369.99, 'Gb': 369.99, 'G': 392.00, 'G#': 415.30, 'Ab': 415.30,
    'A': 440.00, 'A#': 466.16, 'Bb': 466.16, 'B': 493.88
};

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Check if FFmpeg is available
async function checkFFmpegAvailability() {
    const installer = new FFmpegInstaller();
    
    return new Promise((resolve) => {
        // First try to set FFmpeg path if locally installed
        const localPath = installer.getFFmpegPath();
        if (localPath && fs.existsSync(localPath)) {
            console.log('Found local FFmpeg at:', localPath);
            ffmpeg.setFfmpegPath(localPath);
            // Test if fluent-ffmpeg can actually use it
            ffmpeg.getAvailableFormats((err, formats) => {
                if (err) {
                    console.log('Local FFmpeg not working:', err.message);
                    resolve(false);
                } else {
                    console.log('Local FFmpeg working');
                    resolve(true);
                }
            });
            return;
        }
        
        // Try to find FFmpeg in common Windows locations
        const commonPaths = [
            'ffmpeg',
            'ffmpeg.exe',
            path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ffmpeg', 'bin', 'ffmpeg.exe'),
            path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'ffmpeg', 'bin', 'ffmpeg.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'ffmpeg', 'bin', 'ffmpeg.exe'),
            'C:\\ffmpeg\\bin\\ffmpeg.exe'
        ];
        
        // Test each potential path
        let pathIndex = 0;
        const testNextPath = () => {
            if (pathIndex >= commonPaths.length) {
                console.log('FFmpeg not found in any common locations. Only WAV files will be supported.');
                resolve(false);
                return;
            }
            
            const testPath = commonPaths[pathIndex];
            pathIndex++;
            
            // For bare commands, test with exec first
            if (testPath === 'ffmpeg' || testPath === 'ffmpeg.exe') {
                exec(`${testPath} -version`, (error, stdout) => {
                    if (error) {
                        testNextPath();
                    } else {
                        // Found in PATH, now test with fluent-ffmpeg
                        ffmpeg.setFfmpegPath(testPath);
                        ffmpeg.getAvailableFormats((err, formats) => {
                            if (err) {
                                console.log(`FFmpeg found in PATH but fluent-ffmpeg cannot use it: ${err.message}`);
                                testNextPath();
                            } else {
                                console.log('FFmpeg found and working');
                                resolve(true);
                            }
                        });
                    }
                });
            } else {
                // For full paths, check if file exists first
                if (fs.existsSync(testPath)) {
                    ffmpeg.setFfmpegPath(testPath);
                    ffmpeg.getAvailableFormats((err, formats) => {
                        if (err) {
                            console.log(`FFmpeg found at ${testPath} but cannot use it: ${err.message}`);
                            testNextPath();
                        } else {
                            console.log(`FFmpeg found and working at: ${testPath}`);
                            resolve(true);
                        }
                    });
                } else {
                    testNextPath();
                }
            }
        };
        
        testNextPath();
    });
}

// Convert audio file to WAV format
async function convertToWav(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat('wav')
            .audioCodec('pcm_s16le')
            .audioChannels(1) // Convert to mono to simplify processing
            .audioFrequency(44100) // Standard sample rate
            .save(outputPath)
            .on('end', () => {
                console.log('Conversion completed:', outputPath);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('Conversion error:', err);
                reject(new Error(`FFmpeg conversion failed: ${err.message}. Please ensure FFmpeg is installed and accessible.`));
            });
    });
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

// Progressive waveform generation
function generateProgressiveWaveform(channelData, chunkSize = 1000) {
    const downsampleFactor = Math.max(1, Math.floor(channelData.length / 4000));
    const totalChunks = Math.ceil(channelData.length / (chunkSize * downsampleFactor));
    const waveformData = [];
    
    for (let chunk = 0; chunk < totalChunks; chunk++) {
        const startIdx = chunk * chunkSize * downsampleFactor;
        const endIdx = Math.min(startIdx + chunkSize * downsampleFactor, channelData.length);
        
        const chunkData = [];
        for (let i = startIdx; i < endIdx; i += downsampleFactor) {
            chunkData.push({
                x: Math.floor(i / downsampleFactor),
                y: channelData[i]
            });
        }
        
        waveformData.push(...chunkData);
        
        // Send progressive waveform update
        parentPort.postMessage({
            type: 'waveform_progress',
            data: {
                chunk: chunkData,
                progress: ((chunk + 1) / totalChunks) * 30, // 30% of total progress
                totalChunks,
                currentChunk: chunk + 1
            }
        });
    }
    
    return waveformData;
}

// Detect BPM using onset detection and autocorrelation
function detectBPM(channelData, sampleRate) {
    try {
        parentPort.postMessage({
            type: 'analysis_progress',
            data: { stage: 'BPM Detection', progress: 40 }
        });

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
        parentPort.postMessage({
            type: 'analysis_progress',
            data: { stage: 'Key Detection', progress: 60 }
        });

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
        parentPort.postMessage({
            type: 'analysis_progress',
            data: { stage: 'Audio Statistics', progress: 80 }
        });

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

// ...existing code...
async function processAudioFile() {
    try {
        const { filePath } = workerData;
        
        parentPort.postMessage({
            type: 'analysis_progress',
            data: { stage: 'Initializing', progress: 5 }
        });

        // Check if FFmpeg is available
        const ffmpegAvailable = await checkFFmpegAvailability();
        
        let wavPath = filePath;
        const fileExtension = path.extname(filePath).toLowerCase();
        
        // If file is not WAV and FFmpeg is not available, throw error
        if (fileExtension !== '.wav' && !ffmpegAvailable) {
            throw new Error(`File format ${fileExtension} not supported without FFmpeg. Please install FFmpeg or use WAV files only.`);
        }
        
        // Convert to WAV if needed and FFmpeg is available
        if (fileExtension !== '.wav' && ffmpegAvailable) {
            parentPort.postMessage({
                type: 'analysis_progress',
                data: { stage: 'Converting to WAV', progress: 10 }
            });
            
            const tempWavPath = path.join(path.dirname(filePath), 'temp_' + Date.now() + '.wav');
            wavPath = await convertToWav(filePath, tempWavPath);
        }

        // Read WAV file
        parentPort.postMessage({
            type: 'analysis_progress',
            data: { stage: 'Reading audio data', progress: 20 }
        });

        if (!fs.existsSync(wavPath)) {
            throw new Error(`WAV file not found: ${wavPath}`);
        }

        const buffer = fs.readFileSync(wavPath);
        const audioData = wav.decode(buffer);
        
        if (!audioData || !audioData.channelData || audioData.channelData.length === 0) {
            throw new Error('Invalid or empty audio data');
        }

        const channelData = audioData.channelData[0]; // Use first channel
        const sampleRate = audioData.sampleRate;

        // Calculate basic stats first
        const stats = calculateAudioStats(channelData, sampleRate);
        
        parentPort.postMessage({
            type: 'partial_results',
            data: { stats }
        });

        // Generate progressive waveform
        parentPort.postMessage({
            type: 'analysis_progress',
            data: { stage: 'Generating waveform', progress: 30 }
        });
        
        const waveformData = generateProgressiveWaveform(channelData);

        // Detect BPM
        const bpmResult = detectBPM(channelData, sampleRate);
        parentPort.postMessage({
            type: 'partial_results',
            data: { bpm: bpmResult }
        });

        // Detect Key
        const keyResult = detectKey(channelData, sampleRate);
        parentPort.postMessage({
            type: 'partial_results',
            data: { key: keyResult }
        });

        // Final completion
        parentPort.postMessage({
            type: 'analysis_progress',
            data: { stage: 'Finalizing', progress: 100 }
        });

        const finalResults = {
            waveform: waveformData,
            bpm: bpmResult,
            key: keyResult,
            stats: stats
        };

        parentPort.postMessage({
            type: 'complete',
            data: finalResults
        });

        // Clean up temporary file
        if (wavPath !== filePath && fs.existsSync(wavPath)) {
            try {
                fs.unlinkSync(wavPath);
            } catch (cleanupError) {
                console.log('Could not clean up temporary file:', cleanupError.message);
            }
        }

    } catch (error) {
        console.error('Worker processing error:', error);
        parentPort.postMessage({
            type: 'error',
            error: error.message
        });
    }
}
// ...existing code...

// Start processing
processAudioFile();
