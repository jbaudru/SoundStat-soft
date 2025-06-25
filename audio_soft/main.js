const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { generateWaveform } = require('./lib/sound'); // Import waveform generation function
const fs = require('fs'); // Import file system module for file existence checks
const path = require('path');

let mainWindow;

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 500,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        },
    });

    mainWindow.loadFile('index.html');

    // Remove the default menu
    //Menu.setApplicationMenu(null);

    // Listen for menu toggle requests
    ipcMain.on('toggle-menu', () => {
        mainWindow.webContents.send('toggle-menu');
    });

    // Create sound folder if it doesn't exist
    const soundFolderPath = path.join(__dirname, 'sound');
    if (!fs.existsSync(soundFolderPath)) {
    fs.mkdirSync(soundFolderPath, { recursive: true });
    }

    // ...existing code...

    // Handle file copying
    ipcMain.on('copy-file-to-sound-folder', (event, originalFilePath) => {
    try {
        const fileName = path.basename(originalFilePath);
        const destinationPath = path.join(soundFolderPath, fileName);
        
        // Copy the file
        fs.copyFileSync(originalFilePath, destinationPath);

        generateWaveform(destinationPath)
            .then(analysisResults => {
                // Send complete analysis data back to the renderer process
                event.sender.send('audio-analysis-data', analysisResults);
            })
            .catch(error => {
                console.error('Error generating waveform:', error);
                event.sender.send('waveform-error', error.message);
            });
        
        // Send success message with the new file path
        event.sender.send('file-copy-success', destinationPath);
    } catch (error) {
        console.error('Error copying file:', error);
        event.sender.send('file-copy-error', error.message);
    }
    });

    // Handle file data processing (for file input selections)
    ipcMain.on('process-file-data', (event, fileData) => {
        try {
            const fileName = fileData.name;
            const destinationPath = path.join(soundFolderPath, fileName);
            
            // Write the file data to the sound folder
            const buffer = Buffer.from(fileData.data);
            fs.writeFileSync(destinationPath, buffer);
            
            console.log('File saved to:', destinationPath);
            
            // Generate waveform from the saved file
            generateWaveform(destinationPath)
                .then(analysisResults => {
                    // Send complete analysis data back to the renderer process
                    event.sender.send('audio-analysis-data', analysisResults);
                })
                .catch(error => {
                    console.error('Error generating waveform:', error);
                    event.sender.send('waveform-error', error.message);
                });
            
            // Send success message with the new file path
            event.sender.send('file-copy-success', destinationPath);
        } catch (error) {
            console.error('Error processing file data:', error);
            event.sender.send('file-copy-error', error.message);
        }
    });

// ...existing code...

});