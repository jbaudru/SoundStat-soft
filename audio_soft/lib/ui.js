function toggleMenu() {
  const sideMenu = document.getElementById('sideMenu');
  if (sideMenu) {
    sideMenu.classList.toggle('extended');
  } else {
    console.error('Side menu element not found!');
  }
}


const { ipcRenderer } = require('electron');
const path = require('path'); // Import Node.js path module


const dropZone = document.getElementById('dropZone');
const soundFileInput = document.getElementById('soundFile');
const contentDiv = document.querySelector('.content');
const analyseDiv = document.getElementById('analyseSection');
const aboutDiv = document.getElementById('aboutSection');
const fileInfo = document.getElementById('fileInfo');
const uploadMenu = document.getElementById('uploadMenu');
const analyseMenu = document.getElementById('analyseMenu');

document.addEventListener('click', (event) => {
  const sideMenu = document.getElementById('sideMenu');
  const toggleButton = document.querySelector('.toggle-btn'); // Select the toggle button
  const isClickInsideMenu = sideMenu.contains(event.target);
  const isClickOnToggleButton = toggleButton.contains(event.target); // Check if click is on the toggle button
  const isMenuExtended = sideMenu.classList.contains('extended');

  // Close the side menu only if the click is outside the menu and not on the toggle button
  if (!isClickInsideMenu && !isClickOnToggleButton && isMenuExtended) {
    sideMenu.classList.remove('extended'); // Close the side menu
  }
});

// Show the content div and hide other divs when clicking "Upload"
uploadMenu.addEventListener('click', () => {
  contentDiv.style.display = 'flex'; // Show the content div
  analyseDiv.style.display = 'none'; // Hide the analyse div
  aboutDiv.style.display = 'none'; // Hide the about div
});

// Show the analyse div and hide other divs when clicking "Analyse"
analyseMenu.addEventListener('click', () => {
  contentDiv.style.display = 'none'; // Hide the content div
  analyseDiv.style.display = 'block'; // Show the analyse div
  aboutDiv.style.display = 'none'; // Hide the about div
});

// Show the about div and hide other divs when clicking "About"
aboutMenu.addEventListener('click', () => {
  contentDiv.style.display = 'none'; // Hide the content div
  analyseDiv.style.display = 'none'; // Hide the analyse div
  aboutDiv.style.display = 'flex'; // Show the about div
});

// Open file explorer when clicking on the drop-zone
dropZone.addEventListener('click', () => {
  soundFileInput.click(); // Trigger the hidden file input
});

// Drag-and-drop functionality
dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.style.backgroundColor = '#eaeaea'; // Highlight the drop zone
});

dropZone.addEventListener('dragleave', () => {
  dropZone.style.backgroundColor = '#f9f9f9'; // Reset background color
});

dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.style.backgroundColor = '#f9f9f9'; // Reset background color

  const files = event.dataTransfer?.files;
  console.log('Dropped files:', files); // Debugging log
  if (files && files.length > 0) {
    const file = files[0];
    
    // For drag and drop in Electron, file.path should be available
    if (file.path) {
      const filePath = file.path;
      console.log('File dropped:', filePath); // Log the file path
      
      // Send the file path to the main process via IPC for copying
      ipcRenderer.send('copy-file-to-sound-folder', filePath);
      // Update UI
      showAnalyseSection(path.basename(filePath));
    } else {
      // Fallback for when path is not available
      console.log('File path not available, reading file data instead');
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileData = {
          name: file.name,
          data: e.target.result,
          type: file.type,
          size: file.size
        };
        ipcRenderer.send('process-file-data', fileData);
      };
      reader.readAsArrayBuffer(file);
      showAnalyseSection(file.name);
    }
  } else {
    console.error('No file detected in drop event!');
  }
});

// Handle file selection via file explorer
soundFileInput.addEventListener('change', () => {
  const files = soundFileInput.files;
  if (files.length > 0) {
    const file = files[0];
    
    // For browser file input, we need to read the file as ArrayBuffer or use webkitRelativePath
    // Since file.path is not available in browser context, we'll send the file object itself
    console.log('File selected:', file.name);
    
    // Create a FileReader to read the file content
    const reader = new FileReader();
    reader.onload = (e) => {
      const fileData = {
        name: file.name,
        data: e.target.result,
        type: file.type,
        size: file.size
      };
      
      // Send the file data to the main process for processing
      ipcRenderer.send('process-file-data', fileData);
    };
    
    // Read the file as ArrayBuffer
    reader.readAsArrayBuffer(file);
    
    // Update UI
    showAnalyseSection(file.name);
  } else {
    console.error('No file selected!');
  }
});

// Listen for successful file copy confirmation
ipcRenderer.on('file-copy-success', (event, copiedFilePath) => {
  console.log('File successfully copied to:', copiedFilePath);
  // Now send the copied file path for processing
  ipcRenderer.send('file-uploaded', copiedFilePath);
});

// Listen for file copy errors
ipcRenderer.on('file-copy-error', (event, error) => {
  console.error('Error copying file:', error);
  alert('Error copying file to sound folder: ' + error);
});

// Function to show the analyse section
function showAnalyseSection(filePathOrName) {
  contentDiv.style.display = 'none'; // Hide the content div
  analyseDiv.style.display = 'block'; // Show the analyse div
  aboutDiv.style.display = 'none'; // Hide the about div

  // Extract the file name from the full file path or use filename directly
  const fileName = filePathOrName.includes('/') || filePathOrName.includes('\\') 
    ? path.basename(filePathOrName) 
    : filePathOrName;
  fileInfo.textContent = `Processing: ${fileName}...`; // Display file name

  // Show progress bar and reset progress
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  
  progressContainer.style.display = 'block';
  progressFill.style.width = '0%';
  progressText.textContent = 'Starting analysis...';
  
  // Reset progressive waveform tracking
  progressiveWaveform = [];
  isAnalysisInProgress = true;
  
  // Clear previous waveform
  const canvas = document.getElementById('waveformCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Reset all statistics to loading state
  resetStatisticsToLoading();
}


// Listen for complete audio analysis data from the main process
ipcRenderer.on('audio-analysis-data', (event, analysisResults) => {
    console.log('Received audio analysis data:', analysisResults);

    // Hide progress bar
    const progressContainer = document.getElementById('progressContainer');
    progressContainer.style.display = 'none';
    
    // Reset progressive waveform
    progressiveWaveform = [];
    isAnalysisInProgress = false;

    // Update file info
    const fileName = analysisResults.fileName;
    const fileSize = (analysisResults.fileSize / 1024 / 1024).toFixed(2); // Convert to MB
    fileInfo.textContent = `${fileName} (${fileSize} MB)`;

    // Render the final waveform
    renderWaveform(analysisResults.waveform);
    
    // Update all statistics
    updateStatistics(analysisResults);
});

// Global variables for progressive waveform rendering
let progressiveWaveform = [];
let isAnalysisInProgress = false;

// Listen for progressive audio analysis updates
ipcRenderer.on('audio-analysis-progress', (event, update) => {
    console.log('Progress update:', update);
    
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    switch (update.type) {
        case 'progress':
            // Show progress bar if not visible
            if (progressContainer.style.display === 'none') {
                progressContainer.style.display = 'block';
            }
            
            // Update progress bar
            progressFill.style.width = `${update.progress}%`;
            progressText.textContent = `${update.stage} (${Math.round(update.progress)}%)`;
            break;
            
        case 'waveform_chunk':
            // Render waveform progressively
            progressiveWaveform.push(...update.chunk);
            renderProgressiveWaveform(progressiveWaveform);
            
            progressFill.style.width = `${update.progress}%`;
            progressText.textContent = `Generating Waveform (${update.currentChunk}/${update.totalChunks})`;
            break;
            
        case 'partial_results':
            // Update UI with partial results as they become available
            updatePartialStatistics(update.data);
            break;
    }
});

// Function to render progressive waveform
function renderProgressiveWaveform(waveformData) {
    if (!waveformData || waveformData.length === 0) return;
    
    const canvas = document.getElementById('waveformCanvas');
    const ctx = canvas.getContext('2d');
    
    // Get device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Set actual canvas size in memory (scaled up for retina displays)
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Scale the canvas back down using CSS
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    // Scale the drawing context so everything draws at the correct size
    ctx.scale(dpr, dpr);
    
    // Clear the canvas
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    // Set waveform style
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#4facfe';
    ctx.fillStyle = 'rgba(79, 172, 254, 0.1)';
    
    // Scale the waveform data to fit the canvas
    const maxAmplitude = Math.max(...waveformData.map(point => Math.abs(point.y)));
    const scaleX = rect.width / Math.max(waveformData.length, 4000); // Normalize to expected final length
    const scaleY = maxAmplitude > 0 ? rect.height / (2 * maxAmplitude) : 1;
    const centerY = rect.height / 2;
    
    // Draw filled waveform
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    
    waveformData.forEach((point, index) => {
        const x = point.x * scaleX;
        const y = centerY - point.y * scaleY;
        ctx.lineTo(x, y);
    });
    
    ctx.lineTo(rect.width, centerY);
    ctx.closePath();
    ctx.fill();
    
    // Draw waveform outline
    ctx.beginPath();
    waveformData.forEach((point, index) => {
        const x = point.x * scaleX;
        const y = centerY - point.y * scaleY;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    
    // Draw center line
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(rect.width, centerY);
    ctx.stroke();
}

// Function to update partial statistics as they become available
function updatePartialStatistics(partialResults) {
    // Update stats (peak level, RMS, dynamic range, brightness, noisiness) immediately
    if (partialResults.stats) {
        const stats = partialResults.stats;
        
        // Update Duration
        const durationValue = document.getElementById('durationValue');
        if (durationValue) durationValue.textContent = `${stats.duration}s`;
        
        // Update Peak Level
        const peakValue = document.getElementById('peakValue');
        if (peakValue) peakValue.textContent = stats.peak.toFixed(3);
        
        // Update RMS Level
        const rmsValue = document.getElementById('rmsValue');
        if (rmsValue) rmsValue.textContent = stats.rms.toFixed(3);
        
        // Update Dynamic Range
        const dynamicRangeValue = document.getElementById('dynamicRangeValue');
        if (dynamicRangeValue) dynamicRangeValue.textContent = stats.dynamicRange.toFixed(3);
        
        // Update Brightness (Spectral Centroid)
        const spectralCentroidValue = document.getElementById('spectralCentroidValue');
        if (spectralCentroidValue) spectralCentroidValue.textContent = `${stats.spectralCentroid} Hz`;
        
        // Update Noisiness (Zero Crossing Rate)
        const zcrValue = document.getElementById('zcrValue');
        if (zcrValue) zcrValue.textContent = stats.zeroCrossingRate;
    }
    
    if (partialResults.bpm) {
        const bpmValue = document.getElementById('bpmValue');
        const bpmConfidence = document.getElementById('bpmConfidence');
        
        if (partialResults.bpm.bpm > 0) {
            bpmValue.textContent = partialResults.bpm.bpm;
            bpmConfidence.textContent = `Confidence: ${(partialResults.bpm.confidence * 100).toFixed(1)}%`;
        } else {
            bpmValue.textContent = 'N/A';
            bpmConfidence.textContent = 'Could not detect';
        }
    }
    
    if (partialResults.key) {
        const keyValue = document.getElementById('keyValue');
        const dominantFreq = document.getElementById('dominantFreq');
        keyValue.textContent = partialResults.key.note;
        dominantFreq.textContent = `Freq: ${partialResults.key.dominantFreq} Hz`;
    }
}

// Function to render waveform
function renderWaveform(waveform) {
    const canvas = document.getElementById('waveformCanvas');
    const ctx = canvas.getContext('2d');

    // Get device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Set actual canvas size in memory (scaled up for retina displays)
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    // Scale the canvas back down using CSS
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    // Scale the drawing context so everything draws at the correct size
    ctx.scale(dpr, dpr);

    // Clear the canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Set waveform style
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#4facfe';
    ctx.fillStyle = 'rgba(79, 172, 254, 0.1)';

    if (waveform && waveform.length > 0) {
        // Scale the waveform data to fit the canvas
        const maxAmplitude = Math.max(...waveform.map(point => Math.abs(point.y)));
        const scaleX = rect.width / waveform.length;
        const scaleY = rect.height / (2 * maxAmplitude);
        const centerY = rect.height / 2;

        // Draw filled waveform
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        
        waveform.forEach((point, index) => {
            const x = index * scaleX;
            const y = centerY - point.y * scaleY;
            ctx.lineTo(x, y);
        });
        
        ctx.lineTo(rect.width, centerY);
        ctx.closePath();
        ctx.fill();

        // Draw waveform outline
        ctx.beginPath();
        waveform.forEach((point, index) => {
            const x = index * scaleX;
            const y = centerY - point.y * scaleY;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        // Draw center line
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(rect.width, centerY);
        ctx.stroke();
    }
}

// Function to update all statistics
function updateStatistics(analysisResults) {
    const { bpm, key, stats } = analysisResults;
    
    // Update BPM
    const bpmValue = document.getElementById('bpmValue');
    const bpmConfidence = document.getElementById('bpmConfidence');
    if (bpm.bpm > 0) {
        bpmValue.textContent = bpm.bpm;
        bpmConfidence.textContent = `Confidence: ${(bpm.confidence * 100).toFixed(1)}%`;
    } else {
        bpmValue.textContent = 'N/A';
        bpmConfidence.textContent = 'Could not detect';
    }
    
    // Update Key Detection
    const keyValue = document.getElementById('keyValue');
    const dominantFreq = document.getElementById('dominantFreq');
    keyValue.textContent = key.note;
    dominantFreq.textContent = `Freq: ${key.dominantFreq} Hz`;
    
    // Update Duration
    const durationValue = document.getElementById('durationValue');
    const durationFormatted = document.getElementById('durationFormatted');
    durationValue.textContent = `${stats.duration}s`;
    
    // Format duration as MM:SS
    const minutes = Math.floor(stats.duration / 60);
    const seconds = Math.floor(stats.duration % 60);
    const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    durationFormatted.textContent = `Duration: ${formattedTime}`;
    
    // Update Peak Level
    const peakValue = document.getElementById('peakValue');
    peakValue.textContent = stats.peak.toFixed(3);
    
    // Update RMS Level
    const rmsValue = document.getElementById('rmsValue');
    rmsValue.textContent = stats.rms.toFixed(3);
    
    // Update Dynamic Range
    const dynamicRangeValue = document.getElementById('dynamicRangeValue');
    dynamicRangeValue.textContent = stats.dynamicRange.toFixed(3);
    
    // Update Spectral Centroid (Brightness)
    const spectralCentroidValue = document.getElementById('spectralCentroidValue');
    spectralCentroidValue.textContent = `${stats.spectralCentroid} Hz`;
    
    // Update Zero Crossing Rate (Noisiness)
    const zcrValue = document.getElementById('zcrValue');
    zcrValue.textContent = stats.zeroCrossingRate;
}

// Listen for waveform errors from the main process
ipcRenderer.on('waveform-error', (event, error) => {
    console.error('Waveform generation error:', error);
    
    // Hide progress bar
    const progressContainer = document.getElementById('progressContainer');
    progressContainer.style.display = 'none';
    
    // Reset progressive waveform
    progressiveWaveform = [];
    isAnalysisInProgress = false;
    
    // Update file info to show error
    fileInfo.textContent = `Error processing file: ${error}`;
    
    // Reset all statistics to default values
    const defaultStats = {
        bpm: { bpm: 0, confidence: 0 },
        key: { note: 'Error', dominantFreq: 0 },
        stats: {
            duration: 0,
            peak: 0,
            rms: 0,
            dynamicRange: 0,
            spectralCentroid: 0,
            zeroCrossingRate: 0
        }
    };
    
    updateStatistics(defaultStats);
    
    // Clear waveform canvas
    const canvas = document.getElementById('waveformCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Display error message on canvas
    ctx.fillStyle = '#ff4444';
    ctx.font = '16px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Error loading audio file', canvas.width / 2, canvas.height / 2);
});

// Function to reset statistics to loading state
function resetStatisticsToLoading() {
    document.getElementById('bpmValue').textContent = '...';
    document.getElementById('bpmConfidence').textContent = 'Analyzing...';
    document.getElementById('keyValue').textContent = '...';
    document.getElementById('dominantFreq').textContent = 'Analyzing...';
    document.getElementById('durationValue').textContent = '...';
    document.getElementById('durationFormatted').textContent = 'Analyzing...';
    document.getElementById('peakValue').textContent = '...';
    document.getElementById('rmsValue').textContent = '...';
    document.getElementById('dynamicRangeValue').textContent = '...';
    document.getElementById('spectralCentroidValue').textContent = '...';
    document.getElementById('zcrValue').textContent = '...';
}
