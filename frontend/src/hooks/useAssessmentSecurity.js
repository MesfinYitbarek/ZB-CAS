import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useAssessmentSecurity
 *
 * Fixes vs original:
 *  1. window 'blur' removed — triggered on ANY focus loss (devtools, OS
 *     notifications, clicking browser chrome) causing false violations.
 *  2. fullscreenchange guard — only fires violation if the assessment has
 *     actually entered fullscreen at least once (prevents false violation
 *     on initial page load when fullscreenElement is null by default).
 *  3. logViolation stabilised — wrapped in useRef so it never changes
 *     identity, breaking the dependency-array infinite-loop.
 *  4. WARNING_THRESHOLD / CRITICAL_VIOLATIONS effects removed — they called
 *     logViolation inside a useEffect that watched violation counts, creating
 *     a cascade of extra violations every time a real one fired.
 *  5. Tab-switch debounce — visibilitychange can fire twice in quick
 *     succession; 300 ms debounce collapses them into one event.
 */
export default function useAssessmentSecurity(assessmentId, onViolation) {
  const [violations,        setViolations]        = useState([]);
  const [isTabActive,       setIsTabActive]        = useState(true);
  const [tabSwitchCount,    setTabSwitchCount]     = useState(0);
  const [copyAttempts,      setCopyAttempts]       = useState(0);
  const [rightClickAttempts,setRightClickAttempts] = useState(0);
  const [fullscreenExits,   setFullscreenExits]    = useState(0);
  const [timerStarted,      setTimerStarted]       = useState(false);
  const [timeRemaining,     setTimeRemaining]      = useState(null);

  // ── Stable refs ──────────────────────────────────────────────────────────
  const violationLog    = useRef([]);
  const onViolationRef  = useRef(onViolation);
  const hasEnteredFS      = useRef(false);  // true once fullscreen was granted
  const programmaticExit  = useRef(false);  // true when WE call exitFullscreen (submit)
  const tabDebounce       = useRef(null);   // debounce timer for visibilitychange

  // Keep callback ref fresh without triggering re-renders
  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);

  // ── Stable logViolation — identity never changes ──────────────────────────
  const logViolation = useRef((type, details) => {
    const violation = {
      type,
      details,
      timestamp: new Date().toISOString(),
      assessmentId,
    };
    violationLog.current.push(violation);
    setViolations(prev => [...prev, violation]);
    onViolationRef.current?.(violation);
  }).current;

  // ── Tab / visibility ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Debounce: collapse rapid double-fires into one
        if (tabDebounce.current) return;
        tabDebounce.current = setTimeout(() => {
          tabDebounce.current = null;
        }, 300);

        setIsTabActive(false);
        setTabSwitchCount(prev => prev + 1);
        logViolation('TAB_SWITCH', 'User switched away from assessment tab');
      } else {
        setIsTabActive(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (tabDebounce.current) clearTimeout(tabDebounce.current);
    };
  }, [logViolation]);

  // ── Copy / paste / cut ────────────────────────────────────────────────────
  useEffect(() => {
    const handleCopy = (e) => {
      e.preventDefault();
      setCopyAttempts(prev => prev + 1);
      logViolation('COPY_ATTEMPT', 'User attempted to copy content');
    };
    const handlePaste = (e) => {
      e.preventDefault();
      logViolation('PASTE_ATTEMPT', 'User attempted to paste content');
    };
    const handleCut = (e) => {
      e.preventDefault();
      logViolation('CUT_ATTEMPT', 'User attempted to cut content');
    };

    document.addEventListener('copy',  handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('cut',   handleCut);
    return () => {
      document.removeEventListener('copy',  handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut',   handleCut);
    };
  }, [logViolation]);

  // ── Right-click ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handleContextMenu = (e) => {
      e.preventDefault();
      setRightClickAttempts(prev => prev + 1);
      logViolation('RIGHT_CLICK', 'User attempted to open context menu');
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, [logViolation]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.keyCode === 123) {
        e.preventDefault();
        logViolation('DEVTOOLS_ATTEMPT', 'F12 pressed');
      } else if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
        e.preventDefault();
        logViolation('DEVTOOLS_ATTEMPT', 'Ctrl+Shift+I pressed');
      } else if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
        e.preventDefault();
        logViolation('DEVTOOLS_ATTEMPT', 'Ctrl+Shift+C pressed');
      } else if (e.ctrlKey && e.keyCode === 85) {
        e.preventDefault();
        logViolation('VIEW_SOURCE_ATTEMPT', 'Ctrl+U pressed');
      } else if (e.ctrlKey && e.keyCode === 83) {
        e.preventDefault();
        logViolation('SAVE_ATTEMPT', 'Ctrl+S pressed');
      } else if (e.keyCode === 44) {
        logViolation('SCREENSHOT_ATTEMPT', 'Print Screen pressed');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [logViolation]);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const requestFullscreen = useCallback(() => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen()
        .then(() => { hasEnteredFS.current = true; })
        .catch(() => logViolation('FULLSCREEN_DENIED', 'User denied fullscreen request'));
    }
  }, [logViolation]);

  const exitFullscreen = useCallback(() => {
    if (document.exitFullscreen && document.fullscreenElement) {
      programmaticExit.current = true;   // mark so handler skips violation
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        // Skip if we triggered the exit ourselves (e.g. after submission)
        if (programmaticExit.current) {
          programmaticExit.current = false;
          return;
        }
        // Only flag as violation if we had previously entered fullscreen
        // (prevents false positive on initial page load)
        if (hasEnteredFS.current) {
          setFullscreenExits(prev => prev + 1);
          logViolation('FULLSCREEN_EXIT', 'User exited fullscreen mode');
        }
      } else {
        // Entering fullscreen — mark that we've been in fullscreen
        hasEnteredFS.current = true;
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [logViolation]);

  // ── Timer ─────────────────────────────────────────────────────────────────
  const startTimer = useCallback((minutes) => {
    setTimeRemaining(minutes * 60);
    setTimerStarted(true);
  }, []);

  useEffect(() => {
    if (!timerStarted || timeRemaining === null || timeRemaining <= 0) return;
    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          logViolation('TIME_EXPIRED', 'Assessment time limit reached');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerStarted, logViolation]); // intentionally exclude timeRemaining

  const formatTime = (seconds) => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Every logged violation counts — including DevTools, paste/cut, save,
  // printscreen, view-source, fullscreen-denied and time-expired events.
  // The per-type counters above are kept for display/stats only.
  const totalViolations = violations.length;

  // Reset per-attempt violation state when a retake starts. Stable identity
  // (useCallback, empty deps) so consumer effects never re-fire. Timer and
  // fullscreen refs are intentionally untouched — the caller restarts those.
  const resetViolations = useCallback(() => {
    violationLog.current = [];
    setViolations([]);
    setIsTabActive(true);
    setTabSwitchCount(0);
    setCopyAttempts(0);
    setRightClickAttempts(0);
    setFullscreenExits(0);
  }, []);

  return {
    violations,
    isTabActive,
    tabSwitchCount,
    copyAttempts,
    rightClickAttempts,
    fullscreenExits,
    timeRemaining,
    timerStarted,
    requestFullscreen,
    exitFullscreen,
    startTimer,
    resetViolations,
    formatTime,
    getViolationLog: () => violationLog.current,
    totalViolations,
    isHighRisk: totalViolations >= 5,
    timeExpired: timeRemaining === 0,
  };
}
