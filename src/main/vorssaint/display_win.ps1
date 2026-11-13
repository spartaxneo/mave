param([string]$Action = "sleep", [int]$Brightness = 50)

if ($Action -eq "sleep") {
    $csharp = @"
using System;
using System.Runtime.InteropServices;
public class DisplaySleepHelper {
    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@
    Add-Type -TypeDefinition $csharp -ErrorAction SilentlyContinue
    # SendMessage(HWND_BROADCAST=0xffff, WM_SYSCOMMAND=0x0112, SC_MONITORPOWER=0xF170, 2=off)
    [DisplaySleepHelper]::SendMessage([IntPtr]0xffff, 0x0112, [IntPtr]0xf170, [IntPtr]2)
    Write-Output "DISPLAY_SLEEP_OK"
} elseif ($Action -eq "brightness") {
    try {
        $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop
        $m.WmiSetBrightness(1, $Brightness)
        Write-Output "BRIGHTNESS_WMI_OK"
    } catch {
        Write-Output "BRIGHTNESS_SOFTWARE_OK"
    }
}
