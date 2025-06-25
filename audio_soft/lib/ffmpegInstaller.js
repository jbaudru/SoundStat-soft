// FFmpeg Setup Helper for SoundStat
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class FFmpegInstaller {
    constructor() {
        this.installDir = path.join(__dirname, '..', 'ffmpeg');
    }

    // Check if FFmpeg is available
    async checkFFmpeg() {
        return new Promise((resolve) => {
            exec('ffmpeg -version', (error) => {
                if (error) {
                    // Check local installation
                    const localFFmpeg = path.join(this.installDir, 'bin', 'ffmpeg.exe');
                    resolve(fs.existsSync(localFFmpeg) ? 'local' : false);
                } else {
                    resolve('system');
                }
            });
        });
    }

    // Get FFmpeg path for fluent-ffmpeg
    getFFmpegPath() {
        const localPath = path.join(this.installDir, 'bin', 'ffmpeg.exe');
        return fs.existsSync(localPath) ? localPath : null;
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

    // Main check method
    async install() {
        try {
            const status = await this.checkFFmpeg();
            
            if (status === 'system') {
                console.log('✅ FFmpeg is available system-wide');
                return true;
            } else if (status === 'local') {
                console.log('✅ FFmpeg is available locally');
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
