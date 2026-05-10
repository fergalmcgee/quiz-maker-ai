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

## 7. How to Update (Safe Side-by-Side Method)
This is the recommended way to update your application. It allows you to keep the old version as a backup while moving to the new one.

### 1. Prepare the New Folder
1. Create a **new folder** on your Windows Server (e.g., `C:\Projects\QuizMaker_V2`).
2. Copy the entire contents of your new `QuizMaker` project (built on your Mac) into this new folder.
3. On the Windows Server, inside the new `server` folder, run:
   ```cmd
   npm install
   ```

### 2. Copy the Database & Uploads (CRITICAL)
Your `quizmaker.db` file contains all your quizzes, students, and results. Your `public/uploads` folder contains all your uploaded images. To move your data to the new version:
1. Go to your **old** folder (e.g., `C:\Projects\QuizMaker\server`).
2. **Copy** the `quizmaker.db` file.
3. **Paste** it into the **new** server folder (e.g., `C:\Projects\QuizMaker_V2\server`).
4. If it asks to overwrite, say **Yes** (the new version will automatically "upgrade" the database file on its first run).
5. Next, go back to your **old** server folder and **Copy** the entire `public/uploads` folder (if it exists).
6. **Paste** this folder into the **new** server's `public` folder `C:\Projects\QuizMaker_V2\server\public\`.

### 3. Switch Servers
1. **Stop the old server**: Close the command prompt window where the old version is running.
2. **Start the new server**:
   ```cmd
   cd C:\Projects\QuizMaker_V2\server
   node server.js
   ```
3. **Verify**: Open `http://localhost:3001`. You should see the new version of the site, and all your existing quizzes and users will be present.

### 4. Keep the Old Folder as Backup
You now have the old `C:\Projects\QuizMaker` folder as a complete backup. If anything goes wrong, you can simply stop the new server and restart the old one.

---

---

## 8. Troubleshooting: "Not a valid Win32 application" (SQLite Error)
If you see an error like `ERR_DLOPEN_FAILED` or `is not a valid Win32 application` referring to `node_sqlite3.node`, it means the `sqlite3` driver was installed for a different computer (like your Mac) and won't run on Windows.

**To fix this on your Windows Server:**
1. Navigate to the `server` folder: `cd C:\Projects\QuizMakerVersion2\server`
2. **Delete** the `node_modules` folder.
3. **Delete** the `package-lock.json` file.
4. Run a fresh install:
   ```cmd
   npm install
   ```
5. Try starting the server again: `node server.js`

> [!TIP]
> This "Clean Install" ensures that Node.js downloads the specific Windows-compatible version of the database driver for your server.
