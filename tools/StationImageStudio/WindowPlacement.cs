using System;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Interop;

namespace StationImageStudio;

/// <summary>
/// Remember where the window was, and put it back there.
///
/// WHY WINDOWPLACEMENT AND NOT Top/Left/Width/Height.
///
/// Saving the four WPF properties looks like it solves this and does not, for
/// four separate reasons:
///
///   1. RESTORE BOUNDS. While a window is maximized, Left/Top/Width/Height report
///      the MAXIMIZED rectangle. Save those and the window has permanently
///      forgotten the size it should return to when un-maximized. WINDOWPLACEMENT
///      carries rcNormalPosition, which is always the restore rectangle whatever
///      the window is doing at the time.
///
///   2. UNITS. WPF properties are device independent pixels, relative to a
///      notional 96 DPI. Move a window between a 100% monitor and a 175% one and
///      the same DIP rectangle is a different physical rectangle. WINDOWPLACEMENT
///      is in workspace pixels, which is what "the same place on the same
///      monitor" actually means.
///
///   3. NEGATIVE COORDINATES. A monitor placed to the left of, or above, the
///      primary one has negative desktop coordinates. Nothing here assumes the
///      desktop starts at (0,0), and the RECT fields are signed.
///
///   4. STATE. Maximized and minimized are not positions. showCmd carries them,
///      and carries them separately from the rectangle, which is exactly the
///      separation that makes "maximized on monitor 3" restorable.
///
/// Windows also does part of the safety work: SetWindowPlacement clamps a
/// rectangle to the monitor it lands on. It does NOT rescue a window whose
/// rectangle is on a monitor that no longer exists, so that case is checked
/// explicitly before the call, in ClampToVisibleDesktop.
/// </summary>
internal static class WindowPlacement
{
    private const int SW_HIDE = 0;
    private const int SW_SHOWNORMAL = 1;
    private const int SW_SHOWMINIMIZED = 2;
    private const int SW_SHOWMAXIMIZED = 3;

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left, Top, Right, Bottom;
        public int Width => Right - Left;
        public int Height => Bottom - Top;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X, Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct WINDOWPLACEMENT
    {
        public int length;
        public int flags;
        public int showCmd;
        public POINT minPosition;
        public POINT maxPosition;
        public RECT normalPosition;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public int dwFlags;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPlacement(IntPtr hWnd, [In] ref WINDOWPLACEMENT lpwndpl);

    private const int MONITOR_DEFAULTTONULL = 0;
    private const int MONITOR_DEFAULTTOPRIMARY = 1;
    private const int MONITOR_DEFAULTTONEAREST = 2;

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromRect([In] ref RECT lprc, int dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

    // ─── save ────────────────────────────────────────────────────────────────

    /// <summary>
    /// The window's placement as a JSON object, or null if it cannot be read.
    /// Safe to call at any time, including while maximized or minimized: the
    /// rectangle returned is always the RESTORE rectangle.
    /// </summary>
    public static JsonObject? Capture(Window window)
    {
        try
        {
            var hwnd = new WindowInteropHelper(window).Handle;
            if (hwnd == IntPtr.Zero) return null;

            var wp = new WINDOWPLACEMENT();
            wp.length = Marshal.SizeOf<WINDOWPLACEMENT>();
            if (!GetWindowPlacement(hwnd, ref wp)) return null;

            // SW_HIDE and the various SHOWNA values are transient and mean
            // nothing to restore. Anything that is not maximized or minimized is
            // recorded as normal.
            var state = wp.showCmd switch
            {
                SW_SHOWMAXIMIZED => "maximized",
                SW_SHOWMINIMIZED => "minimized",
                _ => "normal",
            };

            return new JsonObject
            {
                ["state"] = state,
                // Workspace pixels. Signed on purpose: a monitor left of or above
                // the primary one produces negative values and they are correct.
                ["left"] = wp.normalPosition.Left,
                ["top"] = wp.normalPosition.Top,
                ["right"] = wp.normalPosition.Right,
                ["bottom"] = wp.normalPosition.Bottom,
                // Recorded for diagnosis only. Restoration does NOT trust these:
                // a monitor layout that has changed is detected by testing the
                // saved rectangle against the monitors that exist right now,
                // which stays correct however the displays were renumbered.
                ["virtualScreen"] = new JsonObject
                {
                    ["left"] = (int)SystemParameters.VirtualScreenLeft,
                    ["top"] = (int)SystemParameters.VirtualScreenTop,
                    ["width"] = (int)SystemParameters.VirtualScreenWidth,
                    ["height"] = (int)SystemParameters.VirtualScreenHeight,
                },
            };
        }
        catch { return null; }
    }

    // ─── restore ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Put the window back. Call from SourceInitialized: the HWND must exist, and
    /// doing it before the first render avoids the window visibly jumping.
    ///
    /// Returns a short description of what happened, for the log.
    /// </summary>
    public static string Restore(Window window, JsonObject? saved)
    {
        if (saved == null) return "no saved window position; opening at the default.";

        try
        {
            var hwnd = new WindowInteropHelper(window).Handle;
            if (hwnd == IntPtr.Zero) return "window handle not ready; opening at the default.";

            int left = (int?)saved["left"] ?? 0;
            int top = (int?)saved["top"] ?? 0;
            int right = (int?)saved["right"] ?? 0;
            int bottom = (int?)saved["bottom"] ?? 0;
            var state = (string?)saved["state"] ?? "normal";

            var rect = new RECT { Left = left, Top = top, Right = right, Bottom = bottom };
            if (rect.Width < 200 || rect.Height < 150)
                return "saved size was implausibly small; opening at the default.";

            var note = "";
            if (!IsOnAVisibleMonitor(rect))
            {
                rect = ClampToVisibleDesktop(rect);
                note = " The saved monitor is gone, so it was moved onto the nearest available display at the same size.";
            }

            var wp = new WINDOWPLACEMENT();
            wp.length = Marshal.SizeOf<WINDOWPLACEMENT>();
            wp.flags = 0;
            wp.showCmd = state switch
            {
                "maximized" => SW_SHOWMAXIMIZED,
                // Restored faithfully, as asked. The normalPosition below is what
                // it un-minimizes to, so the restore rectangle survives even
                // though the window opens minimized.
                "minimized" => SW_SHOWMINIMIZED,
                _ => SW_SHOWNORMAL,
            };
            wp.minPosition = new POINT { X = -1, Y = -1 };
            wp.maxPosition = new POINT { X = -1, Y = -1 };
            wp.normalPosition = rect;

            if (!SetWindowPlacement(hwnd, ref wp))
                return "could not apply the saved window position; opening at the default.";

            return $"restored {state} at {rect.Left},{rect.Top} {rect.Width}x{rect.Height}.{note}";
        }
        catch (Exception ex) { return "window restore failed (" + ex.Message + "); opening at the default."; }
    }

    /// <summary>
    /// True when the rectangle overlaps a monitor that exists right now.
    ///
    /// MONITOR_DEFAULTTONULL is the whole point: it returns null when the
    /// rectangle intersects NO display, which is precisely the
    /// laptop-undocked-from-three-monitors case. Asking Windows beats comparing
    /// against a remembered layout, because it stays correct when displays are
    /// renumbered, rearranged, rotated or rescaled.
    /// </summary>
    private static bool IsOnAVisibleMonitor(RECT rect)
    {
        var mon = MonitorFromRect(ref rect, MONITOR_DEFAULTTONULL);
        if (mon == IntPtr.Zero) return false;

        // Intersecting is not sufficient: a window may overlap a display by two
        // pixels of its bottom corner and still be unusable. Require enough of
        // the TITLE BAR to be reachable, since that is what the user needs to
        // drag it back.
        var mi = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
        if (!GetMonitorInfo(mon, ref mi)) return true;   // cannot tell; do not fight it

        var work = mi.rcWork;
        var visibleWidth = Math.Min(rect.Right, work.Right) - Math.Max(rect.Left, work.Left);
        var titleBarVisible = Math.Min(rect.Top + 40, work.Bottom) - Math.Max(rect.Top, work.Top);
        return visibleWidth >= 120 && titleBarVisible >= 20;
    }

    /// <summary>
    /// Move a rectangle onto the nearest display, keeping its SIZE wherever the
    /// display can hold it. Size is preserved in preference to position because a
    /// window that comes back the right shape in the wrong place is a small
    /// annoyance, and one that comes back the wrong shape is a lost workspace.
    /// </summary>
    private static RECT ClampToVisibleDesktop(RECT rect)
    {
        var mon = MonitorFromRect(ref rect, MONITOR_DEFAULTTONEAREST);
        var mi = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
        if (mon == IntPtr.Zero || !GetMonitorInfo(mon, ref mi))
        {
            // No monitor answered at all. Fall back to the primary work area via
            // WPF, which is always available.
            var w = (int)SystemParameters.WorkArea.Width;
            var h = (int)SystemParameters.WorkArea.Height;
            var ww = Math.Min(rect.Width, w);
            var hh = Math.Min(rect.Height, h);
            return new RECT { Left = 0, Top = 0, Right = ww, Bottom = hh };
        }

        var work = mi.rcWork;
        var width = Math.Min(rect.Width, work.Width);
        var height = Math.Min(rect.Height, work.Height);

        // Keep the offset within the monitor where it fits, then pull it back
        // inside if it hangs off an edge.
        var newLeft = Math.Max(work.Left, Math.Min(rect.Left, work.Right - width));
        var newTop = Math.Max(work.Top, Math.Min(rect.Top, work.Bottom - height));

        return new RECT
        {
            Left = newLeft,
            Top = newTop,
            Right = newLeft + width,
            Bottom = newTop + height,
        };
    }
}
