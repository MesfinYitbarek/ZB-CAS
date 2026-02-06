import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for assessment security features
 * Prevents cheating and ensures assessment integrity
 */
export default function useAssessmentSecurity(assessmentId, onViolation) {
  const [violations, setViolations] = useState([]);
  const [isTabActive, setIsTabActive] = useState(true);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [copyAttempts, setCopyAttempts] = useState(0);
  const [rightClickAttempts, setRightClickAttempts] = useState(0);
  const [fullscreenExits, setFullscreenExits] = useState(0);
  const [timerStarted, setTimerStarted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  
  const warningShown = useRef(false);
  const violationLog = useRef([]);

  // Log violation
  const logViolation = useCallback((type, details) => {
    const violation = {
      type,
      details,
      timestamp: new Date().toISOString(),
      assessmentId,
    };
    
    violationLog.current.push(violation);
    setViolations((prev) => [...prev, violation]);
    
    if (onViolation) {
      onViolation(violation);
    }
  }, [assessmentId, onViolation]);

  // Tab/Window visibility detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsTabActive(false);
        setTabSwitchCount((prev) => prev + 1);
        logViolation('TAB_SWITCH', 'User switched away from assessment tab');
      } else {
        setIsTabActive(true);
      }
    };

    const handleBlur = () => {
      logViolation('WINDOW_BLUR', 'Assessment window lost focus');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [logViolation]);

  // Prevent copy/paste
  useEffect(() => {
    const handleCopy = (e) => {
      e.preventDefault();
      setCopyAttempts((prev) => prev + 1);
      logViolation('COPY_ATTEMPT', 'User attempted to copy content');
      return false;
    };

    const handlePaste = (e) => {
      e.preventDefault();
      logViolation('PASTE_ATTEMPT', 'User attempted to paste content');
      return false;
    };

    const handleCut = (e) => {
      e.preventDefault();
      logViolation('CUT_ATTEMPT', 'User attempted to cut content');
      return false;
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('cut', handleCut);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut', handleCut);
    };
  }, [logViolation]);

  // Prevent right-click
  useEffect(() => {
    const handleContextMenu = (e) => {
      e.preventDefault();
      setRightClickAttempts((prev) => prev + 1);
      logViolation('RIGHT_CLICK', 'User attempted to open context menu');
      return false;
    };

    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [logViolation]);

  // Prevent keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // F12 (DevTools)
      if (e.keyCode === 123) {
        e.preventDefault();
        logViolation('DEVTOOLS_ATTEMPT', 'F12 pressed');
        return false;
      }
      
      // Ctrl+Shift+I (DevTools)
      if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
        e.preventDefault();
        logViolation('DEVTOOLS_ATTEMPT', 'Ctrl+Shift+I pressed');
        return false;
      }
      
      // Ctrl+Shift+C (Inspect Element)
      if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
        e.preventDefault();
        logViolation('DEVTOOLS_ATTEMPT', 'Ctrl+Shift+C pressed');
        return false;
      }
      
      // Ctrl+U (View Source)
      if (e.ctrlKey && e.keyCode === 85) {
        e.preventDefault();
        logViolation('VIEW_SOURCE_ATTEMPT', 'Ctrl+U pressed');
        return false;
      }

      // Ctrl+S (Save page)
      if (e.ctrlKey && e.keyCode === 83) {
        e.preventDefault();
        logViolation('SAVE_ATTEMPT', 'Ctrl+S pressed');
        return false;
      }

      // Print Screen
      if (e.keyCode === 44) {
        logViolation('SCREENSHOT_ATTEMPT', 'Print Screen pressed');
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [logViolation]);

  // Fullscreen monitoring
  const requestFullscreen = useCallback(() => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {
        logViolation('FULLSCREEN_DENIED', 'User denied fullscreen request');
      });
    }
  }, [logViolation]);

  const exitFullscreen = useCallback(() => {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setFullscreenExits((prev) => prev + 1);
        logViolation('FULLSCREEN_EXIT', 'User exited fullscreen mode');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [logViolation]);

  // Timer
  const startTimer = useCallback((minutes) => {
    setTimeRemaining(minutes * 60);
    setTimerStarted(true);
  }, []);

  useEffect(() => {
    if (!timerStarted || timeRemaining === null) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          logViolation('TIME_EXPIRED', 'Assessment time limit reached');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerStarted, timeRemaining, logViolation]);

  // Warnings
  useEffect(() => {
    const totalViolations = tabSwitchCount + copyAttempts + rightClickAttempts;
    
    if (totalViolations >= 3 && !warningShown.current) {
      warningShown.current = true;
      logViolation('WARNING_THRESHOLD', `Multiple violations detected (${totalViolations} total)`);
    }

    if (totalViolations >= 5) {
      logViolation('CRITICAL_VIOLATIONS', `Critical violation count reached (${totalViolations} total)`);
    }
  }, [tabSwitchCount, copyAttempts, rightClickAttempts, logViolation]);

  const formatTime = (seconds) => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
    formatTime,
    getViolationLog: () => violationLog.current,
    totalViolations: tabSwitchCount + copyAttempts + rightClickAttempts + fullscreenExits,
    isHighRisk: (tabSwitchCount + copyAttempts + rightClickAttempts + fullscreenExits) >= 5,
    timeExpired: timeRemaining === 0,
  };
}
