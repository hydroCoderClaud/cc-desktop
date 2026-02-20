# Power Settings QA: Keep App Active When Screen Is Off

## Problem

CC Desktop stops responding after the screen turns off (e.g., DingTalk bridge disconnects, WebSocket connections drop), and only resumes when the screen is turned back on. This interrupts background tasks and prevents unattended automation scenarios.

## Root Cause

Modern Windows laptops and desktops commonly use **Modern Standby (S0 Low Power Idle)** instead of traditional sleep (S3). When the screen turns off, Modern Standby enters a low-power cycle:

- The system briefly wakes every ~1 minute (to check notifications, etc.), then returns to low power
- Processes are throttled, network connections are degraded or dropped
- Application-level APIs like `powerSaveBlocker` **cannot prevent** Modern Standby

### How to Check if Your System Uses Modern Standby

Open an elevated terminal and run:

```cmd
powercfg /a
```

If the output includes **"Standby (S0 Low Power Idle)"** under available sleep states, your system uses Modern Standby.

## Solution

### Step 1: Disable Modern Standby (Requires Reboot)

Open an elevated terminal and run:

```cmd
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Power" /v PlatformAoAcOverride /t REG_DWORD /d 0 /f
```

Then **reboot your computer**.

After reboot, verify:

```cmd
powercfg /a
```

You should see **"Standby (S0 Low Power Idle)"** moved from available to unavailable sleep states.

> **To restore Modern Standby**: Delete the registry value and reboot:
> ```cmd
> reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Power" /v PlatformAoAcOverride /f
> ```

### Step 2: Disable Hibernate Timer

After disabling Modern Standby, the system may still **hibernate** after a period of inactivity (which freezes all processes, same as sleep).

Open **Control Panel → Power Options → Change Plan Settings → Change Advanced Power Settings**:

- **Sleep → Hibernate after → Plugged in**: Set to **0** (Never)

### Step 3: Disable Wi-Fi Power Saving (Optional)

If using a Wi-Fi connection:

1. Open **Device Manager**
2. Expand **Network adapters**, right-click your Wi-Fi adapter → **Properties**
3. **Advanced** tab:
   - **MIMO Power Save Mode** → Set to **No SMPS**
   - **Transmit Power** → Set to **Highest**

## Expected Result

| Item | Status |
|------|--------|
| Screen | Turns off after configured timeout |
| System | Stays fully running |
| Network | Stays active |
| CC Desktop | Continues responding (DingTalk bridge, Agent sessions, etc.) |

## Built-in Protection in CC Desktop

CC Desktop includes the following mechanisms (no user action needed):

- **`powerSaveBlocker`**: Tells the OS not to suspend the app process
- **`powerMonitor.on('resume')`**: Auto-reconnects DingTalk bridge after system wakes from sleep
