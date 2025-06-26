const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

class AudioTransformer {
    constructor(app = null) {
        // Store app reference for path resolution
        this.app = app;
        this.outputDir = this.getOutputDirectory();
        this.ensureOutputDirectory();
    }

    // Get the proper output directory based on whether app is packaged or not
    getOutputDirectory() {
        if (this.app && this.app.isPackaged) {
            // For packaged app, use userData directory
            return path.join(this.app.getPath('userData'), 'transformed');
        } else {
            // For development, use local directory
            // Check if we have access to app through require (when app is available globally)
            try {
                const electron = require('electron');
                const app = electron.app;
                if (app && app.isPackaged) {
                    return path.join(app.getPath('userData'), 'transformed');
                }
            } catch (error) {
                // Electron not available, use local path
            }
            
            // Fallback to local directory for development
            return path.join(__dirname, '..', 'sound', 'transformed');
        }
    }

    ensureOutputDirectory() {
        try {
            if (!fs.existsSync(this.outputDir)) {
                fs.mkdirSync(this.outputDir, { recursive: true });
                console.log(`Created transformed audio directory at: ${this.outputDir}`);
            }
        } catch (error) {
            console.error('Error creating output directory:', error);
        }
    }

    async transform(inputFile, settings, progressCallback) {
        // Validate input file exists
        if (!fs.existsSync(inputFile)) {
            throw new Error(`Input file does not exist: ${inputFile}`);
        }

        // Create unique output filename to avoid conflicts
        const timestamp = Date.now();
        const outputFileName = `${settings.outputName}_${timestamp}.${settings.outputFormat}`;
        const outputFile = path.join(this.outputDir, outputFileName);
        
        console.log('Transform input:', inputFile);
        console.log('Transform output:', outputFile);
        
        return new Promise((resolve, reject) => {
            let command = ffmpeg(inputFile);
            
            // Configure the transformation based on settings
            this.configureFormat(command, settings);
            this.configureChannels(command, settings);
            this.configureSampleRate(command, settings);
            this.configureBitDepth(command, settings);
            this.configureNormalization(command, settings);
            
            // Progress tracking
            command.on('progress', (progress) => {
                const percent = Math.round(progress.percent || 0);
                progressCallback({
                    progress: percent,
                    message: `Processing: ${percent}%`
                });
            });
            
            // Error handling
            command.on('error', (err) => {
                console.error('FFmpeg transformation error:', err);
                reject(new Error(`Transformation failed: ${err.message}`));
            });
            
            // Success handling
            command.on('end', () => {
                try {
                    const stats = fs.statSync(outputFile);
                    resolve({
                        success: true,
                        originalFile: inputFile,
                        outputFile: outputFile,
                        fileSize: stats.size,
                        settings: settings
                    });
                } catch (error) {
                    reject(new Error(`Failed to get output file stats: ${error.message}`));
                }
            });
            
            // Start the conversion
            command.save(outputFile);
        });
    }

    // ...rest of the methods remain the same...
    configureFormat(command, settings) {
        // Set output format
        command.format(settings.outputFormat);
        
        // Format-specific configurations
        switch (settings.outputFormat) {
            case 'mp3':
                // Use high quality MP3 settings
                command.audioBitrate('320k');
                break;
            case 'flac':
                // FLAC is lossless, set compression level
                command.audioCodec('flac');
                command.addOption('-compression_level', '5');
                break;
            case 'aiff':
                // AIFF settings
                command.audioCodec('pcm_s16be');
                break;
            case 'wav':
            default:
                // WAV settings (default)
                command.audioCodec('pcm_s16le');
                break;
        }
    }

    configureChannels(command, settings) {
        if (settings.channelConfig === 'mono') {
            command.audioChannels(1);
        } else if (settings.channelConfig === 'stereo') {
            command.audioChannels(2);
        }
    }

    configureSampleRate(command, settings) {
        if (settings.sampleRate) {
            const sampleRate = parseInt(settings.sampleRate);
            command.audioFrequency(sampleRate);
        }
    }

    configureBitDepth(command, settings) {
        if (settings.bitDepth && ['wav', 'flac', 'aiff'].includes(settings.outputFormat)) {
            switch (settings.bitDepth) {
                case '16':
                    if (settings.outputFormat === 'wav') {
                        command.audioCodec('pcm_s16le');
                    } else if (settings.outputFormat === 'aiff') {
                        command.audioCodec('pcm_s16be');
                    }
                    break;
                case '24':
                    if (settings.outputFormat === 'wav') {
                        command.audioCodec('pcm_s24le');
                    } else if (settings.outputFormat === 'aiff') {
                        command.audioCodec('pcm_s24be');
                    }
                    break;
                case '32':
                    if (settings.outputFormat === 'wav') {
                        command.audioCodec('pcm_s32le');
                    } else if (settings.outputFormat === 'aiff') {
                        command.audioCodec('pcm_s32be');
                    }
                    break;
            }
        }
    }

    configureNormalization(command, settings) {
        if (settings.normalize) {
            const targetLevel = parseFloat(settings.targetLevel) || -23;
            
            // Ensure target level is within valid range for loudnorm filter
            // I (integrated loudness) should be between -70 and -5 LUFS
            const integratedLoudness = Math.max(-70, Math.min(-5, targetLevel));
            
            // Use loudnorm filter for better normalization
            command.audioFilters([
                {
                    filter: 'loudnorm',
                    options: {
                        I: integratedLoudness,
                        TP: -1.0,    // True peak limit
                        LRA: 11.0,   // Loudness range
                        print_format: 'none'  // Suppress verbose output
                    }
                }
            ]);
        }
    }

    // Cleanup old transformed files
    cleanup() {
        try {
            if (fs.existsSync(this.outputDir)) {
                const files = fs.readdirSync(this.outputDir);
                files.forEach(file => {
                    const filePath = path.join(this.outputDir, file);
                    try {
                        if (fs.statSync(filePath).isFile()) {
                            const stats = fs.statSync(filePath);
                            const ageInMs = Date.now() - stats.mtime.getTime();
                            const ageInHours = ageInMs / (1000 * 60 * 60);
                            
                            // Delete files older than 24 hours
                            if (ageInHours > 24) {
                                fs.unlinkSync(filePath);
                                console.log(`Cleaned up old transformed file: ${file}`);
                            }
                        }
                    } catch (error) {
                        console.error(`Error checking file ${file}:`, error);
                    }
                });
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    // Get information about supported formats
    getSupportedFormats() {
        return {
            input: ['wav', 'mp3', 'flac', 'aiff', 'ogg', 'm4a', 'wma'],
            output: ['wav', 'mp3', 'flac', 'aiff']
        };
    }

    // Validate transformation settings
    validateSettings(settings) {
        const errors = [];
        
        // Check required fields
        if (!settings.outputFormat) {
            errors.push('Output format is required');
        }
        
        if (!settings.outputName) {
            errors.push('Output name is required');
        }
        
        // Validate output format
        const supportedFormats = this.getSupportedFormats().output;
        if (settings.outputFormat && !supportedFormats.includes(settings.outputFormat)) {
            errors.push(`Unsupported output format: ${settings.outputFormat}`);
        }
        
        // Validate sample rate
        if (settings.sampleRate) {
            const validSampleRates = [44100, 48000, 96000];
            const sampleRate = parseInt(settings.sampleRate);
            if (!validSampleRates.includes(sampleRate)) {
                errors.push(`Invalid sample rate: ${settings.sampleRate}`);
            }
        }
        
        // Validate bit depth
        if (settings.bitDepth) {
            const validBitDepths = ['16', '24', '32'];
            if (!validBitDepths.includes(settings.bitDepth)) {
                errors.push(`Invalid bit depth: ${settings.bitDepth}`);
            }
        }
        
        // Validate normalization target level
        if (settings.normalize && settings.targetLevel) {
            const targetLevel = parseFloat(settings.targetLevel);
            if (isNaN(targetLevel) || targetLevel > 0 || targetLevel < -30) {
                errors.push('Target level must be between -30 and 0 dB');
            }
        }
        
        return errors;
    }
}

module.exports = AudioTransformer;