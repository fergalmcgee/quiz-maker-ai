# Windows Server Installation & Deployment Guide for QuizMaker

This guide will walk you through compiling the application and running it on your Windows Server.

## 1. Prepare the Application (On your Mac or Dev Machine)
Before moving the files to the Windows Server, we need to build the React frontend into static HTML/JS files.

1. Open a terminal and navigate to the project folder on your Mac:
   ```bash
   cd /Users/fergal.mcgee/Documents/Projects/QuizMaker/client
   ```
2. Install dependencies (if you haven't already):
   ```bash
   npm install
   ```
3. Build the frontend app:
   ```bash
   npm run build
   ```
   *This command creates a `dist` folder inside `QuizMaker/client`. This folder contains the entire frontend ready for production.*

## 2. Prepare the Server
The server is already configured to automatically detect and serve the built frontend from the `client/dist` folder. No changes are needed to the code.

## 3. Transfer Files to Windows Server
1. Copy the entire `QuizMaker` folder to your Windows Server. You can put it anywhere (e.g., `C:\Projects\QuizMaker`).
2. **Note:** You do not need to copy the `node_modules` folders, as we will freshly install dependencies on the Windows machine.

## 4. Install Prerequisites on Windows Server
1. Download **Node.js**: Go to [nodejs.org](https://nodejs.org/) on your Windows Server and download the **LTS (Long Term Support)** Windows Installer (`.msi`).
2. Run the installer (clicking "Next" through the default options).
3. Open **Command Prompt (cmd)** or **PowerShell** and verify the installation:
   ```cmd
   node -v
   npm -v
   ```

## 5. Run the Application on Windows Server
1. Open **Command Prompt** or **PowerShell**.
2. Navigate to the server directory:
   ```cmd
   cd C:\Projects\QuizMaker\server
   ```
3. Install the dependencies for the server:
   ```cmd
   npm install
   ```
4. Start the server (this single command now runs both the backend API and serves the frontend website):
   ```cmd
   node server.js
   ```

## 6. Accessing the Application
- **From the server itself**: Open a browser and go to `http://localhost:3001`
- **From other computers on the school network**: Find the local IP address of the Windows Server (open Command Prompt and type `ipconfig`, look for `IPv4 Address`). If the IP is `192.168.1.50`, students and teachers can access the app by navigating to `http://192.168.1.50:3001` on their iPads/Chromebooks.

### Important: Windows Firewall
If students on the network cannot access the IP address, you may need to open port `3001` in the Windows Defender Firewall:
1. Open "Windows Defender Firewall with Advanced Security".
2. Create a **New Inbound Rule**.
3. Select **Port** -> **TCP** -> Specific local ports: `3001`.
4. Allow the connection -> Apply to Domain/Private/Public -> Name it "QuizMaker Server".
