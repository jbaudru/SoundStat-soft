# SoundStat 🎵

![Electron](https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open Source](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://opensource.org/)

**SoundStat** is a free and open-source desktop application for comprehensive audio analysis and transformation. Built with Electron, it provides professional-grade audio statistics, waveform visualization, and format conversion tools in an intuitive interface.

## ✨ Features

### 🔍 Audio Analysis
- **BPM Detection**: Automatic tempo detection with confidence scoring
- **Key Detection**: Musical key identification with dominant frequency analysis
- **Tonality Analysis**: Major/Minor scale detection using chroma vector analysis
- **Waveform Visualization**: Real-time interactive waveform display with playback controls
- **Audio Statistics**: Comprehensive metrics including:
  - Peak and RMS levels
  - Dynamic range analysis
  - Spectral centroid (brightness)
  - Zero-crossing rate (noisiness)
  - Duration and format information

### 🛠️ Audio Transformation
- **Format Conversion**: Convert between WAV, MP3, FLAC, and AIFF
- **Channel Configuration**: Mono ↔ Stereo conversion
- **Bit Depth Conversion**: 16-bit, 24-bit, and 32-bit options
- **Sample Rate Conversion**: 44.1 kHz, 48 kHz, and 96 kHz options
- **Volume Normalization**: Automatic level adjustment with target dB settings
- **Batch Processing**: Transform multiple files efficiently

### 🎯 User Experience
- **Drag & Drop Interface**: Simple file loading
- **Progressive Analysis**: Real-time progress updates
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **No Internet Required**: Fully offline application

## 📋 Prerequisites

### Required Software

**FFmpeg** is required for full functionality (non-WAV file support and conversion features):

#### Windows
```bash
# Using Chocolatey
choco install ffmpeg

# Using Scoop
scoop install ffmpeg

# Or download from: https://ffmpeg.org/download.html
```

#### macOS
```bash
# Using Homebrew
brew install ffmpeg

# Using MacPorts
sudo port install ffmpeg
```

#### Linux
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# CentOS/RHEL/Fedora
sudo yum install ffmpeg
# or
sudo dnf install ffmpeg

# Arch Linux
sudo pacman -S ffmpeg
```

### Node.js Requirements
- Node.js 16.x or higher
- npm 7.x or higher

## 🚀 Installation

### Option 1: Clone and Run
```bash
# Clone the repository
git clone https://github.com/jbaudru/SoundStat-soft.git
cd SoundStat-soft/audio_soft

# Install dependencies
npm install

# Set up FFmpeg (optional - provides installation guidance)
npm run setup-ffmpeg

# Start the application
npm start
```

### Option 2: Download Release
1. Visit the [Releases page](https://github.com/jbaudru/SoundStat-soft/releases)
2. Download the latest version for your platform
3. Install and run

## 🎮 Usage

### Basic Analysis
1. **Launch SoundStat**
2. **Upload Audio**: Drag & drop your audio file or use the file picker
3. **View Results**: Analysis starts automatically with real-time progress
4. **Interact**: Click play to hear your audio while viewing the waveform

### Audio Transformation
1. **Go to Tool Section**: Click the "Tool" menu item
2. **Select File**: Choose from your uploaded files
3. **Configure Settings**: Set output format, bit depth, sample rate, etc.
4. **Transform**: Click "Transform Audio" and save the result

### Supported Formats
- **Input**: WAV, MP3, FLAC, AIFF, OGG (requires FFmpeg for non-WAV)
- **Output**: WAV, MP3, FLAC, AIFF

## 🧪 Technical Details

### Audio Analysis Algorithms
- **BPM Detection**: Onset detection with autocorrelation
- **Key Detection**: FFT-based fundamental frequency analysis
- **Tonality Detection**: Krumhansl-Schmuckler key profiles with chroma vector analysis
- **Spectral Analysis**: Cooley-Tukey FFT implementation

### Performance Optimization
- **Multi-threading**: Worker threads for CPU-intensive tasks
- **Progressive Rendering**: Chunked waveform generation
- **Memory Management**: Efficient audio buffer handling
- **Adaptive Sampling**: Dynamic sample rate adjustment for large files

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Test thoroughly**
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Setup
```bash
# Clone your fork
git clone https://github.com/your-username/SoundStat-soft.git
cd SoundStat-soft/audio_soft

# Install dependencies
npm install

# Run in development mode
npm start
```

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

Developed by [ce2lo](https://github.com/jbaudru)

## 🙏 Acknowledgments

- FFmpeg team for the powerful multimedia framework
- Electron team for the cross-platform desktop app framework
- The open-source community for inspiration and feedback

---

## 📝 TODO List

### High Priority
- [x] ~~Minor/Major detection~~ ✅ **Completed**
- [ ] BPM detection range optimization (70-190 BPM)
- [ ] Default waveform templates
- [x] ~~Conversion tool (MP3 to WAV, AIFF, FLAC)~~ ✅ **Completed**
- [x] ~~Stereo to mono, mono to stereo conversion~~ ✅ **Completed**
- [x] ~~Volume normalization~~ ✅ **Completed**
- [x] ~~Bit depth conversion (16-bit, 24-bit, 32-bit)~~ ✅ **Completed**
- [x] ~~Sample rate conversion (44.1kHz, 48kHz, 96kHz)~~ ✅ **Completed**

### Medium Priority
- [ ] Batch processing for multiple files
- [ ] Spectral analysis visualization
- [ ] Audio comparison tool
- [ ] Export analysis reports (PDF/CSV)
- [ ] Keyboard shortcuts
- [ ] Dark/Light theme toggle

### Low Priority
- [ ] Plugin system for custom analyzers
- [ ] Real-time audio input analysis
- [ ] Cloud storage integration
- [ ] Audio fingerprinting
- [ ] Machine learning-based genre detection
- [ ] Multi-language support
- [ ] Command-line interface

### Technical Improvements
- [ ] Performance optimization for large files (>100MB)
- [ ] Memory usage optimization
- [ ] Unit test coverage
- [ ] Automated builds/releases
- [ ] Error handling improvements
- [ ] Accessibility features
- [ ] Code documentation

---

**⭐ If you find SoundStat useful, please consider giving it a star on GitHub!**