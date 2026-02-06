/* config/email.js
 * Creates and exports a pre-configured Nodemailer transporter.
 * Used by the notification service for assessment scheduling, results, etc.
 */
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: process.env.SMTP_SECURE === 'true',   // true = TLS from the start (port 465)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // Outlook / Office 365 sometimes needs this:
  tls: { rejectUnauthorized: true },
});

module.exports = transporter;
