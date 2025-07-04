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

// Precise FFT implementation using Cooley-Tukey algorithm
function fft(signal) {
    const N = signal.length;
    if (N <= 1) return signal.map(x => ({ real: x, imag: 0 }));
    
    // Ensure N is power of 2 for efficiency
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(N)));
    if (N !== nextPow2) {
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
        const tReal = Math.cos(angle) * oddFFT[k].real - Math.sin(angle) * oddFFT[k].imag;
        const tImag = Math.cos(angle) * oddFFT[k].imag + Math.sin(angle) * oddFFT[k].real;
        
        result[k] = {
            real: evenFFT[k].real + tReal,
            imag: evenFFT[k].imag + tImag
        };
        result[k + N / 2] = {
            real: evenFFT[k].real - tReal,
            imag: evenFFT[k].imag - tImag
        };
    }
    
    return result;
}

// Get magnitude spectrum from complex FFT result
function getMagnitudeSpectrum(complexSpectrum) {
    return complexSpectrum.map(c => Math.sqrt(c.real * c.real + c.imag * c.imag));
}

// Optimized progressive waveform generation
function generateProgressiveWaveform(channelData, chunkSize = 2000) {
    // Aggressive downsampling for speed - target 2000 points max
    const targetPoints = 4000;
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



// Enhanced onset detection optimized for small sounds and short segments
function detectOnsets(channelData, sampleRate) {
    // Adaptive frame size based on audio length for better precision with small sounds
    const audioDuration = channelData.length / sampleRate;
    let frameSize, hopSize;
    
    if (audioDuration < 2) {
        // For very short audio (< 2 seconds), use smaller frames for higher temporal resolution
        frameSize = 256;
        hopSize = 64; // 75% overlap for maximum precision
    } else if (audioDuration < 10) {
        // For short audio (2-10 seconds), use medium frames
        frameSize = 512;
        hopSize = 128; // 75% overlap
    } else {
        // For longer audio, use standard frames
        frameSize = 1024;
        hopSize = 256; // 75% overlap for better precision
    }
    
    const numFrames = Math.floor((channelData.length - frameSize) / hopSize) + 1;
    
    // Enhanced pre-emphasis with adaptive coefficient based on audio characteristics
    const preEmphasized = new Array(channelData.length);
    preEmphasized[0] = channelData[0];
    
    // Calculate dynamic range to adjust pre-emphasis
    let maxAmp = 0;
    let avgAmp = 0;
    for (let i = 0; i < channelData.length; i++) {
        const abs = Math.abs(channelData[i]);
        maxAmp = Math.max(maxAmp, abs);
        avgAmp += abs;
    }
    avgAmp /= channelData.length;
    
    // Adaptive pre-emphasis coefficient (stronger for quieter sounds)
    const preEmphasisCoeff = Math.min(0.98, 0.95 + (0.03 * (1 - avgAmp / maxAmp)));
    
    for (let i = 1; i < channelData.length; i++) {
        preEmphasized[i] = channelData[i] - preEmphasisCoeff * channelData[i - 1];
    }
    
    const onsets = [];
    let previousSpectrum = null;
    let previousPhase = null;
    
    // Create optimized window (Blackman-Harris for better frequency resolution)
    const window = new Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
        const n = i / (frameSize - 1);
        window[i] = 0.35875 - 0.48829 * Math.cos(2 * Math.PI * n) + 
                   0.14128 * Math.cos(4 * Math.PI * n) - 0.01168 * Math.cos(6 * Math.PI * n);
    }
    
    for (let frameIndex = 0; frameIndex < numFrames; frameIndex++) {
        const frameStart = frameIndex * hopSize;
        const frame = new Array(frameSize);
        
        // Extract and window the frame with zero-padding
        for (let i = 0; i < frameSize; i++) {
            const sampleIndex = frameStart + i;
            if (sampleIndex < preEmphasized.length) {
                frame[i] = preEmphasized[sampleIndex] * window[i];
            } else {
                frame[i] = 0;
            }
        }
        
        // Compute FFT and get both magnitude and phase
        const complexSpectrum = fft(frame);
        const magnitude = getMagnitudeSpectrum(complexSpectrum);
        const phase = complexSpectrum.map(c => Math.atan2(c.imag, c.real));
        
        // Calculate multiple onset detection features
        if (previousSpectrum !== null && previousPhase !== null) {
            let spectralFlux = 0;
            let complexFlux = 0;
            let phaseDeviation = 0;
            let highFreqContent = 0;
            
            // Adaptive frequency range based on audio content
            const minBin = Math.floor(30 * frameSize / sampleRate); // Lower for small sounds
            const maxBin = Math.min(Math.floor(4000 * frameSize / sampleRate), magnitude.length / 2);
            
            for (let bin = minBin; bin < maxBin; bin++) {
                // Spectral flux (positive energy increase)
                const magDiff = magnitude[bin] - previousSpectrum[bin];
                spectralFlux += Math.max(0, magDiff);
                
                // Complex domain flux (considers both magnitude and phase)
                const realDiff = complexSpectrum[bin].real - 
                               (previousSpectrum[bin] * Math.cos(previousPhase[bin]));
                const imagDiff = complexSpectrum[bin].imag - 
                               (previousSpectrum[bin] * Math.sin(previousPhase[bin]));
                complexFlux += Math.sqrt(realDiff * realDiff + imagDiff * imagDiff);
                
                // Phase deviation detection
                let phaseDiff = phase[bin] - previousPhase[bin];
                // Unwrap phase difference
                while (phaseDiff > Math.PI) phaseDiff -= 2 * Math.PI;
                while (phaseDiff < -Math.PI) phaseDiff += 2 * Math.PI;
                phaseDeviation += Math.abs(phaseDiff) * magnitude[bin];
                
                // High frequency content (weighted by frequency)
                if (bin > maxBin * 0.7) {
                    highFreqContent += magnitude[bin] * (bin / maxBin);
                }
            }
            
            const timeStamp = frameStart / sampleRate;
            
            // Combine multiple features for robust onset detection
            const combinedFlux = spectralFlux * 0.4 + complexFlux * 0.3 + 
                               phaseDeviation * 0.2 + highFreqContent * 0.1;
            
            onsets.push({
                time: timeStamp,
                flux: combinedFlux,
                spectralFlux: spectralFlux,
                complexFlux: complexFlux,
                phaseDeviation: phaseDeviation,
                highFreqContent: highFreqContent,
                magnitude: magnitude.slice(minBin, maxBin).reduce((sum, val) => sum + val, 0),
                centroid: calculateSpectralCentroid(magnitude, minBin, maxBin, sampleRate, frameSize)
            });
        }
        
        previousSpectrum = magnitude;
        previousPhase = phase;
    }
    
    return onsets;
}

// Calculate spectral centroid for each frame
function calculateSpectralCentroid(magnitude, minBin, maxBin, sampleRate, frameSize) {
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let bin = minBin; bin < maxBin; bin++) {
        const freq = bin * sampleRate / frameSize;
        weightedSum += freq * magnitude[bin];
        magnitudeSum += magnitude[bin];
    }
    
    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
}

// Enhanced peak picking with multi-level adaptive thresholding for small sounds
function pickOnsetPeaks(onsets) {
    if (onsets.length < 3) return onsets; // Return all onsets if very few
    
    // Calculate multiple statistical measures for adaptive thresholding
    const fluxValues = onsets.map(o => o.flux).sort((a, b) => a - b);
    const spectralFluxValues = onsets.map(o => o.spectralFlux || o.flux).sort((a, b) => a - b);
    
    const medianFlux = fluxValues[Math.floor(fluxValues.length / 2)];
    const q75Flux = fluxValues[Math.floor(fluxValues.length * 0.75)];
    const q90Flux = fluxValues[Math.floor(fluxValues.length * 0.9)];
    const maxFlux = Math.max(...fluxValues);
    
    // Adaptive threshold based on signal characteristics
    let threshold;
    const dynamicRange = maxFlux - medianFlux;
    
    if (dynamicRange < medianFlux * 0.5) {
        // Low dynamic range (quiet/small sounds) - use lower threshold
        threshold = medianFlux * 0.8;
    } else if (onsets.length < 20) {
        // Short audio - be more sensitive
        threshold = Math.min(medianFlux * 1.2, q75Flux);
    } else {
        // Standard threshold for longer audio
        threshold = Math.min(medianFlux * 1.5, q90Flux * 0.8);
    }
    
    const peaks = [];
    const minInterval = onsets.length < 50 ? 0.02 : 0.05; // Shorter intervals for small sounds
    
    // Multi-pass peak detection
    for (let pass = 0; pass < 2; pass++) {
        const currentThreshold = pass === 0 ? threshold : threshold * 0.7; // Second pass with lower threshold
        const windowSize = pass === 0 ? 4 : 2; // Smaller window in second pass
        
        for (let i = windowSize; i < onsets.length - windowSize; i++) {
            const onset = onsets[i];
            
            // Check if this is a local maximum above threshold
            let isLocalMax = onset.flux > currentThreshold;
            
            for (let j = 1; j <= windowSize && isLocalMax; j++) {
                if (onset.flux <= onsets[i - j].flux || onset.flux <= onsets[i + j].flux) {
                    isLocalMax = false;
                }
            }
            
            if (isLocalMax) {
                // Additional validation using multiple features
                const hasHighFreqContent = onset.highFreqContent > 0;
                const hasPhaseChange = onset.phaseDeviation > onset.flux * 0.1;
                const hasSpectralChange = onset.spectralFlux > onset.flux * 0.3;
                
                // For small sounds, be more lenient with validation
                const validationScore = (hasHighFreqContent ? 1 : 0) + 
                                      (hasPhaseChange ? 1 : 0) + 
                                      (hasSpectralChange ? 1 : 0);
                const minValidation = onsets.length < 20 ? 1 : 2;
                
                if (validationScore >= minValidation) {
                    // Ensure minimum time gap between peaks
                    let tooClose = false;
                    for (const existingPeak of peaks) {
                        if (Math.abs(onset.time - existingPeak.time) < minInterval) {
                            // If new peak is stronger, replace the old one
                            if (onset.flux > existingPeak.flux) {
                                const index = peaks.indexOf(existingPeak);
                                peaks.splice(index, 1);
                            } else {
                                tooClose = true;
                            }
                            break;
                        }
                    }
                    
                    if (!tooClose) {
                        peaks.push(onset);
                    }
                }
            }
        }
    }
    
    // Sort peaks by time
    peaks.sort((a, b) => a.time - b.time);
    
    // If we still have very few peaks for short audio, add some weaker ones
    if (peaks.length < 4 && onsets.length > 10) {
        const weakerPeaks = [];
        const veryLowThreshold = threshold * 0.4;
        
        for (let i = 2; i < onsets.length - 2; i++) {
            const onset = onsets[i];
            if (onset.flux > veryLowThreshold &&
                onset.flux > onsets[i-1].flux &&
                onset.flux > onsets[i+1].flux) {
                
                let tooClose = false;
                for (const existingPeak of peaks) {
                    if (Math.abs(onset.time - existingPeak.time) < minInterval * 2) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) {
                    weakerPeaks.push(onset);
                }
            }
        }
        
        // Add the strongest weaker peaks
        weakerPeaks.sort((a, b) => b.flux - a.flux);
        peaks.push(...weakerPeaks.slice(0, Math.min(3, weakerPeaks.length)));
        peaks.sort((a, b) => a.time - b.time);
    }
    
    return peaks;
}

// Enhanced tempo estimation with higher resolution for small sounds
function estimateTempoFromOnsets(peaks, sampleRate) {
    if (peaks.length < 3) return null; // Reduced minimum requirement
    
    // Create onset strength signal with higher resolution for small sounds
    const duration = peaks[peaks.length - 1].time - peaks[0].time;
    const resolution = duration < 5 ? 0.005 : 0.01; // Higher resolution for short audio
    const signalLength = Math.floor(duration / resolution);
    
    if (signalLength < 10) return null;
    
    const onsetSignal = new Array(signalLength).fill(0);
    
    // Fill onset signal with interpolation for better accuracy
    for (const peak of peaks) {
        const exactIndex = (peak.time - peaks[0].time) / resolution;
        const lowerIndex = Math.floor(exactIndex);
        const upperIndex = Math.ceil(exactIndex);
        const fraction = exactIndex - lowerIndex;
        
        if (lowerIndex >= 0 && lowerIndex < signalLength) {
            onsetSignal[lowerIndex] += peak.flux * (1 - fraction);
        }
        if (upperIndex >= 0 && upperIndex < signalLength && upperIndex !== lowerIndex) {
            onsetSignal[upperIndex] += peak.flux * fraction;
        }
    }
    
    // Enhanced autocorrelation with wider tempo range for small sounds
    const minLag = Math.floor(0.25 / resolution); // ~240 BPM max
    const maxLag = Math.floor(3.0 / resolution);  // ~20 BPM min
    const autocorr = new Array(maxLag - minLag + 1);
    
    // Calculate autocorrelation with normalization
    for (let lag = minLag; lag <= maxLag; lag++) {
        let correlation = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < signalLength - lag; i++) {
            correlation += onsetSignal[i] * onsetSignal[i + lag];
            norm1 += onsetSignal[i] * onsetSignal[i];
            norm2 += onsetSignal[i + lag] * onsetSignal[i + lag];
        }
        
        // Normalized correlation coefficient
        const normalization = Math.sqrt(norm1 * norm2);
        autocorr[lag - minLag] = normalization > 0 ? correlation / normalization : 0;
    }
    
    // Find multiple peaks in autocorrelation for robustness
    const corrPeaks = [];
    for (let i = 2; i < autocorr.length - 2; i++) {
        if (autocorr[i] > autocorr[i-1] && autocorr[i] > autocorr[i+1] &&
            autocorr[i] > autocorr[i-2] && autocorr[i] > autocorr[i+2] &&
            autocorr[i] > 0.1) { // Minimum correlation threshold
            
            const lag = minLag + i;
            const period = lag * resolution;
            const bpm = 60 / period;
            
            if (bpm >= 20 && bpm <= 240) {
                corrPeaks.push({
                    lag: lag,
                    correlation: autocorr[i],
                    period: period,
                    bpm: bpm
                });
            }
        }
    }
    
    if (corrPeaks.length === 0) return null;
    
    // Sort by correlation strength
    corrPeaks.sort((a, b) => b.correlation - a.correlation);
    
    // Use the strongest correlation peak
    const best = corrPeaks[0];
    
    // Refine the tempo using parabolic interpolation for sub-sample precision
    const lagIndex = best.lag - minLag;
    if (lagIndex > 0 && lagIndex < autocorr.length - 1) {
        const y1 = autocorr[lagIndex - 1];
        const y2 = autocorr[lagIndex];
        const y3 = autocorr[lagIndex + 1];
        
        // Parabolic interpolation
        const a = (y1 - 2*y2 + y3) / 2;
        const b = (y3 - y1) / 2;
        
        if (Math.abs(a) > 1e-10) {
            const refinedOffset = -b / (2 * a);
            const refinedLag = best.lag + refinedOffset;
            const refinedPeriod = refinedLag * resolution;
            const refinedBPM = 60 / refinedPeriod;
            
            if (refinedBPM >= 20 && refinedBPM <= 240) {
                return {
                    bpm: refinedBPM,
                    confidence: best.correlation,
                    period: refinedPeriod,
                    refined: true
                };
            }
        }
    }
    
    return {
        bpm: best.bpm,
        confidence: best.correlation,
        period: best.period,
        refined: false
    };
}

// Multiple hypothesis tempo tracking
function trackMultipleTempos(peaks) {
    const tempos = new Map();
    
    // Analyze intervals between consecutive peaks
    for (let i = 1; i < peaks.length; i++) {
        const interval = peaks[i].time - peaks[i - 1].time;
        
        // Convert to BPM and consider multiple tempo relationships
        const baseBPM = 60 / interval;
        const candidates = [
            baseBPM,       // Original tempo
            baseBPM * 2,   // Double time
            baseBPM / 2,   // Half time
            baseBPM * 3,   // Triple time
            baseBPM / 3,   // Third time
            baseBPM * 1.5, // 3/2 relationship
            baseBPM / 1.5  // 2/3 relationship
        ];
        
        candidates.forEach(candidate => {
            if (candidate >= 40 && candidate <= 200) {
                const rounded = Math.round(candidate * 2) / 2; // 0.5 BPM precision
                const weight = peaks[i].flux * peaks[i - 1].flux;
                
                if (!tempos.has(rounded)) {
                    tempos.set(rounded, { score: 0, count: 0 });
                }
                
                tempos.get(rounded).score += weight;
                tempos.get(rounded).count += 1;
            }
        });
    }
    
    // Score tempo candidates
    const candidates = Array.from(tempos.entries()).map(([bpm, data]) => ({
        bpm,
        score: data.score * Math.log(data.count + 1), // Favor frequently occurring tempos
        count: data.count
    }));
    
    return candidates.sort((a, b) => b.score - a.score);
}

// Ultra-precise BPM detection with multiple advanced techniques
function detectBPM(channelData, sampleRate) {
    try {
        console.log('Starting ultra-precise BPM analysis...');
        
        // Use optimal segment length - 60 seconds for good statistical analysis
        const maxSamples = sampleRate * 60;
        const analysisData = channelData.length > maxSamples ? 
            channelData.slice(0, maxSamples) : channelData;
        
        if (analysisData.length < sampleRate * 5) { // Need at least 5 seconds
            return { bpm: 120, confidence: 0.1 };
        }
        
        // Step 1: Onset detection using spectral flux
        console.log('Detecting onsets...');
        const onsets = detectOnsets(analysisData, sampleRate);
        
        if (onsets.length < 10) {
            return { bpm: 120, confidence: 0.1 };
        }
        
        // Step 2: Peak picking to find significant onsets
        console.log('Picking onset peaks...');
        const peaks = pickOnsetPeaks(onsets);
        
        if (peaks.length < 8) {
            return { bpm: 120, confidence: 0.2 };
        }
        
        // Step 3: Autocorrelation-based tempo estimation
        console.log('Estimating tempo using autocorrelation...');
        const autocorrResult = estimateTempoFromOnsets(peaks, sampleRate);
        
        // Step 4: Multiple hypothesis tempo tracking
        console.log('Multiple hypothesis tempo tracking...');
        const tempoCandidates = trackMultipleTempos(peaks);
        
        if (tempoCandidates.length === 0 && !autocorrResult) {
            return { bpm: 120, confidence: 0.1 };
        }
        
        // Step 5: Combine results from different methods
        let bestBPM = 120;
        let bestConfidence = 0.1;
        
        if (autocorrResult && tempoCandidates.length > 0) {
            // Weight autocorrelation result with interval analysis
            const autocorrBPM = autocorrResult.bpm;
            const intervalBPM = tempoCandidates[0].bpm;
            
            // Find the closest match or average if they're close
            if (Math.abs(autocorrBPM - intervalBPM) < 5) {
                bestBPM = (autocorrBPM * autocorrResult.confidence + intervalBPM * 0.7) / 
                         (autocorrResult.confidence + 0.7);
                bestConfidence = Math.min(0.9, autocorrResult.confidence * 0.8 + 0.2);
            } else {
                // Use the more confident result
                if (autocorrResult.confidence > 0.3) {
                    bestBPM = autocorrBPM;
                    bestConfidence = autocorrResult.confidence;
                } else {
                    bestBPM = intervalBPM;
                    bestConfidence = Math.min(0.7, tempoCandidates[0].score / 10000);
                }
            }
        } else if (autocorrResult) {
            bestBPM = autocorrResult.bpm;
            bestConfidence = autocorrResult.confidence;
        } else if (tempoCandidates.length > 0) {
            bestBPM = tempoCandidates[0].bpm;
            bestConfidence = Math.min(0.6, tempoCandidates[0].score / 10000);
        }
        
        // Step 6: Validate against common musical tempos
        const commonTempos = [60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180];
        let closestCommon = null;
        let minDistance = Infinity;
        
        for (const tempo of commonTempos) {
            const distance = Math.abs(bestBPM - tempo);
            if (distance < minDistance) {
                minDistance = distance;
                closestCommon = tempo;
            }
        }
        
        // If very close to a common tempo, snap to it
        if (minDistance < 3 && bestConfidence > 0.4) {
            bestBPM = closestCommon;
            bestConfidence = Math.min(1.0, bestConfidence * 1.1);
        }
        
        // Step 7: Final refinement using beat tracking
        console.log('Final beat tracking refinement...');
        const refinedBPM = refineTempoWithBeatTracking(bestBPM, peaks, analysisData.length / sampleRate);
        
        // Ensure reasonable bounds
        bestBPM = Math.max(40, Math.min(200, refinedBPM));
        bestConfidence = Math.max(0.1, Math.min(1.0, bestConfidence));
        
        console.log(`Ultra-precise BPM analysis complete: ${bestBPM.toFixed(1)} BPM (confidence: ${bestConfidence.toFixed(3)})`);
        
        return { 
            bpm: Math.round(bestBPM * 10) / 10, // One decimal place precision
            confidence: bestConfidence 
        };
        
    } catch (error) {
        console.error('Error in ultra-precise BPM detection:', error);
        return { bpm: 120, confidence: 0 };
    }
}

// Beat tracking refinement
function refineTempoWithBeatTracking(initialBPM, peaks, duration) {
    if (peaks.length < 8) return initialBPM;
    
    // Test small variations around the initial BPM
    const testRange = 5; // Test ±5 BPM
    const stepSize = 0.2;
    let bestBPM = initialBPM;
    let bestScore = 0;
    
    for (let testBPM = initialBPM - testRange; testBPM <= initialBPM + testRange; testBPM += stepSize) {
        if (testBPM < 40 || testBPM > 200) continue;
        
        const beatPeriod = 60 / testBPM;
        const tolerance = beatPeriod * 0.15; // 15% tolerance
        let score = 0;
        let expectedBeats = Math.floor(duration / beatPeriod);
        
        // Score how well peaks align with this tempo
        for (let beatIndex = 0; beatIndex < expectedBeats; beatIndex++) {
            const expectedTime = beatIndex * beatPeriod;
            let bestMatch = 0;
            
            // Find the closest peak to this expected beat time
            for (const peak of peaks) {
                const timeDiff = Math.abs(peak.time - expectedTime);
                if (timeDiff <= tolerance) {
                    const proximity = 1 - (timeDiff / tolerance);
                    const strength = Math.log(1 + peak.flux);
                    bestMatch = Math.max(bestMatch, proximity * strength);
                }
            }
            score += bestMatch;
        }
        
        // Normalize by number of expected beats
        score = expectedBeats > 0 ? score / expectedBeats : 0;
        
        if (score > bestScore) {
            bestScore = score;
            bestBPM = testBPM;
        }
    }
    
    return bestBPM;
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
        
        // Perform corrected FFT
        const complexSpectrum = fft(windowed);
        const spectrum = getMagnitudeSpectrum(complexSpectrum);
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
            confidence: 0        };
    }
}

// Detect major/minor tonality using chroma vector analysis
function detectTonality(channelData, sampleRate) {
    try {
        // Use a segment from the middle of the audio for analysis
        const segmentDuration = Math.min(15, channelData.length / sampleRate); // 15 seconds max
        const segmentSamples = Math.floor(segmentDuration * sampleRate);
        const startSample = Math.floor((channelData.length - segmentSamples) / 2);
        const segment = channelData.slice(startSample, startSample + segmentSamples);
        
        // Create chroma vector (12 bins for each semitone)
        const chroma = new Array(12).fill(0);
        
        // Analyze multiple frames
        const frameSize = 4096;
        const hopSize = frameSize / 2;
        let frameCount = 0;
        
        for (let frameStart = 0; frameStart < segment.length - frameSize; frameStart += hopSize) {
            const frame = segment.slice(frameStart, frameStart + frameSize);
            
            // Apply window function
            const windowed = frame.map((sample, i) => {
                const windowValue = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / frameSize);
                return sample * windowValue;
            });
            
            // Perform FFT
            const complexSpectrum = fft(windowed);
            const spectrum = getMagnitudeSpectrum(complexSpectrum);
            
            const nyquist = sampleRate / 2;
            const freqBinSize = nyquist / (spectrum.length / 2);
            
            // Map frequency bins to chroma bins
            for (let i = 1; i < spectrum.length / 2; i++) {
                const freq = i * freqBinSize;
                
                // Only consider musically relevant frequencies (80-2000 Hz)
                if (freq >= 80 && freq <= 2000) {
                    // Convert frequency to chroma class (0-11)
                    const A4 = 440;
                    const C0 = A4 * Math.pow(2, -4.75);
                    
                    if (freq > C0) {
                        const halfSteps = 12 * Math.log2(freq / C0);
                        const chromaClass = Math.round(halfSteps) % 12;
                        const normalizedChroma = ((chromaClass % 12) + 12) % 12;
                        
                        // Add magnitude to chroma bin
                        chroma[normalizedChroma] += spectrum[i];
                    }
                }
            }
            frameCount++;
        }
        
        // Normalize chroma vector
        const maxChroma = Math.max(...chroma);
        if (maxChroma > 0) {
            for (let i = 0; i < 12; i++) {
                chroma[i] /= maxChroma;
            }
        }
        
        // Major and minor templates (Krumhansl-Schmuckler profiles)
        const majorTemplate = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
        const minorTemplate = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
        
        // Calculate correlation for all possible keys
        let bestMajorCorr = -1;
        let bestMinorCorr = -1;
        let bestMajorKey = 0;
        let bestMinorKey = 0;
        
        for (let key = 0; key < 12; key++) {
            // Rotate templates to match key
            const rotatedMajor = [...majorTemplate.slice(key), ...majorTemplate.slice(0, key)];
            const rotatedMinor = [...minorTemplate.slice(key), ...minorTemplate.slice(0, key)];
            
            // Calculate Pearson correlation
            const majorCorr = calculateCorrelation(chroma, rotatedMajor);
            const minorCorr = calculateCorrelation(chroma, rotatedMinor);
            
            if (majorCorr > bestMajorCorr) {
                bestMajorCorr = majorCorr;
                bestMajorKey = key;
            }
            
            if (minorCorr > bestMinorCorr) {
                bestMinorCorr = minorCorr;
                bestMinorKey = key;
            }
        }
        
        // Determine if major or minor based on best correlation
        const isMajor = bestMajorCorr > bestMinorCorr;
        const confidence = Math.max(bestMajorCorr, bestMinorCorr);
        const keyNote = NOTES[isMajor ? bestMajorKey : bestMinorKey];
        
        return {
            tonality: isMajor ? 'Major' : 'Minor',
            confidence: Math.max(0, Math.min(1, confidence)), // Clamp between 0 and 1
            key: keyNote,
            majorCorrelation: bestMajorCorr,
            minorCorrelation: bestMinorCorr
        };
        
    } catch (error) {
        console.error('Error detecting tonality:', error);
        return {
            tonality: 'Unknown',
            confidence: 0,
            key: 'Unknown',
            majorCorrelation: 0,
            minorCorrelation: 0
        };
    }
}

// Helper function to calculate Pearson correlation coefficient
function calculateCorrelation(x, y) {
    const n = x.length;
    if (n !== y.length) return 0;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
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
        });        // Key Detection moved to the end (most time-consuming)
        parentPort.postMessage({
            type: 'analysis_progress',
            data: { stage: 'Key Detection', progress: 80 }
        });
        
        const keyResult = detectKey(channelData, sampleRate);
        parentPort.postMessage({
            type: 'partial_results',
            data: { key: keyResult }
        });

        // Tonality Detection
        parentPort.postMessage({
            type: 'analysis_progress',
            data: { stage: 'Tonality Analysis', progress: 90 }
        });
        
        const tonalityResult = detectTonality(channelData, sampleRate);
        parentPort.postMessage({
            type: 'partial_results',
            data: { tonality: tonalityResult }
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
            tonality: tonalityResult,
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