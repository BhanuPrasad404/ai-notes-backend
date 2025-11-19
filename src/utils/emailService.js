const nodemailer = require("nodemailer");
const logger = require('./logger');

const transporter = nodemailer.createTransport({
  host: "smtp.sendgrid.net",
  port: 587,
  auth: {
    user: "apikey",
    pass: process.env.SENDGRID_API_KEY,
  },
});

const sendEmail = async (to, subject, html) => {
  try {
    console.log('🔧 Attempting to send email to:', to);
    console.log('🔧 SendGrid API Key exists:', !!process.env.SENDGRID_API_KEY);
    console.log('🔧 SendGrid API Key length:', process.env.SENDGRID_API_KEY?.length);

    const result = await transporter.sendMail({
      from: '"TaskFlow" <gumidellibhanuprasad5648@gmail.com>',
      to: to,
      subject: subject,
      html: html,
    });
    
    console.log('✅ Email sent successfully:', result);
    logger.info('Email sent successfully', { to });
    return { success: true, data: result };
    
  } catch (error) {
    console.log('❌ Email error:', error.message);
    console.log('❌ Full error:', error);
    logger.error('Email sending failed', { error: error.message, to });
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail };