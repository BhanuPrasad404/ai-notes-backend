const nodemailer = require("nodemailer");

let transporter;

// Different setup for development or production
if (process.env.NODE_ENV === "production") {
  // Use Mailgun, Brevo, or any SMTP in production
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
} else {
  // Development setup using Gmail (App Password)
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

const sendEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: `"TaskFlow" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(` Email sent successfully to ${to}`);
  } catch (error) {
    console.error(" Error sending email:", error.message);
  }
};

module.exports = { sendEmail };
