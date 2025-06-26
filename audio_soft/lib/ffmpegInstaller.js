// FFmpeg Setup Helper for SoundStat
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class FFmpegInstaller {
    constructor() {
        this.installDir = path.join(__dirname, '..', 'ffmpeg');
        this.bundledPath = null;
        this.setupBundledPath();
    }

    // Setup bundled FFmpeg path for packaged app
    setupBundledPath() {
        try {
            // Check if we're in a packaged Electron app
            if (process.resourcesPath && process.resourcesPath !== process.cwd()) {
                // Packaged app - FFmpeg should be in resources/ffmpeg/
                this.bundledPath = path.join(process.resourcesPath, 'ffmpeg', 'win32-x64', 'ffmpeg.exe');
            } else {
                // Development mode - check local ffmpeg folder
                this.bundledPath = path.join(this.installDir, 'win32-x64', 'ffmpeg.exe');
            }
        } catch (error) {
            console.log('Unable to determine bundled FFmpeg path:', error.message);
        }
    }

    // Check if FFmpeg is available
    async checkFFmpeg() {
        return new Promise((resolve) => {
            // First check bundled FFmpeg
            if (this.bundledPath && fs.existsSync(this.bundledPath)) {
                console.log(`✅ Found bundled FFmpeg at: ${this.bundledPath}`);
                resolve('bundled');
                return;
            }

            // Then check system FFmpeg
            exec('ffmpeg -version', (error) => {
                if (error) {
                    // Check local installation (development)
                    const localFFmpeg = path.join(this.installDir, 'bin', 'ffmpeg.exe');
                    if (fs.existsSync(localFFmpeg)) {
                        resolve('local');
                    } else {
                        resolve(false);
                    }
                } else {
                    resolve('system');
                }
            });
        });
    }

    // Get FFmpeg path for fluent-ffmpeg
    getFFmpegPath() {
        // Priority: bundled > local > system
        if (this.bundledPath && fs.existsSync(this.bundledPath)) {
            return this.bundledPath;
        }
        
        const localPath = path.join(this.installDir, 'bin', 'ffmpeg.exe');
        if (fs.existsSync(localPath)) {
            return localPath;
        }
        
        return null; // Will use system FFmpeg if available
    }

    // Show installation instructions
    showInstallInstructions() {
        console.log('\n📦 FFmpeg Installation Required');
        console.log('=====================================');
        console.log('SoundStat needs FFmpeg to process audio files other than WAV format.');
        console.log('\n🔧 Installation Options:');
        console.log('\n1. Windows Package Manager (Recommended):');
        console.log('   winget install Gyan.FFmpeg');
        console.log('\n2. Chocolatey:');
        console.log('   choco install ffmpeg');
        console.log('\n3. Manual Download:');
        console.log('   - Visit: https://ffmpeg.org/download.html');
        console.log('   - Download Windows build');
        console.log('   - Extract to C:\\ffmpeg\\');
        console.log('   - Add C:\\ffmpeg\\bin to your PATH');
        console.log('\n4. Portable Installation:');
        console.log('   - Download FFmpeg and extract to:');
        console.log(`   - ${this.installDir}\\bin\\ffmpeg.exe`);
        console.log('\n⚠️  Without FFmpeg, only WAV files can be processed.');
        console.log('\nAfter installation, restart the application.');
    }

    // Set FFmpeg path for fluent-ffmpeg
    setFFmpegPath() {
        const ffmpegPath = this.getFFmpegPath();
        if (ffmpegPath) {
            process.env.FFMPEG_PATH = ffmpegPath;
            console.log(`🎯 Using FFmpeg from: ${ffmpegPath}`);
        }
    }

    // Main check method
    async install() {
        try {
            const status = await this.checkFFmpeg();
            
            if (status === 'bundled') {
                console.log('✅ FFmpeg is available (bundled with app)');
                this.setFFmpegPath();
                return true;
            } else if (status === 'system') {
                console.log('✅ FFmpeg is available system-wide');
                return true;
            } else if (status === 'local') {
                console.log('✅ FFmpeg is available locally');
                this.setFFmpegPath();
                return true;
            }
            
            this.showInstallInstructions();
            return false;
            
        } catch (error) {
            console.error('❌ Error checking FFmpeg:', error.message);
            this.showInstallInstructions();
            return false;
        }
    }
}

module.exports = FFmpegInstaller;

// CLI usage
if (require.main === module) {
    const installer = new FFmpegInstaller();
    installer.install().then(success => {
        if (!success) {
            console.log('\n💡 Tip: You can still use SoundStat with WAV files without FFmpeg!');
        }
        process.exit(0);
    });
}