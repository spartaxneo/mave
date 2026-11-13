# MAVE — Hyper-V & Virtual Machine Platform Automated Provisioning Script
# Requires Administrator privileges.
# Enables hardware virtualization platform components for MAVE Virtual Computer.

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  MAVE — Hyper-V & Virtual Machine Platform Setup" -ForegroundColor Cyan
Write-Host "  Tagline: A Little Friend for Everything" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Check for Administrative elevation
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "This script requires Administrator privileges to enable Windows hypervisor features."
    Write-Host "Please right-click PowerShell, select 'Run as Administrator', and re-run this script." -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/4] Checking BIOS/UEFI Hardware Virtualization Status..." -ForegroundColor Yellow
$proc = Get-CimInstance -ClassName Win32_Processor
if ($proc.VirtualizationFirmwareEnabled -eq $false) {
    Write-Warning "Hardware Virtualization (SVM / AMD-V / Intel VT-x) is disabled in your motherboard BIOS/UEFI."
    Write-Host "Please restart your PC, enter BIOS setup (Del/F2), and enable 'SVM Mode' or 'Intel Virtualization Technology'." -ForegroundColor Yellow
} else {
    Write-Host "Hardware Virtualization is active in motherboard firmware." -ForegroundColor Green
}

Write-Host "[2/4] Enabling Microsoft Windows VirtualMachinePlatform..." -ForegroundColor Yellow
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

Write-Host "[3/4] Adding current user to Hyper-V Administrators local group..." -ForegroundColor Yellow
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
try {
    net localgroup "Hyper-V Administrators" "$currentUser" /add
    Write-Host "User $currentUser added to Hyper-V Administrators group." -ForegroundColor Green
} catch {
    Write-Host "Hyper-V Administrators group configuration: $($_.Exception.Message)" -ForegroundColor Gray
}

Write-Host "[4/4] Updating WSL Kernel to Latest Release..." -ForegroundColor Yellow
wsl.exe --update --web-download

Write-Host "=================================================================" -ForegroundColor Green
Write-Host "  MAVE Hyper-V & Virtual Machine Platform Configuration Complete!" -ForegroundColor Green
Write-Host "  Note: A system reboot is recommended for Windows Hypervisor to initialize." -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Green
