

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
  analyseDiv.style.display = 'flex'; // Show the analyse div
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
function showAnalyseSection(filePath) {
  contentDiv.style.display = 'none'; // Hide the content div
  analyseDiv.style.display = 'flex'; // Show the analyse div
  aboutDiv.style.display = 'none'; // Hide the about div

  // Extract the file name from the full file path
  const fileName = path.basename(filePath);
  fileInfo.textContent = `Uploaded File: ${fileName}`; // Display file name
}


// Listen for waveform data from the main process
// ...existing code...

// Listen for waveform data from the main process
ipcRenderer.on('waveform-data', (event, waveform) => {
    console.log('Received waveform data:', waveform);

    // Render the waveform on a canvas
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

    // Disable image smoothing for crisp lines
    ctx.imageSmoothingEnabled = false;

    // Set precise line properties
    ctx.lineWidth = 1; // Use 1px for crisp lines
    ctx.strokeStyle = '#000000';
    ctx.lineCap = 'butt'; // Sharp line ends for precision
    ctx.lineJoin = 'miter'; // Sharp line joins

    // Scale the waveform data to fit the canvas
    const maxAmplitude = Math.max(...waveform.map(point => Math.abs(point.y)));
    const scaleX = rect.width / waveform.length;
    const scaleY = rect.height / (2 * maxAmplitude);

    ctx.beginPath();
    waveform.forEach((point, index) => {
        // Round coordinates to pixel boundaries for crisp rendering
        const x = Math.round(index * scaleX) + 0.5; // +0.5 for pixel-perfect lines
        const y = Math.round(rect.height / 2 - point.y * scaleY) + 0.5;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
});

// ...existing code...

// Function to show the analyse section
function showAnalyseSection(fileName) {
    
    contentDiv.style.display = 'none'; // Hide the content div
    analyseDiv.style.display = 'flex'; // Show the analyse div
    aboutDiv.style.display = 'none'; // Hide the about div

    const fileInfo = document.getElementById('fileInfo');
    fileInfo.textContent = fileName; // Display file information

    // Ensure the canvas is visible
    const canvas = document.getElementById('waveformCanvas');
    
}
