# SoundStat Setup Guide

## FFmpeg Installation

SoundStat requires FFmpeg for processing audio files other than WAV format. Here are several ways to install FFmpeg:

### Option 1: Download FFmpeg for Windows (Recommended)

1. **Download FFmpeg:**
   - Go to [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)
   - Click on "Windows" and select "Windows builds by BtbN"
   - Download the latest release (ffmpeg-master-latest-win64-gpl.zip)

2. **Extract and Setup:**
   - Extract the zip file to `C:\ffmpeg\`
   - Add `C:\ffmpeg\bin` to your Windows PATH environment variable

3. **Verify Installation:**
   - Open Command Prompt and run: `ffmpeg -version`
   - You should see FFmpeg version information

### Option 2: Use Chocolatey (Windows Package Manager)

```powershell
# Install Chocolatey first (if not already installed)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install FFmpeg
choco install ffmpeg
```

### Option 3: Use Windows Package Manager (winget)

```powershell
winget install Gyan.FFmpeg
```

### Option 4: Portable FFmpeg (No PATH required)

If you can't modify system PATH, you can place FFmpeg in your project directory:

1. Download FFmpeg as described in Option 1
2. Create a folder `ffmpeg` in your SoundStat project root
3. Extract the FFmpeg files so the structure looks like:
   ```
   SoundStat-soft/
   ├── audio_soft/
   ├── ffmpeg/
   │   └── bin/
   │       └── ffmpeg.exe
   ```

The application will automatically detect FFmpeg in this location.

## Supported Audio Formats

- **Without FFmpeg:** WAV files only
- **With FFmpeg:** WAV, MP3, FLAC, OGG, M4A, AAC, WMA, and many more

## Troubleshooting

### "Cannot find ffmpeg" Error

1. **Check Installation:** Run `ffmpeg -version` in Command Prompt
2. **Check PATH:** Ensure FFmpeg is in your system PATH
3. **Try Portable Option:** Place FFmpeg in project directory as described above
4. **Restart Application:** After installing FFmpeg, restart SoundStat

### Performance Tips

- For large files, conversion may take time - be patient
- WAV files process fastest (no conversion needed)
- Mono audio files process faster than stereo

### File Size Limits

- Recommended: Under 50MB for optimal performance
- Large files (>100MB) may take several minutes to process
- Consider using shorter audio clips for faster analysis

## Contact

If you continue having issues, please check the project's GitHub issues page or create a new issue with:
- Your operating system version
- FFmpeg version (if installed)
- Error messages
- File format you're trying to process
