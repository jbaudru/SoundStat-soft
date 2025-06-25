const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const wav = require('node-wav');

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

        return formattedWaveform;
    } catch (error) {
        console.error('Error in generateWaveform:', error);
        throw new Error(`Failed to generate waveform: ${error.message}`);
    }
}

// Export the function
module.exports = {
    generateWaveform
};