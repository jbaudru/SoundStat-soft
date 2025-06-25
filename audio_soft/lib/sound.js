const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const wav = require('node-wav');
const { Worker } = require('worker_threads');

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

// Enhanced generateWaveform function with threading and progressive updates
async function generateWaveform(filePath, progressCallback = null) {
    return new Promise((resolve, reject) => {
        try {
            console.log('generateWaveform called with:', filePath);
            console.log('File exists check:', fs.existsSync(filePath));
            
            if (!fs.existsSync(filePath)) {
                reject(new Error(`File does not exist: ${filePath}`));
                return;
            }

            // Create worker thread for audio processing
            const worker = new Worker(path.join(__dirname, 'audioWorker.js'), {
                workerData: { filePath }
            });

            let accumulatedWaveform = [];
            let partialResults = {};

            worker.on('message', (message) => {
                const { type, data, error } = message;

                switch (type) {
                    case 'analysis_progress':
                        if (progressCallback) {
                            progressCallback({
                                type: 'progress',
                                stage: data.stage,
                                progress: data.progress
                            });
                        }
                        break;

                    case 'waveform_progress':
                        accumulatedWaveform.push(...data.chunk);
                        if (progressCallback) {
                            progressCallback({
                                type: 'waveform_chunk',
                                chunk: data.chunk,
                                progress: data.progress,
                                totalChunks: data.totalChunks,
                                currentChunk: data.currentChunk
                            });
                        }
                        break;

                    case 'partial_results':
                        partialResults = { ...partialResults, ...data };
                        if (progressCallback) {
                            progressCallback({
                                type: 'partial_results',
                                data: partialResults
                            });
                        }
                        break;

                    case 'complete':
                        console.log('Analysis completed:', {
                            bpm: data.bpm.bpm,
                            key: data.key.note,
                            duration: data.stats.duration
                        });
                        resolve(data);
                        break;

                    case 'error':
                        console.error('Worker error:', error);
                        reject(new Error(error));
                        break;
                }
            });

            worker.on('error', (error) => {
                console.error('Worker thread error:', error);
                reject(error);
            });

            worker.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });

        } catch (error) {
            console.error('Error in generateWaveform:', error);
            reject(new Error(`Failed to generate waveform: ${error.message}`));
        }
    });
}

// Export the enhanced function
module.exports = {
    generateWaveform
};