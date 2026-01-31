$ErrorActionPreference = "Stop"

Write-Host "Setting up Git repository..."

# Check if inner .git exists and rename it to avoid submodule issues
if (Test-Path "spare-parts-app\.git") {
    Write-Host "Detected nested git repository in spare-parts-app. Attempting to backup..."
    try {
        Rename-Item "spare-parts-app\.git" "spare-parts-app\.git.backup" -Force
        Write-Host "Successfully backed up inner .git to .git.backup"
    }
    catch {
        Write-Error "Could not rename 'spare-parts-app\.git'. Please make sure the server is stopped and no files are open in that folder, then try again."
        exit 1
    }
}

# Initialize git if not present
if (-not (Test-Path ".git")) {
    Write-Host "Initializing new git repository..."
    git init
} else {
    Write-Host "Git repository already initialized."
}

# Remove submodule index if it was accidentally added
if ((git ls-files --stage spare-parts-app) -match "^160000") {
    Write-Host "Removing accidental submodule reference..."
    git rm --cached spare-parts-app
}

# Add files
Write-Host "Adding files to stage..."
git add .

# Commit
# Check if there are changes to commit
if ((git status --porcelain) -ne "") {
    Write-Host "Committing changes..."
    git commit -m "Initial commit: Spare Parts Management System"
} else {
    Write-Host "Nothing to commit."
}

# Branch
git branch -M main

# Remote
try {
    git remote add origin https://github.com/siver2001/Spare-Part-Management.git
}
catch {
    Write-Host "Remote 'origin' might already exist. Updating URL..."
    git remote set-url origin https://github.com/siver2001/Spare-Part-Management.git
}

# Push
Write-Host "Pushing to GitHub (you may need to authenticate)..."
git push -u origin main

Write-Host "Done!"
