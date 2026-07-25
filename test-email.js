import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.resend.com',
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

console.log('Testing SMTP Connection with:', {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_SECURE,
    user: process.env.EMAIL_USER,
    from: process.env.EMAIL_FROM
});

transporter.verify((error, success) => {
    if (error) {
        console.error('SMTP Connection Error:', error);
    } else {
        console.log('SMTP Connection Successful!');
        
        // Try sending an actual email
        transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: process.env.EMAIL_FROM.match(/<([^>]+)>/) ? process.env.EMAIL_FROM.match(/<([^>]+)>/)[1] : 'onboarding@resend.dev',
            subject: 'Test Email',
            text: 'This is a test email to verify configuration.'
        }, (err, info) => {
            if (err) {
                console.error('Failed to send test email:', err);
            } else {
                console.log('Test email sent successfully!', info.messageId);
            }
        });
    }
});
