const logger = require('./logger');

const sendEmail = async (to, subject, html) => {
  try {
    console.log('🔧 Sending via SendGrid API to:', to);
    
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'gumidellibhanuprasad5648@gmail.com', name: 'TaskFlow' },
        subject: subject,
        content: [{ type: 'text/html', value: html }]
      }),
    });

    if (response.ok) {
      console.log('✅ Email sent via SendGrid API');
      return { success: true };
    } else {
      const error = await response.text();
      console.log('❌ SendGrid API error:', error);
      return { success: false, error: error };
    }
    
  } catch (error) {
    console.log('❌ Email error:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail };