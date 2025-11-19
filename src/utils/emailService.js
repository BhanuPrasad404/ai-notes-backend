const nodemailer = require("nodemailer");
const logger = require('./logger');

const transporter = nodemailer.createTransporter({
  host: "smtp.sendgrid.net",
  port: 587,
  auth: {
    user: "apikey",
    pass: process.env.SENDGRID_API_KEY,
  },
});

const sendEmail = async (to, subject, html) => {
  try {
    const result = await transporter.sendMail({
      from: '"TaskFlow" <gumidellibhanuprasad5648@gmail.com>',
      to: to,
      subject: subject,
      html: html,
    });
    
    logger.info('Email sent successfully', { 
      to, 
      messageId: result.messageId,
      subject: subject
    });
    
    return { success: true, data: result };
    
  } catch (error) {
    logger.error('Email sending failed', { 
      error: error.message, 
      to
    });
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail };