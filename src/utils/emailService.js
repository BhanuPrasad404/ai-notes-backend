const nodemailer = require("nodemailer");
const logger = require('./logger');

let transporter;

if (process.env.NODE_ENV === "production") {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
} else {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const sendEmail = async (to, subject, html) => {
  try {
    const result = await transporter.sendMail({
      from: `"TaskFlow" <${process.env.SMTP_USER}>`,
      to: to,
      subject: subject,
      html: html,
    });
    
    logger.info('Email sent successfully', { to, messageId: result.messageId });
    return { success: true, data: result };
    
  } catch (error) {
    logger.error('Email sending failed', { error: error.message, to });
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail };