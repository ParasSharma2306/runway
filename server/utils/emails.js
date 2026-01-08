import nodemailer from 'nodemailer';

// Brevo SMTP Configuration
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASS
  }
});

const getHtmlTemplate = (title, bodyContent, actionButton = null) => {
  const year = new Date().getFullYear();
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f7; color: #1d1d1f; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); margin-top: 40px; margin-bottom: 40px; }
        .header { background: #0071E3; padding: 32px; text-align: center; }
        .header h1 { margin: 0; color: #ffffff; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; }
        .content { padding: 40px 32px; line-height: 1.6; font-size: 16px; }
        .btn { display: inline-block; background-color: #0071E3; color: #ffffff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 500; margin-top: 24px; }
        .otp-code { font-size: 32px; font-weight: 700; letter-spacing: 4px; text-align: center; margin: 24px 0; color: #1d1d1f; }
        .footer { background: #f5f5f7; padding: 24px; text-align: center; font-size: 12px; color: #86868b; }
        .quote { border-left: 4px solid #0071E3; padding-left: 16px; color: #555; background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Runway</h1>
        </div>
        <div class="content">
          <h2 style="margin-top: 0; font-size: 20px;">${title}</h2>
          ${bodyContent}
          ${actionButton ? `<div style="text-align: center;"><a href="${actionButton.url}" class="btn" style="color: #ffffff;">${actionButton.text}</a></div>` : ''}
        </div>
        <div class="footer">
          <p>&copy; ${year} Runway. All rights reserved.</p>
          <p>Automated message. Please do not reply directly to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const sendSupportReply = async (recipientEmail, ticketId, messageContent) => {
  const ticketUrl = `${process.env.CLIENT_URL}/ticket.html?id=${ticketId}`;
  
  const html = getHtmlTemplate(
    `Update on Ticket #${ticketId}`,
    `
      <p>Hello,</p>
      <p>A new reply has been posted to your ticket. Here is the message:</p>
      <div class="quote">${messageContent}</div>
      <p>You can view the full conversation and reply by clicking the button below.</p>
    `,
    { text: 'View Ticket', url: ticketUrl }
  );

  return transporter.sendMail({
    from: '"Runway" <noreply@runway.parassharma.in>',
    to: recipientEmail,
    subject: `Update on Ticket #${ticketId}`,
    html
  });
};

export const sendOTP = async (recipientEmail, otp, type = 'verification') => {
  const isReset = type === 'reset';
  const title = isReset ? 'Reset Your Password' : 'Verify Your Account';
  const actionText = isReset ? 'use this code to reset your password' : 'enter this code to verify your account';

  const html = getHtmlTemplate(
    title,
    `
      <p>Hello,</p>
      <p>Please ${actionText}. This code is valid for 10 minutes.</p>
      <div class="otp-code">${otp}</div>
      <p>If you did not request this, please ignore this email.</p>
    `
  );

  return transporter.sendMail({
    from: '"Runway" <noreply@runway.parassharma.in>',
    to: recipientEmail,
    subject: `Here is your ${type} code`,
    html
  });
};