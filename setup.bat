: <<'BATCH'
@echo off
setlocal EnableDelayedExpansion

:: Windows CMD entry point
:: We extract lines starting from the POWERSHELL BOOTSTRAP tag and pipe them to PowerShell.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-Content -Encoding UTF8 -LiteralPath '%~f0'; $start = 0; for($i=0; $i -lt $c.Length; $i++) { if ($c[$i] -match ':::\s*POWERSHELL BOOTSTRAP\s*:::') { $start = $i + 1; break } }; if ($start -gt 0) { $c[$start..($c.Length-1)] -join [Environment]::NewLine | Invoke-Expression }"
exit /b %ERRORLEVEL%
BATCH

# ==========================================
# Linux / macOS (Bash) Setup Script
# ==========================================
# ANSI Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${CYAN}${BOLD}┌────────────────────────────────────────────────────────┐${NC}"
echo -e "${CYAN}${BOLD}│                   PIX CODE AGENT                       │${NC}"
echo -e "${CYAN}${BOLD}│             Cross-Platform Setup Wizard                │${NC}"
echo -e "${CYAN}${BOLD}└────────────────────────────────────────────────────────┘${NC}"
echo ""

# Helper functions
check_python_version() {
    if ! command -v python3 &> /dev/null; then
        return 1
    fi
    version=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    major=$(echo $version | cut -d. -f1)
    minor=$(echo $version | cut -d. -f2)
    if [ "$major" -gt 3 ] || { [ "$major" -eq 3 ] && [ "$minor" -ge 11 ]; }; then
        return 0
    else
        return 1
    fi
}

check_node_version() {
    if ! command -v node &> /dev/null; then
        return 1
    fi
    version=$(node -v | sed 's/v//')
    major=$(echo $version | cut -d. -f1)
    if [ "$major" -ge 18 ]; then
        return 0
    else
        return 1
    fi
}

echo -e "${CYAN}${BOLD}[ STEP 1/5 ] Checking Prerequisites...${NC}"

# Python Check and Install
if check_python_version; then
    py_ver=$(python3 -c 'import sys; print(sys.version.split()[0])')
    echo -e "  ${GREEN}✔ Python $py_ver detected.${NC}"
else
    echo -e "  ${YELLOW}⚠ Python 3.11+ is not detected.${NC}"
    echo -e "  → Attempting auto-installation of Python 3.11...${NC}"
    
    if command -v apt-get &> /dev/null; then
        echo -e "  → Detected Ubuntu/Debian. Installing python3.11...${NC}"
        sudo apt-get update
        sudo apt-get install -y python3.11 python3.11-venv python3-pip python3.11-dev
    elif command -v brew &> /dev/null; then
        echo -e "  → Detected macOS. Installing python@3.11 via Homebrew...${NC}"
        brew install python@3.11
    elif command -v dnf &> /dev/null; then
        echo -e "  → Detected Fedora/RHEL. Installing python3.11...${NC}"
        sudo dnf install -y python3.11 python3-pip
    else
        echo -e "  ${RED}✖ Auto-installation is not supported for your system package manager.${NC}"
        echo -e "  Please install Python 3.11+ manually using your package manager, then rerun this script.${NC}"
        exit 1
    fi

    # Verify after install
    if check_python_version; then
        echo -e "  ${GREEN}✔ Python 3.11+ installed successfully!${NC}"
    else
        echo -e "  ${RED}✖ Python 3.11+ is still not available in PATH.${NC}"
        exit 1
    fi
fi

# Node Check and Install
if check_node_version; then
    node_ver=$(node -v)
    echo -e "  ${GREEN}✔ Node.js $node_ver detected.${NC}"
else
    echo -e "  ${YELLOW}⚠ Node.js 18+ is not detected.${NC}"
    echo -e "  → Attempting auto-installation of Node.js...${NC}"

    if command -v apt-get &> /dev/null; then
        echo -e "  → Detected Ubuntu/Debian. Installing Node.js via NodeSource...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v brew &> /dev/null; then
        echo -e "  → Detected macOS. Installing Node.js via Homebrew...${NC}"
        brew install node
    else
        echo -e "  ${RED}✖ Auto-installation is not supported for your system package manager.${NC}"
        echo -e "  Please install Node.js (version 18+) manually, then rerun this script.${NC}"
        exit 1
    fi

    # Verify after install
    if check_node_version; then
        echo -e "  ${GREEN}✔ Node.js installed successfully!${NC}"
    else
        echo -e "  ${RED}✖ Node.js is still not available in PATH.${NC}"
        exit 1
    fi
fi

# Step 2: Virtual Environment Setup
echo ""
echo -e "${CYAN}${BOLD}[ STEP 2/5 ] Setting up Backend Virtual Environment...${NC}"
if [ -d "backend/.venv" ]; then
    echo -e "  ${GREEN}✔ Virtual environment (.venv) already exists.${NC}"
else
    echo -e "  → Creating virtual environment in backend/.venv...${NC}"
    if command -v python3.11 &> /dev/null; then
        python3.11 -m venv backend/.venv
    else
        python3 -m venv backend/.venv
    fi
    echo -e "  ${GREEN}✔ Virtual environment created.${NC}"
fi

echo -e "  → Upgrading pip and installing backend dependencies...${NC}"
backend/.venv/bin/pip install --upgrade pip &> /dev/null
backend/.venv/bin/pip install -r backend/requirements.txt
echo -e "  ${GREEN}✔ Backend dependencies installed.${NC}"

# Step 3: Configure Environment
echo ""
echo -e "${CYAN}${BOLD}[ STEP 3/5 ] Configuring Environment Variables...${NC}"
if [ -f "backend/.env" ]; then
    echo -e "  ${GREEN}✔ .env configuration already exists.${NC}"
else
    if [ ! -f "backend/.env.example" ]; then
        echo -e "  ${RED}✖ backend/.env.example not found! Cannot create .env.${NC}"
    else
        echo -e "  → Creating .env from .env.example...${NC}"
        cp backend/.env.example backend/.env
        
        echo ""
        echo -e "  ${YELLOW}We need to set your PIX_API_KEY.${NC}"
        echo -e "  ${YELLOW}If you do not have one, you can get it from positka.net.${NC}"
        
        read -p "  Enter your PIX_API_KEY: " api_key
        if [ ! -z "$api_key" ]; then
            python3 -c "import sys; lines = [line if not line.startswith('PIX_API_KEY=') else f'PIX_API_KEY={sys.argv[1]}\n' for line in open('backend/.env')]; open('backend/.env', 'w').writelines(lines)" "$api_key"
            echo -e "  ${GREEN}✔ PIX_API_KEY configured in backend/.env.${NC}"
        else
            echo -e "  ${YELLOW}⚠ No key entered. You will need to edit backend/.env manually later.${NC}"
        fi
    fi
fi

# Step 4: Frontend Setup
echo ""
echo -e "${CYAN}${BOLD}[ STEP 4/5 ] Setting up Frontend Dependencies...${NC}"
if [ ! -d "frontend" ]; then
    echo -e "  ${RED}✖ frontend directory not found!${NC}"
    exit 1
fi
echo -e "  → Running npm install in frontend... (This may take a moment)${NC}"
cd frontend && npm install && cd ..
echo -e "  ${GREEN}✔ Frontend dependencies installed.${NC}"

# Step 5: Verify and finish
echo ""
echo -e "${CYAN}${BOLD}[ STEP 5/5 ] Verify and Finish...${NC}"
echo -e "  ${GREEN}✔ PIX Code Agent is fully configured!${NC}"
echo ""
echo -e "${GREEN}${BOLD}┌────────────────────────────────────────────────────────┐${NC}"
echo -e "${GREEN}${BOLD}│              INSTALLATION COMPLETE!                    │${NC}"
echo -e "${GREEN}${BOLD}└────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${YELLOW}To launch the agent backend & frontend, run:${NC}"
echo -e "  ${CYAN}python trigger.py${NC}"
echo ""
echo -e "  ${GREEN}Have fun building! 🚀${NC}"
echo ""

exit 0

# ::: POWERSHELL BOOTSTRAP :::
# ==========================================
# Windows (PowerShell) Setup Script
# ==========================================
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "┌────────────────────────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "│                   PIX CODE AGENT                       │" -ForegroundColor Cyan
Write-Host "│             Cross-Platform Setup Wizard                │" -ForegroundColor Cyan
Write-Host "└────────────────────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""

function Check-Python {
    try {
        $versionStr = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        if ($null -eq $versionStr) { return $false }
        $parts = $versionStr.Split('.')
        $major = [int]$parts[0]
        $minor = [int]$parts[1]
        if ($major -gt 3 -or ($major -eq 3 -and $minor -ge 11)) {
            return $true
        }
    } catch {
        return $false
    }
    return $false
}

function Check-Node {
    try {
        $versionStr = node -v 2>$null
        if ($null -eq $versionStr) { return $false }
        $versionStr = $versionStr.TrimStart('v')
        $parts = $versionStr.Split('.')
        $major = [int]$parts[0]
        if ($major -ge 18) {
            return $true
        }
    } catch {
        return $false
    }
    return $false
}

Write-Host "[ STEP 1/5 ] Checking Prerequisites..." -ForegroundColor Cyan

# Python Check
if (-not (Check-Python)) {
    Write-Host "  ⚠ Python 3.11+ is not detected." -ForegroundColor Yellow
    Write-Host "  → Attempting auto-installation of Python 3.11 via winget..." -ForegroundColor Cyan
    try {
        winget install -e --id Python.Python.3.11 --accept-source-agreements --accept-package-agreements --silent
    } catch {
        Write-Host "  ⚠ winget installation failed or is not available." -ForegroundColor Yellow
    }
    
    # Reload environment PATH and sleep to give registry time to propagate
    Start-Sleep -Seconds 3
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    if (-not (Check-Python)) {
        Write-Host "  → Falling back to manual installer download..." -ForegroundColor Cyan
        $url = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
        $installer = "$env:TEMP\python-3.11.9.exe"
        Write-Host "  → Downloading Python 3.11 installer..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $url -OutFile $installer
        Write-Host "  → Running installer (please approve UAC prompt if shown)..." -ForegroundColor Cyan
        Start-Process $installer -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1" -Wait
        Start-Sleep -Seconds 3
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    }

    if (Check-Python) {
        Write-Host "  ✔ Python 3.11+ installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "  ✖ Python 3.11+ is still not available. Please install it manually from https://python.org" -ForegroundColor Red
        exit 1
    }
} else {
    $v = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"
    Write-Host "  ✔ Python $v detected." -ForegroundColor Green
}

# Node Check
if (-not (Check-Node)) {
    Write-Host "  ⚠ Node.js 18+ is not detected." -ForegroundColor Yellow
    Write-Host "  → Attempting auto-installation of Node.js via winget..." -ForegroundColor Cyan
    try {
        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
    } catch {
        Write-Host "  ⚠ winget installation failed or is not available." -ForegroundColor Yellow
    }

    Start-Sleep -Seconds 3
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

    if (-not (Check-Node)) {
        Write-Host "  → Falling back to manual installer download..." -ForegroundColor Cyan
        $url = "https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi"
        $installer = "$env:TEMP\node-v20.11.1.msi"
        Write-Host "  → Downloading Node.js 20 MSI..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $url -OutFile $installer
        Write-Host "  → Running installer..." -ForegroundColor Cyan
        Start-Process msiexec.exe -ArgumentList "/i $installer /qn /norestart" -Wait
        Start-Sleep -Seconds 3
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    }

    if (Check-Node) {
        Write-Host "  ✔ Node.js installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "  ✖ Node.js is still not available. Please install Node.js 18+ manually from https://nodejs.org" -ForegroundColor Red
        exit 1
    }
} else {
    $v = node -v
    Write-Host "  ✔ Node.js $v detected." -ForegroundColor Green
}

# Backend Setup
Write-Host "`n[ STEP 2/5 ] Setting up Backend Virtual Environment..." -ForegroundColor Cyan
if (-not (Test-Path "backend")) {
    Write-Host "  ✖ backend directory not found!" -ForegroundColor Red
    exit 1
}

if (Test-Path "backend\.venv") {
    Write-Host "  ✔ Virtual environment (.venv) already exists." -ForegroundColor Green
} else {
    Write-Host "  → Creating virtual environment in backend\.venv..." -ForegroundColor Cyan
    Start-Process python -ArgumentList "-m venv backend\.venv" -Wait
    if (-not (Test-Path "backend\.venv")) {
        Write-Host "  ✖ Failed to create virtual environment." -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✔ Virtual environment created." -ForegroundColor Green
}

Write-Host "  → Upgrading pip and installing backend dependencies..." -ForegroundColor Cyan
Start-Process "backend\.venv\Scripts\python.exe" -ArgumentList "-m pip install --upgrade pip" -Wait
Start-Process "backend\.venv\Scripts\pip.exe" -ArgumentList "install -r backend\requirements.txt" -Wait
Write-Host "  ✔ Backend dependencies installed." -ForegroundColor Green

# Configure Environment
Write-Host "`n[ STEP 3/5 ] Configuring Environment Variables..." -ForegroundColor Cyan
$envFile = "backend\.env"
$exampleFile = "backend\.env.example"

if (Test-Path $envFile) {
    Write-Host "  ✔ .env configuration already exists." -ForegroundColor Green
} else {
    if (-not (Test-Path $exampleFile)) {
        Write-Host "  ✖ backend\.env.example not found! Cannot create .env." -ForegroundColor Red
    } else {
        Write-Host "  → Creating .env from .env.example..." -ForegroundColor Cyan
        Copy-Item $exampleFile $envFile
        
        Write-Host ""
        Write-Host "  We need to set your PIX_API_KEY." -ForegroundColor Yellow
        Write-Host "  If you do not have one, you can get it from positka.net." -ForegroundColor Yellow
        
        $apiKey = Read-Host "  Enter your PIX_API_KEY"
        if (-not [string]::IsNullOrWhiteSpace($apiKey)) {
            $content = Get-Content $envFile
            $newContent = @()
            foreach ($line in $content) {
                if ($line -like "PIX_API_KEY=*") {
                    $newContent += "PIX_API_KEY=$apiKey"
                } else {
                    $newContent += $line
                }
            }
            $newContent | Set-Content $envFile
            Write-Host "  ✔ PIX_API_KEY configured in backend\.env." -ForegroundColor Green
        } else {
            Write-Host "  ⚠ No key entered. You will need to edit backend\.env manually later." -ForegroundColor Yellow
        }
    }
}

# Frontend Setup
Write-Host "`n[ STEP 4/5 ] Setting up Frontend Dependencies..." -ForegroundColor Cyan
if (-not (Test-Path "frontend")) {
    Write-Host "  ✖ frontend directory not found!" -ForegroundColor Red
    exit 1
}

Write-Host "  → Running npm install in frontend... (This may take a moment)" -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList "/c npm install" -WorkingDirectory "frontend" -NoNewWindow -Wait
Write-Host "  ✔ Frontend dependencies installed." -ForegroundColor Green

# Finish
Write-Host "`n[ STEP 5/5 ] Verify and Finish..." -ForegroundColor Cyan
Write-Host "  ✔ PIX Code Agent is fully configured!" -ForegroundColor Green
Write-Host "`n┌────────────────────────────────────────────────────────┐" -ForegroundColor Green
Write-Host "│              INSTALLATION COMPLETE!                    │" -ForegroundColor Green
Write-Host "└────────────────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""
Write-Host "  To launch the agent backend & frontend, run:" -ForegroundColor Yellow
Write-Host "  python trigger.py" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Have fun building! 🚀" -ForegroundColor Green
