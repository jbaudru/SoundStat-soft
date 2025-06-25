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

// Optimized FFT implementation using Cooley-Tukey algorithm
function fft(signal) {
    const N = signal.length;
    if (N <= 1) return signal.map(x => Math.abs(x));
    
    // For small sizes, use simple DFT but limit size for speed
    if (N <= 256) {
        const result = new Array(N);
        const step = Math.max(1, Math.floor(N / 128)); // Downsample for speed
        for (let k = 0; k < N; k += step) {
            let real = 0, imag = 0;
            for (let n = 0; n < N; n += step) {
                const angle = -2 * Math.PI * k * n / N;
                real += signal[n] * Math.cos(angle);
                imag += signal[n] * Math.sin(angle);
            }
            result[k] = Math.sqrt(real * real + imag * imag);
        }
        return result.filter(x => x !== undefined);
    }
    
    // For larger arrays, use decimation-in-time FFT
    if (N % 2 !== 0) {
        // Pad to next power of 2 for efficiency
        const nextPow2 = Math.pow(2, Math.ceil(Math.log2(N)));
        const padded = [...signal, ...new Array(nextPow2 - N).fill(0)];
        return fft(padded).slice(0, N);
    }
    
    // Separate even and odd samples
    const even = new Array(N / 2);
    const odd = new Array(N / 2);
    for (let i = 0; i < N / 2; i++) {
        even[i] = signal[2 * i];
        odd[i] = signal[2 * i + 1];
    }
    
    // Recursive FFT
    const evenFFT = fft(even);
    const oddFFT = fft(odd);
    
    const result = new Array(N);
    for (let k = 0; k < N / 2; k++) {
        const angle = -2 * Math.PI * k / N;
        const tReal = Math.cos(angle) * oddFFT[k];
        const tImag = Math.sin(angle) * oddFFT[k];
        
        result[k] = evenFFT[k] + Math.sqrt(tReal * tReal + tImag * tImag);
        result[k + N / 2] = evenFFT[k] - Math.sqrt(tReal * tReal + tImag * tImag);
    }
    
    return result.map(x => Math.abs(x));
}

// Optimized progressive waveform generation
function generateProgressiveWaveform(channelData, chunkSize = 2000) {
    // Aggressive downsampling for speed - target 2000 points max
    const targetPoints = 2000;
    const downsampleFactor = Math.max(1, Math.floor(channelData.length / targetPoints));
    const sampledLength = Math.floor(channelData.length / downsampleFactor);
    const waveformData = new Array(sampledLength);
    
    // Single pass generation - no progressive chunks for speed
    for (let i = 0; i < sampledLength; i++) {
        const sourceIndex = i * downsampleFactor;
        waveformData[i] = {
            x: i,
            y: channelData[sourceIndex]
        };
    }
    
    // Send single waveform message
    parentPort.postMessage({
        type: 'waveform_progress',
        data: {
            chunk: waveformData,
            progress: 30,
            totalChunks: 1,
            currentChunk: 1
        }
    });
    
    return waveformData;
}

// Optimized BPM detection with reduced complexity
function detectBPM(channelData, sampleRate) {
    try {
        // Use smaller sample for speed - analyze only 30 seconds max
        const maxSamples = sampleRate * 30; // 30 seconds max
        const analysisData = channelData.length > maxSamples ? 
            channelData.slice(0, maxSamples) : channelData;
        
        // Larger frame size for fewer calculations
        const frameSize = Math.floor(sampleRate * 0.2); // 200ms frames
        const hopSize = frameSize; // No overlap for speed
        const energies = [];
        
        // Calculate energy for each frame (simplified)
        for (let i = 0; i < analysisData.length - frameSize; i += hopSize) {
            let energy = 0;
            // Sample every 4th point for speed
            for (let j = 0; j < frameSize; j += 4) {
                const sample = analysisData[i + j];
                energy += sample * sample;
            }
            energies.push(energy / (frameSize / 4)); // Normalize
        }
        
        if (energies.length < 3) return { bpm: 0, confidence: 0 };
        
        // Simplified peak detection with higher threshold
        const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
        const threshold = avgEnergy * 2; // Higher threshold for cleaner peaks
        const onsets = [];
        
        for (let i = 1; i < energies.length - 1; i++) {
            if (energies[i] > energies[i-1] && 
                energies[i] > energies[i+1] && 
                energies[i] > threshold) {
                onsets.push(i * hopSize / sampleRate);
            }
        }
        
        if (onsets.length < 2) return { bpm: 120, confidence: 0.1 }; // Default guess
        
        // Quick interval analysis - only consider most common intervals
        const intervals = [];
        for (let i = 1; i < Math.min(onsets.length, 20); i++) { // Limit to 20 onsets
            intervals.push(onsets[i] - onsets[i-1]);
        }
        
        // Simplified mode detection with coarser rounding
        const intervalCounts = {};
        intervals.forEach(interval => {
            const rounded = Math.round(interval * 5) / 5; // Round to 0.2s
            intervalCounts[rounded] = (intervalCounts[rounded] || 0) + 1;
        });
        
        let bestInterval = 0;
        let maxCount = 0;
        Object.entries(intervalCounts).forEach(([interval, count]) => {
            if (count > maxCount) {
                maxCount = count;
                bestInterval = parseFloat(interval);
            }
        });
        
        if (bestInterval > 0) {
            let bpm = Math.round(60 / bestInterval);
            const confidence = maxCount / intervals.length;
            
            // Handle common BPM multiples/divisions
            if (bpm < 60) bpm *= 2;
            if (bpm > 200) bpm /= 2;
            if (bpm < 60) bpm = 120; // Default fallback
            
            return { bpm: Math.round(bpm), confidence };
        }
        
        return { bpm: 120, confidence: 0.1 }; // Default fallback
    } catch (error) {
        console.error('Error detecting BPM:', error);
        return { bpm: 120, confidence: 0 };
    }
}

// Optimized key detection with reduced computational complexity
function detectKey(channelData, sampleRate) {
    try {
        // Use smaller segment for speed - 10 seconds max from middle
        const segmentDuration = Math.min(10, channelData.length / sampleRate); // 10 seconds max
        const segmentSamples = Math.floor(segmentDuration * sampleRate);
        const startSample = Math.floor((channelData.length - segmentSamples) / 2);
        const segment = channelData.slice(startSample, startSample + segmentSamples);
        
        // Downsample for speed if too long
        const maxLength = 8192; // Limit FFT size for speed
        const downsampleFactor = Math.max(1, Math.floor(segment.length / maxLength));
        const analysisSegment = [];
        for (let i = 0; i < segment.length; i += downsampleFactor) {
            analysisSegment.push(segment[i]);
        }
        
        // Quick windowing (simplified)
        const windowedLength = Math.min(analysisSegment.length, 4096); // Limit size
        const windowed = analysisSegment.slice(0, windowedLength).map((sample, i) => {
            const windowValue = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / windowedLength);
            return sample * windowValue;
        });
        
        // Perform optimized FFT
        const spectrum = fft(windowed);
        const effectiveSampleRate = sampleRate / downsampleFactor;
        const nyquist = effectiveSampleRate / 2;
        const freqBinSize = nyquist / (spectrum.length / 2);
        
        // Find dominant frequency with limited range
        let maxMagnitude = 0;
        let dominantFreq = 0;
        
        // Only check musically relevant frequencies (80-2000 Hz)
        const startBin = Math.floor(80 / freqBinSize);
        const endBin = Math.min(Math.floor(2000 / freqBinSize), spectrum.length / 2);
        
        for (let i = startBin; i < endBin; i++) {
            if (spectrum[i] > maxMagnitude) {
                maxMagnitude = spectrum[i];
                dominantFreq = i * freqBinSize;
            }
        }
        
        // Quick note conversion
        if (dominantFreq > 0) {
            const A4 = 440;
            const C0 = A4 * Math.pow(2, -4.75);
            
            if (dominantFreq > C0) {
                const halfSteps = Math.round(12 * Math.log2(dominantFreq / C0));
                const noteIndex = ((halfSteps % 12) + 12) % 12; // Ensure positive
                const octave = Math.floor(halfSteps / 12);
                const note = NOTES[noteIndex];
                
                return {
                    dominantFreq: Math.round(dominantFreq * 10) / 10, // Less precision for speed
                    note: `${note}${octave}`,
                    noteOnly: note,
                    octave: octave,
                    confidence: Math.min(maxMagnitude / 1000, 1) // Normalized confidence
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
// ...existing code...

// Remove the duplicate calculateAudioStats function (keep only one)
// Optimized audio statistics calculation
function calculateAudioStats(channelData, sampleRate) {
    try {
        const length = channelData.length;
        const duration = length / sampleRate;
        
        // Single pass for RMS and Peak calculation
        let rmsSum = 0;
        let peak = 0;
        let zeroCrossings = 0;
        let prevSample = channelData[0];
        
        // Sample every Nth point for speed on large files
        const step = Math.max(1, Math.floor(length / 50000)); // Max 50k samples
        
        for (let i = 0; i < length; i += step) {
            const sample = channelData[i];
            const absSample = Math.abs(sample);
            
            // RMS calculation
            rmsSum += sample * sample;
            
            // Peak calculation
            if (absSample > peak) peak = absSample;
            
            // Zero crossing calculation (simplified)
            if (i > 0 && (sample >= 0) !== (prevSample >= 0)) {
                zeroCrossings++;
            }
            prevSample = sample;
        }
        
        const samplesUsed = Math.floor(length / step);
        const rms = Math.sqrt(rmsSum / samplesUsed);
        const dynamicRange = peak - rms;
        const zeroCrossingRate = (zeroCrossings * step) / duration; // Adjust for sampling
        
        // Simplified spectral centroid calculation
        let spectralCentroid = 0;
        const maxFrames = 10; // Limit number of frames for speed
        const frameSize = Math.min(1024, Math.floor(length / maxFrames)); // Smaller frames
        const frameStep = Math.floor(length / maxFrames);
        
        for (let frameIndex = 0; frameIndex < maxFrames && frameIndex * frameStep + frameSize < length; frameIndex++) {
            const frameStart = frameIndex * frameStep;
            const frame = channelData.slice(frameStart, frameStart + frameSize);
            
            // Quick magnitude calculation (skip full FFT for speed)
            let weightedFreqSum = 0;
            let magnitudeSum = 0;
            
            // Simplified frequency analysis - just sample key frequencies
            for (let j = 1; j < frameSize / 4; j += 2) { // Sample every other bin
                const freq = j * sampleRate / frameSize;
                // Approximate magnitude without full FFT
                const magnitude = Math.abs(frame[j] || 0);
                weightedFreqSum += freq * magnitude;
                magnitudeSum += magnitude;
            }
            
            if (magnitudeSum > 0) {
                spectralCentroid += weightedFreqSum / magnitudeSum;
            }
        }
        
        spectralCentroid = maxFrames > 0 ? spectralCentroid / maxFrames : 0;
        
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

// Main processing function
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

        // Generate progressive waveform
        parentPort.postMessage({
            type: 'analysis_progress',
            data: { stage: 'Generating waveform', progress: 30 }
        });
        
        const waveformData = generateProgressiveWaveform(channelData);

        // Calculate basic stats and send immediately
        parentPort.postMessage({
            type: 'analysis_progress',
            data: { stage: 'Audio Statistics', progress: 50 }
        });
        
        const stats = calculateAudioStats(channelData, sampleRate);
        
        // Send stats immediately without waiting
        parentPort.postMessage({
            type: 'partial_results',
            data: { stats }
        });

        // Detect BPM (moved before key detection)
        parentPort.postMessage({
            type: 'analysis_progress',
            data: { stage: 'BPM Detection', progress: 70 }
        });
        
        const bpmResult = detectBPM(channelData, sampleRate);
        parentPort.postMessage({
            type: 'partial_results',
            data: { bpm: bpmResult }
        });

        // Key Detection moved to the end (most time-consuming)
        parentPort.postMessage({
            type: 'analysis_progress',
            data: { stage: 'Key Detection', progress: 80 }
        });
        
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

// Start processing
processAudioFile();