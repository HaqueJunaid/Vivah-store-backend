import nodemailer from 'nodemailer';
import { config } from '../config/config.js';

const transporter = nodemailer.createTransport({
    service: config.email.service,
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: {
        user: config.email.user,
        pass: config.email.password,
    },
});

// Verify transporter connection
transporter.verify((error, success) => {
    if (error) {
        console.log('Email service error:', error);
    } else {
        console.log('Email service is ready to send messages');
    }
});

// Verification Email
export const sendOTPEmail = async (email, otp, userName) => {
    const mailOptions = {
        from: config.email.user,
        to: email,
        subject: 'Email Verification - OTP',
        html: emailTemplates.otpVerification(userName, otp),
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        return { success: true, message: 'OTP sent to email' };
    } catch (error) {
        console.error('Error sending OTP email:', error);
        throw new Error('Failed to send OTP email');
    }
};

// Welcome Email
export const sendWelcomeEmail = async (email, userName) => {
    const mailOptions = {
        from: config.email.user,
        to: email,
        subject: 'Welcome to Our Service',
        html: emailTemplates.welcomeEmail(userName),
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Welcome email sent:', info.response);
        return { success: true, message: 'Welcome email sent' };
    } catch (error) {
        console.error('Error sending welcome email:', error);
        throw new Error('Failed to send welcome email');
    }
};

// Contact Form Notification Email to Owner
export const sendContactEmail = async (name, email, phone, message) => {
    const mailOptions = {
        from: config.email.user,
        to: config.email.user,
        replyTo: email,
        subject: `New VivahStore Contact Message from ${name}`,
        html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; }
                    .header { border-bottom: 2px solid #e41f66; padding-bottom: 10px; margin-bottom: 20px; }
                    .header h2 { color: #e41f66; margin: 0; }
                    .field { margin-bottom: 15px; }
                    .label { font-weight: bold; color: #666; display: block; font-size: 12px; text-transform: uppercase; }
                    .value { font-size: 15px; color: #222; }
                    .message-box { background: #f9f9f9; border-left: 4px solid #e41f66; padding: 15px; margin-top: 10px; font-style: italic; border-radius: 4px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>New Contact Form Submission</h2>
                    </div>
                    <div class="field">
                        <span class="label">Sender Name</span>
                        <span class="value">${name}</span>
                    </div>
                    <div class="field">
                        <span class="label">Email Address</span>
                        <span class="value"><a href="mailto:${email}">${email}</a></span>
                    </div>
                    <div class="field">
                        <span class="label">Phone Number</span>
                        <span class="value">${phone || 'Not provided'}</span>
                    </div>
                    <div class="field">
                        <span class="label">Message</span>
                        <div class="message-box">${message.replace(/\\n/g, '<br/>')}</div>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Contact form email sent:', info.response);
        return { success: true, message: 'Contact email sent to owner' };
    } catch (error) {
        console.error('Error sending contact email:', error);
        throw new Error('Failed to send contact email');
    }
};

// Email Tempelate
const emailTemplates = {
    otpVerification: (name, otp) => `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    background-color: #faf9f6;
                    margin: 0;
                    padding: 40px 20px;
                }
                .container {
                    max-width: 560px;
                    margin: 0 auto;
                    background-color: #ffffff;
                    padding: 40px;
                    border-radius: 24px;
                    border: 1px solid #f0ece6;
                    box-shadow: 0 8px 30px rgba(0,0,0,0.02);
                }
                .header {
                    text-align: center;
                    margin-bottom: 35px;
                }
                .header h1 {
                    color: #e41f66;
                    margin: 0;
                    font-size: 32px;
                    font-weight: 800;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                }
                .header h4 {
                    color: #888888;
                    margin: 5px 0 0 0;
                    font-size: 11px;
                    font-weight: 600;
                    letter-spacing: 0.2em;
                    text-transform: uppercase;
                }
                .content {
                    color: #555555;
                    line-height: 1.7;
                    font-size: 14px;
                }
                .greeting {
                    font-size: 16px;
                    color: #111111;
                    font-weight: 600;
                    margin-bottom: 15px;
                }
                .otp-box {
                    background: linear-gradient(135deg, #fff0f3 0%, #ffe5ec 100%);
                    border: 1px dashed #e41f66;
                    padding: 24px;
                    border-radius: 16px;
                    text-align: center;
                    margin: 30px 0;
                }
                .otp-code {
                    font-size: 36px;
                    font-weight: 800;
                    color: #e41f66;
                    letter-spacing: 6px;
                    font-family: 'Courier New', monospace;
                }
                .warning {
                    background-color: #fff9fa;
                    border-left: 3px solid #e41f66;
                    padding: 18px;
                    margin: 30px 0 15px 0;
                    border-radius: 8px;
                    font-size: 12px;
                    color: #777777;
                    line-height: 1.6;
                }
                .footer {
                    text-align: center;
                    color: #a0a0a0;
                    font-size: 11px;
                    border-top: 1px solid #f2ede7;
                    padding-top: 25px;
                    margin-top: 40px;
                    line-height: 1.6;
                }
                .footer p {
                    margin: 4px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Vivah Store</h1>
                    <h4>Security Verification</h4>
                </div>
                
                <div class="content">
                    <div class="greeting">Hi ${name},</div>
                    <p>Thank you for signing up with Vivah Store. To verify your email address and activate your account, please enter the One-Time Password (OTP) below:</p>
                    
                    <div class="otp-box">
                        <div class="otp-code">${otp}</div>
                    </div>
                    
                    <p>This code is temporary and will expire in 10 minutes. If you did not request this verification, please ignore this message.</p>
                    
                    <div class="warning">
                        <strong>Security Reminder:</strong> Never share this verification code with anyone. Our concierge and support superhumans will never request your OTP.
                    </div>
                </div>
                
                <div class="footer">
                    <p><strong>Vivah Store Stationery &amp; Graphic Studio</strong></p>
                    <p>Surat, Gujarat, India</p>
                    <p>This is an automated security notice. Please do not reply directly.</p>
                </div>
            </div>
        </body>
        </html>
    `,

    welcomeEmail: (name) => `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    background-color: #faf9f6;
                    margin: 0;
                    padding: 40px 20px;
                }
                .container {
                    max-width: 560px;
                    margin: 0 auto;
                    background-color: #ffffff;
                    padding: 40px;
                    border-radius: 24px;
                    border: 1px solid #f0ece6;
                    box-shadow: 0 8px 30px rgba(0,0,0,0.02);
                }
                .header {
                    text-align: center;
                    margin-bottom: 35px;
                }
                .header h1 {
                    color: #e41f66;
                    margin: 0;
                    font-size: 32px;
                    font-weight: 800;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                }
                .header h4 {
                    color: #888888;
                    margin: 5px 0 0 0;
                    font-size: 11px;
                    font-weight: 600;
                    letter-spacing: 0.2em;
                    text-transform: uppercase;
                }
                .content {
                    color: #555555;
                    line-height: 1.7;
                    font-size: 14px;
                }
                .greeting {
                    font-size: 20px;
                    color: #111111;
                    font-weight: 700;
                    margin-bottom: 15px;
                    text-align: center;
                }
                .button-container {
                    text-align: center;
                    margin: 35px 0 20px 0;
                }
                .button {
                    display: inline-block;
                    background-color: #e41f66;
                    color: #ffffff !important;
                    padding: 14px 35px;
                    border-radius: 12px;
                    text-decoration: none;
                    font-weight: 700;
                    font-size: 13px;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    box-shadow: 0 4px 15px rgba(228, 31, 102, 0.2);
                    transition: background-color 0.3s;
                }
                .button:hover {
                    background-color: #c60b4d;
                }
                .footer {
                    text-align: center;
                    color: #a0a0a0;
                    font-size: 11px;
                    border-top: 1px solid #f2ede7;
                    padding-top: 25px;
                    margin-top: 40px;
                    line-height: 1.6;
                }
                .footer p {
                    margin: 4px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Vivah Store</h1>
                    <h4>Welcome to the Family</h4>
                </div>
                
                <div class="content">
                    <div class="greeting">Welcome, ${name}! 🎉</div>
                    <p>We are absolutely thrilled to welcome you to Vivah Store. Your email address has been successfully verified, and your premium account is now active.</p>
                    
                    <p>As a member of Vivah Store, you gain access to our custom graphic studio, luxury wedding template designs, custom acrylic welcome boards, room itineraries, and elegant hampers designed to make your celebrations truly unforgettable.</p>
                    
                    <div class="button-container">
                        <a href="https://vivahstore.vercel.app/" class="button" target="_blank">Explore Collections</a>
                    </div>
                    
                    <p>If you need any custom support or want to discuss a customized order, feel free to reply directly or contact our studio concierge.</p>
                </div>
                
                <div class="footer">
                    <p><strong>Vivah Store Stationery &amp; Graphic Studio</strong></p>
                    <p>Surat, Gujarat, India</p>
                    <p>Thank you for choosing luxury. Enjoy your journey with us!</p>
                </div>
            </div>
        </body>
        </html>
    `,
};
