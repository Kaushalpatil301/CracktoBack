import nodemailer from 'nodemailer';

async function testMail() {
  console.log('Testing SMTP connection with Resend...');
  
  const transporter = nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 587,
    auth: {
      user: 'resend',
      pass: 're_b64vwLHe_2AHmpmMJv1xvmAgpfWG9qWYG',
    },
  });

  try {
    const info = await transporter.sendMail({
      from: 'onboarding@resend.dev',
      to: 'onboarding@resend.dev',
      subject: 'Test Email from EventBook',
      text: 'This is a test email to verify SMTP configuration.',
    });
    
    console.log('✅ Mail sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
  }
}

testMail();
