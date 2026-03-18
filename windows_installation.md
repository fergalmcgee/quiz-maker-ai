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

## 7. How to Update (Without Losing Data)
When you want to push new security updates or features to your Windows Server, follow these steps to ensure your students and quizzes remain safe:

### 1. Backup your Database (CRITICAL)
Before doing anything else, go to your project folder on the Windows Server (e.g., `C:\Projects\QuizMaker\server`) and **copy** the file named `quizmaker.db`.
- Paste it in a safe "Backups" folder.
- Rename it with the date (e.g., `quizmaker_backup_2026_03_18.db`).
- **This file contains all your data.** Even if you delete everything else, keeping this file safe means you've kept your progress.

### 2. Get the New Code
- **If using Git**: Run `git pull` from the main `QuizMaker` folder.
- **If copying manually**: Copy these key files from your Mac to the Windows Server:
    *   **`server/api.js`** and **`server/server.js`** (Security & Logic)
    *   **`server/database.js`** (CRITICAL: This runs any necessary database "upgrades")
    *   **`server/package.json`** (Ensures all new "ingredients" are installed)
    *   **`client/dist`** folder (Replaces the old website interface)
- **DO NOT** overwrite the `quizmaker.db` file in the `server/` folder if it asks.

### 3. Rebuild the Frontend
On your Mac (where you have the full development environment):
1. Go to `QuizMaker/client` and run `npm run build`.
2. Copy the newly generated `dist` folder to the Windows Server, replacing the old `C:\Projects\QuizMaker\client\dist`.

### 4. Refresh Dependencies & Migrate Passwords
On the Windows Server, go to `C:\Projects\QuizMaker\server` and run:
```cmd
npm install
node migrate_windows.js
```
*The second command securely hashes your existing passwords so the new security features can work.*

### 5. Restart the Server
Close the old command prompt window and start the server again:
```cmd
node server.js
```

Your server will now be running the latest version with all your previous data intact!
