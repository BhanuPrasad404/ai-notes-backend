const { Resend } = require('resend');
const logger = require('./logger'); // Make sure this path is correct

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (to, subject, html) => {
  try {
    // Validation
    if (!process.env.RESEND_API_KEY) {
      logger.error('RESEND_API_KEY environment variable is missing');
      return { success: false, error: 'Email service not configured' };
    }

    if (!to || !subject || !html) {
      logger.warn('Missing required email parameters', { to, hasSubject: !!subject, hasHtml: !!html });
      return { success: false, error: 'Missing required email parameters' };
    }

    logger.info('Attempting to send email', { to, subjectLength: subject.length });

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
      subjectLength: subject.length
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