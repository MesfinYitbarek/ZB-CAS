/* services/emailService.js
 * All outbound email logic lives here.  Controllers call these methods;
 * they never construct mail options themselves.
 *
 * Templates are kept minimal (plain + HTML) so that Outlook renders them
 * reliably.  Branding uses Zemen Bank colours: red (#C8102E) & white.
 */
import transporter from '../config/email.js';

const FROM = process.env.EMAIL_FROM || 'Zemen Bank CAS <no-reply@zemenbank.com>';

// ─── helpers ─────────────────────────────────────────────────────────────────
const wrap = (body) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body            { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; }
    .header         { background: #C8102E; color: #fff; padding: 24px 32px; }
    .header h1      { margin: 0; font-size: 22px; }
    .content        { padding: 32px; max-width: 600px; margin: 0 auto; }
    .btn            { display: inline-block; background: #C8102E; color: #fff;
                      padding: 12px 28px; border-radius: 4px; text-decoration: none;
                      font-weight: bold; margin: 16px 0; }
    .footer         { color: #999; font-size: 12px; padding: 24px 32px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="header"><h1>Zemen Bank – Competency Assessment System</h1></div>
  <div class="content">${body}</div>
  <div class="footer">This is an automated message from Zemen Bank CAS. Do not reply.</div>
</body>
</html>`;

// ─── send helper (catches & logs errors) ─────────────────────────────────────
const send = async (to, subject, html, text) => {
  try {
    await transporter.sendMail({ from: FROM, to, subject, html, text });
    return true;
  } catch (err) {
    console.error('[EmailService] Failed to send email:', err.message);
    return false;   // caller can decide whether to surface this
  }
};

// ─── 1. Welcome / registration ──────────────────────────────────────────────
export const sendWelcomeEmail = async (user, tempPassword) => {
  const subject = 'Welcome to Zemen Bank CAS';
  const text    = `Hi ${user.name},\n\nYour account has been created.\nTemporary password: ${tempPassword}\nPlease change it on first login.\n`;
  const html    = wrap(`
    <p>Hi <strong>${user.name}</strong>,</p>
    <p>Your account on the <strong>Competency Assessment System</strong> is now active.</p>
    <p><strong>Temporary password:</strong> <code>${tempPassword}</code></p>
    <p>Please log in and change your password immediately.</p>
  `);
  return send(user.email, subject, html, text);
};

// ─── 2. Assessment scheduled notification ───────────────────────────────────
export const sendAssessmentNotification = async (user, assessment) => {
  const subject = `Assessment Scheduled – ${assessment.description || 'New Assessment'}`;
  const text    = `Hi ${user.name},\n\nA new assessment has been scheduled.\nStart: ${assessment.startDate}\nEnd:   ${assessment.endDate}\n`;
  const html    = wrap(`
    <p>Hi <strong>${user.name}</strong>,</p>
    <p>A new assessment <strong>"${assessment.description || 'Assessment'}"</strong> has been scheduled for you.</p>
    <ul>
      <li><strong>Start:</strong> ${new Date(assessment.startDate).toLocaleString()}</li>
      <li><strong>End:</strong>   ${new Date(assessment.endDate).toLocaleString()}</li>
      ${assessment.timeLimit ? `<li><strong>Time Limit:</strong> ${assessment.timeLimit} minutes</li>` : ''}
    </ul>
    <p>Please log in to begin when ready.</p>
  `);
  return send(user.email, subject, html, text);
};

// ─── 3. Assessment results ready ────────────────────────────────────────────
export const sendResultsEmail = async (user, results) => {
  const subject = 'Your Assessment Results Are Ready';
  const rows    = results.map(
    (r) => `<tr><td style="padding:8px;border:1px solid #ddd">${r.competencyName}</td>
                 <td style="padding:8px;border:1px solid #ddd">${r.finalScore}%</td>
                 <td style="padding:8px;border:1px solid #ddd">${r.level}</td></tr>`
  ).join('');
  const text = `Hi ${user.name},\n\nYour assessment results:\n${results.map(r => `${r.competencyName}: ${r.finalScore}% (${r.level})`).join('\n')}\n`;
  const html = wrap(`
    <p>Hi <strong>${user.name}</strong>,</p>
    <p>Your assessment results are now available:</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr style="background:#C8102E;color:#fff">
        <th style="padding:8px;text-align:left">Competency</th>
        <th style="padding:8px;text-align:left">Score</th>
        <th style="padding:8px;text-align:left">Level</th>
      </tr>
      ${rows}
    </table>
    <p>Log in to view your full Personal Development Plan.</p>
  `);
  return send(user.email, subject, html, text);
};

// ─── 4. Password reset ──────────────────────────────────────────────────────
export const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.CLIENT_ORIGIN || 'http://localhost:3000'}/reset-password/${resetToken}`;
  const subject  = 'Password Reset Request';
  const text     = `Hi ${user.name},\n\nClick the link below to reset your password (expires in 1 hour):\n${resetUrl}\n`;
  const html     = wrap(`
    <p>Hi <strong>${user.name}</strong>,</p>
    <p>You requested a password reset. Click the button below (valid for 1 hour):</p>
    <a class="btn" href="${resetUrl}">Reset Password</a>
    <p style="font-size:12px;color:#999">If you did not request this, please ignore this email.</p>
  `);
  return send(user.email, subject, html, text);
};

// ─── 5. Supervisor reminder ─────────────────────────────────────────────────
export const sendSupervisorReminder = async (supervisor, employeeName, assessment) => {
  const subject = `Reminder: Evaluate ${employeeName}`;
  const text    = `Hi ${supervisor.name},\n\nPlease evaluate ${employeeName} for "${assessment.description || 'Assessment'}". Deadline: ${assessment.endDate}\n`;
  const html    = wrap(`
    <p>Hi <strong>${supervisor.name}</strong>,</p>
    <p>This is a reminder to evaluate <strong>${employeeName}</strong> for the assessment
       <strong>"${assessment.description || 'Assessment'}"</strong>.</p>
    <p><strong>Deadline:</strong> ${new Date(assessment.endDate).toLocaleString()}</p>
    <p>Please log in to complete the evaluation.</p>
  `);
  return send(supervisor.email, subject, html, text);
};

// ─── 6. Assessment reminder (days before deadline) ──────────────────────────
export const sendAssessmentReminderEmail = async (user, assessment) => {
  const now = new Date();
  const deadline = new Date(assessment.endDate);
  const daysLeft = Math.max(1, Math.ceil((deadline - now) / (1000 * 60 * 60 * 24)));
  const subject = `Reminder: "${assessment.description || 'Assessment'}" – Deadline in ${daysLeft} Day(s)`;
  const text    = `Hi ${user.name},\n\nThis is a reminder that the assessment "${assessment.description || 'Assessment'}" deadline is in ${daysLeft} day(s).\nDeadline: ${assessment.endDate}\n`;
  const html    = wrap(`
    <p>Hi <strong>${user.name}</strong>,</p>
    <p>This is a friendly reminder that the following assessment deadline is approaching:</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr>
        <td style="padding:8px;border:1px solid #ddd;background:#f9f9f9;font-weight:bold">Assessment</td>
        <td style="padding:8px;border:1px solid #ddd">${assessment.description || 'Assessment'}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #ddd;background:#f9f9f9;font-weight:bold">Deadline</td>
        <td style="padding:8px;border:1px solid #ddd;color:#C8102E;font-weight:bold">${new Date(assessment.endDate).toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #ddd;background:#f9f9f9;font-weight:bold">Days Remaining</td>
        <td style="padding:8px;border:1px solid #ddd">${daysLeft} day(s)</td>
      </tr>
    </table>
    <p>Please log in and complete your assessment before the deadline.</p>
  `);
  return send(user.email, subject, html, text);
};
