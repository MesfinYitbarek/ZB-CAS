# 🔐 ZB-CAS Security Features

## Assessment Security & Anti-Cheating Measures

### 1. **Tab/Window Monitoring**
- Detects when users switch away from the assessment tab
- Logs every window blur event
- Counts tab switches and triggers warnings

### 2. **Copy/Paste Prevention**
- Disables copy (Ctrl+C)
- Disables paste (Ctrl+V)
- Disables cut (Ctrl+X)
- All attempts are logged

### 3. **Right-Click Disabled**
- Context menu is completely disabled
- Prevents users from inspecting elements or copying content

### 4. **Keyboard Shortcuts Blocked**
- **F12** - Developer Tools
- **Ctrl+Shift+I** - Inspect Element
- **Ctrl+Shift+C** - Inspect Element
- **Ctrl+U** - View Page Source
- **Ctrl+S** - Save Page
- **Print Screen** - Screenshot (logged but not preventable)

### 5. **Fullscreen Mode (Optional)**
- Can request fullscreen mode for enhanced focus
- Monitors fullscreen exits
- Logs each time user exits fullscreen

### 6. **Time Limit Enforcement**
- Countdown timer displayed prominently
- Warning when < 5 minutes remaining
- Auto-submit when time expires
- Users cannot extend the time limit

### 7. **Security Acknowledgment**
- Users must acknowledge security measures before starting
- Clear warning about monitoring and consequences
- Cannot proceed without acknowledgment

### 8. **Violation Logging**
- All violations are timestamped and logged
- Violations are saved to backend with each auto-save
- Submitted with final assessment
- HR can review violation logs

### 9. **Real-Time Security Monitor**
- Visual indicator of violations during assessment
- Shows recent violations with timestamps
- Warning badge when > 3 violations
- Critical alert when > 5 violations

### 10. **Violation Types Tracked**
- `TAB_SWITCH` - User switched tabs
- `WINDOW_BLUR` - Window lost focus
- `COPY_ATTEMPT` - Attempted to copy content
- `PASTE_ATTEMPT` - Attempted to paste content
- `CUT_ATTEMPT` - Attempted to cut content
- `RIGHT_CLICK` - Attempted to open context menu
- `DEVTOOLS_ATTEMPT` - Attempted to open DevTools
- `VIEW_SOURCE_ATTEMPT` - Attempted to view source
- `SAVE_ATTEMPT` - Attempted to save page
- `SCREENSHOT_ATTEMPT` - Print Screen pressed
- `FULLSCREEN_EXIT` - Exited fullscreen mode
- `FULLSCREEN_DENIED` - Denied fullscreen request
- `TIME_EXPIRED` - Assessment time limit reached
- `WARNING_THRESHOLD` - 3+ violations detected
- `CRITICAL_VIOLATIONS` - 5+ violations detected

## Implementation

### Hook: `useAssessmentSecurity`

```javascript
import useAssessmentSecurity from '../hooks/useAssessmentSecurity';

const security = useAssessmentSecurity(assessmentId, (violation) => {
  // Called on every violation
  console.log('Violation detected:', violation);
  
  // Send to backend
  api.post('/responses/security-violation', { violation });
});

// Access security state
const {
  violations,           // Array of all violations
  isTabActive,          // Boolean - is tab currently active
  tabSwitchCount,       // Number of tab switches
  copyAttempts,         // Number of copy attempts
  rightClickAttempts,   // Number of right-click attempts
  fullscreenExits,      // Number of fullscreen exits
  timeRemaining,        // Seconds remaining (null if no limit)
  timerStarted,         // Boolean - has timer started
  totalViolations,      // Total violation count
  isHighRisk,           // Boolean - >= 5 violations
  timeExpired,          // Boolean - time limit reached
  formatTime,           // Function to format seconds as MM:SS
  requestFullscreen,    // Function to enter fullscreen
  exitFullscreen,       // Function to exit fullscreen
  startTimer,           // Function to start countdown (minutes)
  getViolationLog,      // Function to get complete log
} = security;
```

### Usage in TakeAssessment

```javascript
// Start timer when assessment loads
useEffect(() => {
  if (assessment.timeLimit) {
    security.startTimer(assessment.timeLimit);
  }
}, [assessment]);

// Auto-submit when time expires
useEffect(() => {
  if (security.timeExpired && !submitted) {
    handleSubmit();
  }
}, [security.timeExpired]);

// Save violations with each response
const autoSave = (questionId, value) => {
  api.post('/responses/save', { 
    questionId, 
    selectedAnswer: value,
    securityLog: security.getViolationLog(),
  });
};

// Submit with complete security log
const handleSubmit = async () => {
  await api.post('/responses/submit', { 
    assessmentId,
    securityLog: security.getViolationLog(),
    totalViolations: security.totalViolations,
  });
};
```

## Backend Integration

The backend should:

1. **Store violation logs** with each response
2. **Flag high-risk assessments** (5+ violations)
3. **Generate reports** showing violation statistics
4. **Alert supervisors** when critical violations occur
5. **Allow HR to review** violation logs before finalizing results

### Recommended Backend Endpoint

```javascript
// POST /responses/security-violation
{
  assessmentId: String,
  userId: String,
  violation: {
    type: String,
    details: String,
    timestamp: ISODate
  }
}
```

## User Experience

### Security Acknowledgment Screen
- Displayed before assessment starts
- Lists all security measures
- Warns about consequences
- Requires explicit consent

### During Assessment
- Timer displayed prominently (if applicable)
- Violations shown in real-time monitor (bottom-right)
- Warning banner after 3 violations
- Critical alert after 5 violations
- Tab switch warnings via toast notifications

### After Submission
- Summary of violations shown
- Categorized by type
- Total count displayed

## Best Practices

1. **Communicate Clearly**
   - Inform users about monitoring before they start
   - Explain why security measures exist
   - Set clear expectations about consequences

2. **Be Fair**
   - Accidental violations happen (tab switch for system alert, etc.)
   - Set reasonable thresholds (3 warnings, 5 critical)
   - Allow supervisors to review context

3. **Technical Limitations**
   - Cannot prevent screenshots (OS-level)
   - Cannot prevent external cameras
   - Cannot prevent second devices
   - Cannot prevent collaboration (remote)

4. **Privacy Considerations**
   - Log violations, not content
   - Store only necessary data
   - Comply with data protection regulations
   - Allow users to review their logs

5. **Accessibility**
   - Ensure keyboard shortcuts don't affect assistive technology
   - Provide alternative methods for users who need them
   - Document accommodations process

## Configuration Options

### Per Assessment
- Enable/disable fullscreen requirement
- Set time limit (or unlimited)
- Set violation thresholds
- Configure auto-submit on time expiry

### Global Settings
- Violation threshold for warnings (default: 3)
- Violation threshold for critical (default: 5)
- Enable/disable real-time monitor
- Enable/disable security acknowledgment screen

## Reporting

### For HR Administrators
- View violation statistics per assessment
- Identify high-risk submissions
- Review individual violation logs
- Generate violation reports

### For Supervisors
- See violation counts for direct reports
- Context for result interpretation
- Flag submissions for review

### For Employees
- View their own violation log
- Understand what triggered flags
- Contest if needed

## Future Enhancements

1. **Webcam Proctoring** (optional)
2. **AI-Based Anomaly Detection**
3. **Biometric Verification**
4. **Randomized Question Order**
5. **Question Pooling** (different questions per user)
6. **IP Address Tracking**
7. **Device Fingerprinting**
8. **Network Traffic Analysis**

---

**Remember:** Security measures should enhance integrity, not create anxiety. 
Balance is key. 🔐
