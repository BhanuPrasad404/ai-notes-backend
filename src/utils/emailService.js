const logger = require('./logger');

const sendEmail = async (to, subject, html) => {
  try {
    logger.info('Attempting to send email', { to, subjectLength: subject.length });
    
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'bhanuprasadgummidelli@gmail.com', name: 'TaskFlow' },
        subject: subject,
        content: [{ type: 'text/html', value: html }]
      }),
    });

    if (response.ok) {
      logger.info('Email sent successfully', { to, subject });
      return { success: true };
    } else {
      const error = await response.text();
      logger.error('SendGrid API error', { error, to, subject });
      return { success: false, error: error };
    }
    
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