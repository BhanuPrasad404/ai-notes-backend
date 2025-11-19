const { Resend } = require('resend');
const logger = require('./logger');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (to, subject, html) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'TaskFlow <onboarding@resend.dev>',
      to: to,
      subject: subject,
      html: html,
    });

    if (error) {
      logger.error('Resend API error', { error: error.message, to });
      return { success: false, error: error.message };
    }

    logger.info('Email sent successfully', { 
      to, 
      messageId: data.id,
      subject: subject
    });
    
    return { success: true, data };
    
  } catch (error) {
    logger.error('Email service exception', { 
      error: error.message, 
      to,
      stack: error.stack 
    });
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail };