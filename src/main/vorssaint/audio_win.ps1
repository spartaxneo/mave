param([int]$Volume = -1, [switch]$Mute, [switch]$Unmute)

$wsh = New-Object -ComObject WScript.Shell

if ($Mute) {
    $wsh.SendKeys([char]173)
} elseif ($Unmute) {
    $wsh.SendKeys([char]173)
}

if ($Volume -ge 0) {
    # Bring volume to 0%, then step up to target percentage
    for ($i = 0; $i -lt 50; $i++) {
        $wsh.SendKeys([char]174)
    }
    $steps = [Math]::Round($Volume / 2)
    for ($i = 0; $i -lt $steps; $i++) {
        $wsh.SendKeys([char]175)
    }
}
Write-Output "OK"
